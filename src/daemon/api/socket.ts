// Daemon — Unix domain socket IPC for CLI ↔ daemon communication.
// Supports two modes:
//   1. Request-response (sendRequest) — for simple methods like status, sessions, stop.
//   2. Streaming (sendStreamRequest) — for long-running methods like ask.
//      The daemon emits incremental events as newline-delimited JSON,
//      allowing the CLI to display progress in real-time and avoid
//      timeout issues with complex agent operations (multi-delegate, fan-out).
//
// Wire protocol (newline-delimited JSON over Unix domain socket):
//   Request:      { id, method, params? }
//   Stream event: { id, stream: true, event: { type, ... } }
//   Final:        { id, ok: true/false, data?, error? }
//
// Both sendRequest and sendStreamRequest are compatible with streaming methods:
//   - sendRequest skips stream events and waits for the final response,
//     resetting its idle timer on each received event (backward compat).
//   - sendStreamRequest yields stream events and completes on the final response.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as net from "node:net";
import { randomUUID } from "node:crypto";
import { getLogger } from "../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An IPC request from the CLI to the daemon. */
export interface IpcRequest {
  id: string;
  method:
    | "ask"
    | "status"
    | "sessions"
    | "new_session"
    | "resume_session"
    | "stop"
    | "channels"
    | "channel_connect"
    | "channel_disconnect"
    | "history"
    | "clear_history"
    | "compact"
    | "models"
    | "connectors"
    | "connector_connect"
    | "connector_disconnect"
    | "connector_health"
    | "triggers"
    | "trigger_enable"
    | "trigger_disable"
    | "tasks"
    | "task_create"
    | "task_info"
    | "task_pause"
    | "task_resume"
    | "task_delete"
    | "task_test"
    | "task_log"
    | "task_types"
    | "skills"
    | "skill_detail"
    | "config"
    | "share"
    | "share_revoke"
    | "shares"
    | "billing.plan"
    | "billing.checkout"
    | "billing.portal"
    | "billing.events"
    | "update_session"
    | "providers.list"
    | "providers.add"
    | "providers.remove";
  params?: Record<string, unknown>;
}

/** An IPC response from the daemon to the CLI (also serves as stream end marker). */
export interface IpcResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** An incremental stream event from the daemon during a streaming method. */
export interface IpcStreamEvent {
  id: string;
  stream: true;
  event: Record<string, unknown>;
}

/** Handler for a request-response IPC method (status, sessions, stop). */
export type IpcMethodHandler = (
  params: Record<string, unknown>,
) => Promise<IpcResponse["data"]>;

/**
 * Handler for a streaming IPC method (ask).
 * Receives an `emit` callback to send incremental events to the client.
 * The returned value becomes the `data` field of the final IpcResponse.
 */
export type IpcStreamHandler = (
  params: Record<string, unknown>,
  emit: (event: Record<string, unknown>) => void,
) => Promise<unknown>;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let server: net.Server | null = null;
const handlers = new Map<string, IpcMethodHandler>();
const streamHandlers = new Map<string, IpcStreamHandler>();
const socketPath = path.join(path.join(os.homedir(), ".jeriko"), "daemon.sock");

// ---------------------------------------------------------------------------
// Public API — Server (daemon side)
// ---------------------------------------------------------------------------

/**
 * Register a request-response IPC method handler.
 * Use for short-lived operations (status, sessions, stop).
 */
export function registerMethod(method: string, handler: IpcMethodHandler): void {
  handlers.set(method, handler);
}

/**
 * Register a streaming IPC method handler.
 * Use for long-running operations (ask) that need to emit incremental events.
 *
 * The handler receives an `emit` callback — each call sends a stream event
 * to the client. When the handler returns, a final IpcResponse is sent with
 * the returned data. If the handler throws, an error response is sent.
 *
 * Stream handlers take priority over regular handlers for the same method.
 */
export function registerStreamMethod(method: string, handler: IpcStreamHandler): void {
  streamHandlers.set(method, handler);
}

/**
 * Start the Unix domain socket server.
 * Binds to `~/.jeriko/daemon.sock`.
 */
