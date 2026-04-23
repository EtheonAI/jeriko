// Streamable HTTP transport — POST JSON-RPC to a remote MCP endpoint.
//
// The simple case is request/response: each call becomes one fetch. Servers
// that want to stream progress use SSE in their response body; we support
// both. We use the global `fetch` so this runs unchanged on Bun and Node.

import {
  McpTransportError,
  type Transport,
} from "./transport.js";
import type { JsonRpcMessage } from "./protocol.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

export interface HttpTransportOptions {
  endpoint: string;
  /** Optional static headers (Authorization, custom auth). */
  headers?: Readonly<Record<string, string>>;
}

export class HttpTransport implements Transport {
  readonly descriptor: string;

  private messageHandler: ((m: JsonRpcMessage) => void) | undefined;
  private errorHandler: ((e: McpTransportError) => void) | undefined;
  private closed = false;

  constructor(private readonly opts: HttpTransportOptions) {
    this.descriptor = `http:${opts.endpoint}`;
  }

  onMessage(handler: (m: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (e: McpTransportError) => void): void {
    this.errorHandler = handler;
  }

  async start(): Promise<void> {
    // HTTP transports are stateless — `start()` is a no-op so callers can
    // use the same lifecycle as stdio.
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (this.closed) {
      throw new McpTransportError(`HTTP transport closed (${this.descriptor})`);
    }

    let res: Response;
    try {
      res = await fetch(this.opts.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          ...(this.opts.headers ?? {}),
        },
        body: JSON.stringify(message),
      });
    } catch (err) {
      throw new McpTransportError(`HTTP fetch failed (${this.descriptor})`, err);
    }

    if (!res.ok) {
      const body = await safeReadText(res);
      throw new McpTransportError(
        `MCP HTTP error ${res.status} (${this.descriptor}): ${body.slice(0, 256)}`,
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      await this.consumeSse(res);
      return;
    }

    const text = await safeReadText(res);
    if (!text) return; // server accepted notification without body
    try {
      const parsed = JSON.parse(text) as JsonRpcMessage;
      this.messageHandler?.(parsed);
    } catch (err) {
      log.warn(`MCP ${this.descriptor}: malformed JSON body`);
      throw new McpTransportError("malformed JSON response", err);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async consumeSse(res: Response): Promise<void> {
    if (!res.body) throw new McpTransportError(`SSE without body (${this.descriptor})`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) this.dispatchSseFrame(frame);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private dispatchSseFrame(frame: string): void {
    const lines = frame.split("\n").filter((l) => l.startsWith("data:"));
    const body = lines.map((l) => l.slice(5).trim()).join("\n");
    if (!body) return;
    try {
      this.messageHandler?.(JSON.parse(body) as JsonRpcMessage);
    } catch (err) {
      this.errorHandler?.(new McpTransportError("malformed SSE frame", err));
    }
  }
}

async function safeReadText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ""; }
}
