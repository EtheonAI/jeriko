// @jeriko/sdk — Client SDK for the Jeriko daemon API.

// Client
export { JerikoClient, type JerikoClientOptions } from "./client.js";

// Re-export protocol types that SDK consumers commonly need
export type {
  // Result envelope
  JerikoResult,

  // Request types
  ChatRequest,
  ExecRequest,
  SessionListRequest,
  ChannelConnectRequest,
  ConnectorCallRequest,

  // Event types
  AgentTurnEvent,
  ToolCallEvent,
  ChannelStatusEvent,
  TriggerFiredEvent,
  AuditEvent,
  HealthEvent,

  // Domain types
  Session,
  ChannelStatus,
  ChannelConnectionStatus,
  ConnectorResult,
  ToolDefinition,
  RiskLevel,
  LogLevel,
} from "@jeriko/protocol";

// Re-export error classes (used by consumers to catch typed errors)
export {
  JerikoError,
  NotFoundError,
  AuthError,
  TimeoutError,
  PolicyDeniedError,
  RateLimitError,
  NetworkError,
  ErrorCode,
  fromErrorJSON,
} from "@jeriko/protocol";
