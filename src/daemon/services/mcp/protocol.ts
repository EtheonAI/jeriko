// Minimal Model Context Protocol (MCP) types + JSON-RPC helpers.
//
// MCP is JSON-RPC 2.0 with three namespaces Jeriko cares about today:
//   • `initialize` / `initialized` — handshake
//   • `tools/list` — discover tools
//   • `tools/call` — execute a tool
//
// We deliberately do not pull in `@modelcontextprotocol/sdk` — the spec is
// stable and the wire shape small enough that a few hundred lines of
// typed code keep the single-binary build lean.

export type JsonRpcId = string | number;

export interface JsonRpcRequest<Params = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: Params;
}

export interface JsonRpcNotification<Params = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: Params;
}

export interface JsonRpcSuccess<Result = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: Result;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse<Result = unknown> = JsonRpcSuccess<Result> | JsonRpcError;

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// ---------------------------------------------------------------------------
// MCP-specific payloads
// ---------------------------------------------------------------------------

/** Client → server "initialize" payload. */
export interface InitializeParams {
  protocolVersion: string;
  clientInfo: { name: string; version: string };
  capabilities: { tools?: Record<string, unknown> };
}

/** Server response to "initialize". */
export interface InitializeResult {
  protocolVersion: string;
  serverInfo?: { name?: string; version?: string };
  capabilities?: { tools?: { listChanged?: boolean } };
}

/** Server response to "tools/list". */
export interface ListToolsResult {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  }>;
}

export interface CallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface ContentPart {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface CallToolResult {
  content: ContentPart[];
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Codec helpers
// ---------------------------------------------------------------------------

/**
 * Build a request with a caller-supplied sequential id. Callers track the id
 * themselves so concurrent calls on one transport don't collide.
 */
export function buildRequest<P>(id: JsonRpcId, method: string, params?: P): JsonRpcRequest<P> {
  return { jsonrpc: "2.0", id, method, params };
}

export function buildNotification<P>(method: string, params?: P): JsonRpcNotification<P> {
  return { jsonrpc: "2.0", method, params };
}

export function isSuccess<R>(msg: JsonRpcResponse<R>): msg is JsonRpcSuccess<R> {
  return (msg as JsonRpcSuccess<R>).result !== undefined;
}

export function isError(msg: JsonRpcResponse<unknown>): msg is JsonRpcError {
  return (msg as JsonRpcError).error !== undefined;
}

/**
 * Protocol version Jeriko targets. Servers negotiate down when needed.
 * We pin to a stable release so changes are explicit.
 */
export const MCP_PROTOCOL_VERSION = "2025-06-18";
