// Shared types for the Jeriko protocol.
// Mirrors internal lib/types.ts for external consumption.

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

/** Standard Jeriko result envelope. Every API response uses this shape. */
export type JerikoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: number };

// ---------------------------------------------------------------------------
// Exit / error codes
// ---------------------------------------------------------------------------

/** Semantic exit codes used across all commands and API responses. */
export enum ExitCode {
  OK        = 0,
  GENERAL   = 1,
  NETWORK   = 2,
  AUTH       = 3,
  NOT_FOUND = 5,
  TIMEOUT   = 7,
}

// ---------------------------------------------------------------------------
// Output / platform
// ---------------------------------------------------------------------------

/** Supported output serialization formats. */
export type OutputFormat = "json" | "text" | "logfmt";

/** Supported operating systems. */
export type Platform = "darwin" | "linux" | "win32";

/** Supported CPU architectures. */
export type Arch = "x64" | "arm64";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/** Log severity levels, ordered by verbosity (debug = most verbose). */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Risk classification for commands and tool calls. */
export type RiskLevel = "low" | "medium" | "high" | "critical";

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** A chat session as returned by the API. */
export interface Session {
  /** Unique session identifier (UUID). */
  id: string;
  /** Model used for inference. */
  model: string;
  /** ISO-8601 creation timestamp. */
  created_at: string;
  /** ISO-8601 last activity timestamp. */
  updated_at: string;
  /** Number of turns completed in this session. */
  turn_count: number;
  /** Total tokens consumed across all turns. */
  total_tokens: number;
  /** Whether the session is still active. */
  active: boolean;
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

/** Connection status for a messaging channel. */
export type ChannelConnectionStatus = "connected" | "disconnected" | "failed";

/** Status of a single messaging channel. */
export interface ChannelStatus {
  /** Channel name (e.g. "telegram", "whatsapp"). */
  name: string;
  /** Current connection state. */
  status: ChannelConnectionStatus;
  /** Error message if status is "failed". */
  error?: string;
  /** ISO-8601 timestamp of when the channel connected. */
  connected_at?: string;
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

/** Result from a connector API call. */
export interface ConnectorResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  rate_limit?: { remaining: number; reset_at: string };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** Execution scope describing intent. */
export type ExecScope = "read" | "write" | "exec" | "admin";

/** Network access mode. */
export type NetworkAccess = "none" | "local" | "internet";

/** Filesystem access mode. */
export type RwMode = "readonly" | "readwrite" | "append";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** A JSON Schema property definition. */
export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  default?: unknown;
}

/** Tool definition compatible with Anthropic/OpenAI function calling formats. */
export interface ToolDefinition {
  /** Machine-readable tool name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** JSON Schema for the tool's input parameters. */
  input_schema: {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
}
