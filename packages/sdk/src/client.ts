// JerikoClient — HTTP/Unix-socket client for the Jeriko daemon API.

import type {
  AgentTurnEvent,
  AuditEvent,
  ChannelStatus,
  ConnectorResult,
  HealthEvent,
  JerikoResult,
  Session,
} from "@jeriko/protocol";
import { JerikoError, fromErrorJSON, ErrorCode } from "@jeriko/protocol";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Configuration for the Jeriko client. */
export interface JerikoClientOptions {
  /** Base URL of the Jeriko daemon (default: "http://localhost:3000"). */
  baseUrl?: string;
  /** Bearer token for authentication. */
  token?: string;
  /** Unix socket path — overrides baseUrl for local IPC. */
  socketPath?: string;
  /** Request timeout in milliseconds (default: 30000). */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * HTTP client for the Jeriko daemon.
 *
 * Supports both TCP (http://host:port) and Unix domain sockets for local IPC.
 * Uses native `fetch()` — no external HTTP dependencies.
 *
 * @example
 * ```ts
 * const client = new JerikoClient({ token: "my-secret" });
 *
 * // Stream a chat
 * for await (const turn of client.chat("What is the weather?")) {
 *   console.log(turn.content);
 * }
 *
 * // List channels
 * const channels = await client.listChannels();
 * ```
 */
export class JerikoClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly socketPath: string | undefined;
  private readonly timeout: number;

  constructor(options: JerikoClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://localhost:3000";
    this.token = options.token;
    this.socketPath = options.socketPath;
    this.timeout = options.timeout ?? 30_000;
  }

  // =========================================================================
  // Agent
  // =========================================================================

  /**
   * Send a message to the agent and stream back turn events.
   *
   * Opens an SSE connection to the chat endpoint and yields
   * `AgentTurnEvent` objects as they arrive.
   */
  async *chat(
    message: string,
    sessionId?: string,
  ): AsyncGenerator<AgentTurnEvent, void, undefined> {
    const body: Record<string, unknown> = { message };
    if (sessionId) body.session_id = sessionId;

    const response = await this.fetch("/chat", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Accept": "text/event-stream" },
    });

    if (!response.body) {
      throw new JerikoError("No response body for chat stream", ErrorCode.GENERAL, 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") return;
          try {
            const event = JSON.parse(json) as AgentTurnEvent;
            yield event;
          } catch {
            // Skip malformed SSE data lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // =========================================================================
  // Sessions
  // =========================================================================

  /** List stored chat sessions. */
  async listSessions(limit?: number): Promise<Session[]> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    const qs = params.toString();
    const path = qs ? `/sessions?${qs}` : "/sessions";
    return this.get<Session[]>(path);
  }

  /** Get a single session by ID. */
  async getSession(id: string): Promise<Session> {
    return this.get<Session>(`/sessions/${encodeURIComponent(id)}`);
  }

  // =========================================================================
  // Channels
  // =========================================================================

  /** List all registered messaging channels and their status. */
  async listChannels(): Promise<ChannelStatus[]> {
    return this.get<ChannelStatus[]>("/channel");
  }

  /** Connect a messaging channel by name. */
  async connectChannel(name: string): Promise<void> {
    await this.post<void>(`/channel/${encodeURIComponent(name)}/connect`);
  }

  /** Disconnect a messaging channel by name. */
  async disconnectChannel(name: string): Promise<void> {
    await this.post<void>(`/channel/${encodeURIComponent(name)}/disconnect`);
  }

  // =========================================================================
  // Connectors
  // =========================================================================

  /** Call a connector method (e.g. Stripe charges.create). */
  async callConnector(
    name: string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    const result = await this.post<ConnectorResult>(
      `/connectors/${encodeURIComponent(name)}/call`,
      { method, params },
    );
    return result;
  }

  // =========================================================================
  // Health
  // =========================================================================

  /** Check daemon health. */
  async health(): Promise<HealthEvent> {
    return this.get<HealthEvent>("/health");
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /** Build request headers including auth. */
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...extra,
    };
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }

  /** Core fetch wrapper with error handling. */
  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = this.buildUrl(path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        headers: this.headers(init.headers as Record<string, string> | undefined),
        signal: controller.signal,
        // Unix socket support — Bun supports the `unix` option natively.
        // Node.js requires an Agent; we pass `unix` for Bun compatibility.
        ...(this.socketPath ? { unix: this.socketPath } as Record<string, unknown> : {}),
      });

      if (!response.ok) {
        const body = await response.text();
        let parsed: { error: string; code: number } | undefined;
        try {
          parsed = JSON.parse(body);
        } catch {
          // Not JSON — wrap raw body
        }

        if (parsed && typeof parsed.error === "string" && typeof parsed.code === "number") {
          throw fromErrorJSON(parsed);
        }
        throw new JerikoError(
          body || `HTTP ${response.status}`,
          ErrorCode.GENERAL,
          response.status,
        );
      }

      return response;
    } catch (err) {
      if (err instanceof JerikoError) throw err;

      const error = err as Error;
      if (error.name === "AbortError") {
        throw new JerikoError("Request timed out", ErrorCode.TIMEOUT, 504);
      }
      throw new JerikoError(
        error.message ?? "Fetch failed",
        ErrorCode.NETWORK,
        502,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET request that unwraps the JerikoResult envelope. */
  private async get<T>(path: string): Promise<T> {
    const response = await this.fetch(path, { method: "GET" });
    const json = (await response.json()) as JerikoResult<T>;
    if (!json.ok) {
      throw fromErrorJSON(json as { error: string; code: number });
    }
    return (json as { ok: true; data: T }).data;
  }

  /** POST request that unwraps the JerikoResult envelope. */
  private async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.fetch(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!text) return undefined as T;
    const json = JSON.parse(text) as JerikoResult<T>;
    if (!json.ok) {
      throw fromErrorJSON(json as { error: string; code: number });
    }
    return (json as { ok: true; data: T }).data;
  }

  /** Build the full URL for a request path. */
  private buildUrl(path: string): string {
    // When using a Unix socket, fetch still needs a valid URL.
    // The hostname is ignored; the socket path is what matters.
    if (this.socketPath) {
      return `http://localhost${path}`;
    }
    return `${this.baseUrl}${path}`;
  }
}
