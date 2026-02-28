// @jeriko/protocol — Public protocol definitions for the Jeriko daemon API.

export {
  // Result envelope
  type JerikoResult,

  // Enums & constants
  ExitCode,

  // Scalar types
  type OutputFormat,
  type Platform,
  type Arch,
  type LogLevel,
  type RiskLevel,

  // Session
  type Session,

  // Channel
  type ChannelConnectionStatus,
  type ChannelStatus,

  // Connector
  type ConnectorResult,

  // Execution
  type ExecScope,
  type NetworkAccess,
  type RwMode,

  // Tool definitions
  type JsonSchemaProperty,
  type ToolDefinition,
} from "./types.js";

export {
  type ChatRequest,
  type ExecRequest,
  type SessionListRequest,
  type ChannelConnectRequest,
  type ConnectorCallRequest,
} from "./requests.js";

export {
  type ToolCallEvent,
  type AgentTurnEvent,
  type ChannelStatusEvent,
  type TriggerFiredEvent,
  type AuditEvent,
  type HealthEvent,
} from "./events.js";

export {
  ErrorCode,
  type ErrorCodeValue,
  JerikoError,
  NotFoundError,
  AuthError,
  TimeoutError,
  PolicyDeniedError,
  RateLimitError,
  NetworkError,
  fromErrorJSON,
} from "./errors.js";
