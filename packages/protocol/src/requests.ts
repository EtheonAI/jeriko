// Request schemas for the Jeriko HTTP/WebSocket API.

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/** Send a message to the agent and stream back turn events. */
export interface ChatRequest {
  /** Existing session to continue, or omit to create a new one. */
  session_id?: string;
  /** The user message to send. */
  message: string;
  /** Override the default model for this request. */
  model?: string;
}

// ---------------------------------------------------------------------------
// Exec
// ---------------------------------------------------------------------------

/** Execute a shell command through the gateway. */
export interface ExecRequest {
  /** The shell command to execute. */
  command: string;
  /** Timeout in milliseconds (default: 30000). */
  timeout?: number;
  /** Working directory for the command. */
  cwd?: string;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** List stored chat sessions. */
export interface SessionListRequest {
  /** Maximum number of sessions to return (default: 50). */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** Connect a messaging channel by name. */
export interface ChannelConnectRequest {
  /** Channel name (e.g. "telegram", "whatsapp"). */
  name: string;
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

/** Call a connector method (e.g. Stripe charges.create). */
export interface ConnectorCallRequest {
  /** Connector name (e.g. "stripe", "github", "paypal"). */
  connector: string;
  /** Dot-delimited method name (e.g. "charges.create"). */
  method: string;
  /** Method-specific parameters. */
  params: Record<string, unknown>;
}
