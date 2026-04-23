// MCP transport abstraction.
//
// Transports are responsible for:
//   • moving JSON-RPC bytes between the client and a server process/endpoint
//   • translating transport-level errors into typed rejections
//
// They are deliberately `async`-only — callers must `await close()` to
// guarantee resource cleanup.

import type { JsonRpcMessage } from "./protocol.js";

export class McpTransportError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = "McpTransportError";
  }
}

export interface Transport {
  /** Human-readable name used in logs + error messages. */
  readonly descriptor: string;
  /** Open the underlying channel. Throws {@link McpTransportError} on failure. */
  start(): Promise<void>;
  /** Send one JSON-RPC message. Implementations must framing (newline, length prefix, etc.). */
  send(message: JsonRpcMessage): Promise<void>;
  /** Shut the channel down. Idempotent. */
  close(): Promise<void>;
  /** Register a message handler. Called once per received JSON-RPC object. */
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  /** Register a fatal-error handler — called when the channel dies. */
  onError(handler: (error: McpTransportError) => void): void;
}
