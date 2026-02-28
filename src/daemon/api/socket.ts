// Daemon — Unix domain socket IPC for `jeriko ask`.
// Provides a low-latency local communication channel between the CLI and daemon.

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
  method: "ask" | "status" | "sessions" | "stop";
  params?: Record<string, unknown>;
}

/** An IPC response from the daemon to the CLI. */
export interface IpcResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** Handler for a specific IPC method. */
export type IpcMethodHandler = (
  params: Record<string, unknown>,
) => Promise<IpcResponse["data"]>;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let server: net.Server | null = null;
const handlers = new Map<string, IpcMethodHandler>();
const socketPath = path.join(path.join(os.homedir(), ".jeriko"), "daemon.sock");

// ---------------------------------------------------------------------------
// Public API — Server (daemon side)
// ---------------------------------------------------------------------------

/**
 * Register an IPC method handler.
 */
export function registerMethod(method: string, handler: IpcMethodHandler): void {
  handlers.set(method, handler);
}

/**
 * Start the Unix domain socket server.
 * Binds to `~/.local/share/jeriko/jeriko.sock`.
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

  server = net.createServer((conn) => {
    let buffer = "";

    conn.on("data", (chunk) => {
      buffer += chunk.toString();
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
 * Send a request to the daemon via the Unix socket and wait for a response.
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

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        conn.destroy();
        reject(new Error(`IPC request timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

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
          const response = JSON.parse(line) as IpcResponse;
          if (response.id === request.id) {
            resolved = true;
            clearTimeout(timer);
            conn.end();
            resolve(response);
            return;
          }
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