export function startSocketServer(): net.Server {
  if (server) {
    log.warn("IPC socket server already running");
    return server;
  }

  // Clean up stale socket file
  if (fs.existsSync(socketPath)) {
    try {
      fs.unlinkSync(socketPath);
    } catch {
      throw new Error(`Cannot remove stale socket: ${socketPath}`);
    }
  }

  const dir = path.dirname(socketPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const MAX_IPC_BUFFER = 10 * 1024 * 1024; // 10MB max buffer per connection

  server = net.createServer((conn) => {
    let buffer = "";

    conn.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > MAX_IPC_BUFFER) {
        log.warn("IPC buffer exceeded 10MB — closing connection");
        conn.destroy();
        return;
      }
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        handleMessage(conn, line.trim());
      }
    });

    conn.on("error", (err) => {
      log.debug(`IPC connection error: ${err.message}`);
    });
  });

  server.listen(socketPath, () => {
    try { fs.chmodSync(socketPath, 0o600); } catch { /* best effort */ }
    log.info(`IPC socket listening on ${socketPath}`);
  });

  server.on("error", (err) => {
    log.error(`IPC socket server error: ${err.message}`);
  });

  return server;
}

/**
 * Stop the Unix domain socket server.
 */
export function stopSocketServer(): void {
  if (!server) return;

  server.close();
  server = null;

  try {
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  } catch { /* best effort */ }

  log.info("IPC socket server stopped");
}

// ---------------------------------------------------------------------------
// Public API — Client (CLI side)
// ---------------------------------------------------------------------------

/**
 * Send a request to the daemon and wait for the final response.
 *
 * Compatible with both regular and streaming methods:
 * - For regular methods, resolves immediately on the response.
 * - For streaming methods, silently skips stream events and resolves
 *   on the final response. Resets the idle timer on each received event
 *   so the connection stays alive during long-running operations.
 */
export function sendRequest(
  method: IpcRequest["method"],
  params?: Record<string, unknown>,
  timeoutMs: number = 30_000,
): Promise<IpcResponse> {
  return new Promise<IpcResponse>((resolve, reject) => {
    const request: IpcRequest = { id: randomUUID(), method, params };

    const conn = net.createConnection(socketPath);
    let buffer = "";
    let resolved = false;

    // Idle timeout — resets on each received message (stream event or final).
    // This prevents timeout during long-running streaming operations where
    // events arrive periodically but the total duration exceeds timeoutMs.
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          conn.destroy();
          reject(new Error(`IPC request timed out after ${timeoutMs}ms of inactivity`));
        }
      }, timeoutMs);
    };

    resetTimer();

    conn.on("connect", () => {
      conn.write(JSON.stringify(request) + "\n");
    });

    conn.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id !== request.id) continue;

          if (parsed.stream) {
            // Stream event — reset idle timer, skip the event itself
            resetTimer();
            continue;
          }

          // Final response — resolve
          resolved = true;
          clearTimeout(timer);
          conn.end();
          resolve(parsed as IpcResponse);
          return;
        } catch { /* skip malformed */ }
      }
    });

    conn.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new Error(`IPC connection failed: ${err.message}`));
      }
    });

    conn.on("close", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new Error("IPC connection closed before response"));
      }
    });
  });
}

/**
 * Send a streaming request to the daemon.
 * Yields incremental events as they arrive, completing when the final response is received.
 *
 * Uses an activity-based idle timeout: the timer resets on each received event.
 * As long as the daemon keeps sending events (text deltas, tool calls, etc.),
 * the connection stays alive indefinitely. Only fires if no data arrives
 * for `idleTimeoutMs` — which indicates the daemon is hung or the agent
 * loop is stuck.
 *
 * @param method    The IPC method to call (e.g. "ask")
 * @param params    Method parameters
 * @param options   Stream options: idleTimeoutMs (default 120s), signal for cancellation
 *
 * @example
 * ```ts
 * for await (const event of sendStreamRequest("ask", { message: "hello" })) {
 *   if (event.type === "text_delta") process.stdout.write(event.content as string);
 * }
 * ```
 */
