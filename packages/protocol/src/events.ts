// Event schemas emitted by the Jeriko daemon over SSE/WebSocket.

import type { RiskLevel, ChannelConnectionStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Agent turns
// ---------------------------------------------------------------------------

/** A single tool call within a turn. */
export interface ToolCallEvent {
  /** Tool name (e.g. "bash", "write_file"). */
  name: string;
  /** Serialized JSON input passed to the tool. */
  input: string;
  /** Tool execution result, if available. */
  output?: string;
}

/** Emitted for each turn in an agent conversation. */
export interface AgentTurnEvent {
  /** Session this turn belongs to. */
  session_id: string;
  /** 1-based turn number within the session. */
  turn: number;
  /** Role of the message author. */
  role: "user" | "assistant" | "system" | "tool";
  /** Text content of the turn. */
  content: string;
  /** Tool calls made during this turn (assistant role only). */
  tool_calls?: ToolCallEvent[];
  /** Token counts for this turn. */
  tokens: {
    input: number;
    output: number;
  };
}

// ---------------------------------------------------------------------------
// Channel status
// ---------------------------------------------------------------------------

/** Emitted when a channel's connection status changes. */
export interface ChannelStatusEvent {
  /** Channel name (e.g. "telegram", "whatsapp"). */
  channel: string;
  /** New connection status. */
  status: ChannelConnectionStatus;
  /** Error details if status is "failed". */
  error?: string;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** Emitted when a trigger fires (cron, webhook, email, file-watch, etc). */
export interface TriggerFiredEvent {
  /** Unique trigger identifier. */
  trigger_id: string;
  /** Trigger type. */
  type: "cron" | "webhook" | "email" | "http" | "file";
  /** Trigger-specific payload data. */
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** Emitted for every command execution attempt (allowed or denied). */
export interface AuditEvent {
  /** Unique lease identifier linking to the execution lease. */
  lease_id: string;
  /** Agent identity (e.g. "cli", "agent:claude", "trigger:cron-daily"). */
  agent: string;
  /** The shell command (truncated for safety). */
  command: string;
  /** Risk classification at time of decision. */
  risk: RiskLevel;
  /** The gateway's decision. */
  decision: "allow" | "deny" | "approval_required";
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Emitted periodically or on request with daemon health information. */
export interface HealthEvent {
  /** Daemon uptime in milliseconds. */
  uptime_ms: number;
  /** Number of active chat sessions. */
  sessions_active: number;
  /** Names of currently connected messaging channels. */
  channels_connected: string[];
}