export async function* sendStreamRequest(
  method: IpcRequest["method"],
  params?: Record<string, unknown>,
  options?: { idleTimeoutMs?: number; signal?: AbortSignal },
): AsyncGenerator<Record<string, unknown>, IpcResponse | void> {
  const idleTimeoutMs = options?.idleTimeoutMs ?? 120_000;
  const signal = options?.signal;

  const request: IpcRequest = { id: randomUUID(), method, params };

  // Buffered event queue — populated by socket data handler,
  // consumed by the async generator loop.
  const eventQueue: Array<Record<string, unknown>> = [];
  let finalResponse: IpcResponse | null = null;
  let connectionError: Error | null = null;
  let resolveWaiter: (() => void) | null = null;

  // Notify the generator loop that new data is available.
  const notify = () => {
    if (resolveWaiter) {
      const fn = resolveWaiter;
      resolveWaiter = null;
      fn();
    }
  };

  // Wait for data to arrive in the event queue.
  const waitForData = (): Promise<void> =>
    new Promise<void>((resolve) => {
      // Already have data or error — resolve immediately
      if (eventQueue.length > 0 || finalResponse || connectionError) {
        resolve();
        return;
      }
      resolveWaiter = resolve;
    });

  const conn = net.createConnection(socketPath);
  let buffer = "";
  let done = false;

  // Idle timeout management
  let timer: ReturnType<typeof setTimeout> | undefined;
  const resetTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!done) {
        done = true;
        connectionError = new Error(`IPC stream timed out after ${idleTimeoutMs}ms of inactivity`);
        conn.destroy();
        notify();
      }
    }, idleTimeoutMs);
  };

  resetTimer();

  conn.on("connect", () => {
    conn.write(JSON.stringify(request) + "\n");
  });

  conn.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.id !== request.id) continue;

        resetTimer();

        if (parsed.stream) {
          // Stream event — queue for the generator
          eventQueue.push(parsed.event);
          notify();
        } else {
          // Final response — signal completion
          finalResponse = parsed as IpcResponse;
          notify();
        }
      } catch { /* skip malformed */ }
    }
  });

  conn.on("error", (err) => {
    if (!done) {
      connectionError = new Error(`IPC stream connection failed: ${err.message}`);
      notify();
    }
  });

  conn.on("close", () => {
    if (!done && !finalResponse) {
      connectionError = new Error("IPC stream connection closed before completion");
      notify();
    }
    // If we already have finalResponse, close is expected
    notify();
  });

  // AbortSignal handler
  const onAbort = () => {
    if (!done) {
      done = true;
      connectionError = new Error("IPC stream aborted");
      conn.destroy();
      notify();
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  // Generator loop — yield events until final response or error
  try {
    while (true) {
      // Drain queued events first
      while (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      }

      // Check termination conditions
      if (connectionError) {
        throw connectionError;
      }
      if (finalResponse) {
        const resp = finalResponse as IpcResponse;
        if (!resp.ok) {
          throw new Error(resp.error ?? "Daemon stream request failed");
        }
        return resp;
      }

      // Wait for more data
      await waitForData();
    }
  } finally {
    done = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    if (!conn.destroyed) conn.end();
  }
}

/**
 * Check if the daemon is running by probing the socket.
 */
export async function isDaemonRunning(): Promise<boolean> {
  if (!fs.existsSync(socketPath)) return false;

  try {
    const response = await sendRequest("status", undefined, 3000);
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function handleMessage(conn: net.Socket, raw: string): Promise<void> {
  let request: IpcRequest;
  try {
    request = JSON.parse(raw) as IpcRequest;
  } catch {
    const resp: IpcResponse = { id: "", ok: false, error: "Invalid JSON" };
    conn.write(JSON.stringify(resp) + "\n");
    return;
  }

  // Check for stream handler first (takes priority over regular handler)
  const streamHandler = streamHandlers.get(request.method);
  if (streamHandler) {
    const emit = (event: Record<string, unknown>) => {
      if (!conn.destroyed) {
        const msg: IpcStreamEvent = { id: request.id, stream: true, event };
        conn.write(JSON.stringify(msg) + "\n");
      }
    };

    try {
      const data = await streamHandler(request.params ?? {}, emit);
      if (!conn.destroyed) {
        conn.write(JSON.stringify({ id: request.id, ok: true, data } satisfies IpcResponse) + "\n");
      }
    } catch (err) {
      if (!conn.destroyed) {
        const resp: IpcResponse = {
          id: request.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        conn.write(JSON.stringify(resp) + "\n");
      }
    }
    return;
  }

  // Fall through to regular request-response handler
  const handler = handlers.get(request.method);
  if (!handler) {
    const resp: IpcResponse = {
      id: request.id,
      ok: false,
      error: `Unknown method: ${request.method}`,
    };
    conn.write(JSON.stringify(resp) + "\n");
    return;
  }

  try {
    const data = await handler(request.params ?? {});
    conn.write(JSON.stringify({ id: request.id, ok: true, data } satisfies IpcResponse) + "\n");
  } catch (err) {
    const resp: IpcResponse = {
      id: request.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    conn.write(JSON.stringify(resp) + "\n");
  }
}
