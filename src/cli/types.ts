/**
 * CLI Types — Shared interfaces for the interactive Ink-based CLI.
 *
 * All CLI-specific type definitions live here. Components, the backend,
 * and the app orchestrator import from this single module.
 */

// ---------------------------------------------------------------------------
// Phase state machine
// ---------------------------------------------------------------------------

/** Current phase of the CLI interaction loop. */
export type Phase =
  | "idle"
  | "thinking"
  | "streaming"
  | "tool-executing"
  | "sub-executing"
  | "setup";

/** Type guard for valid phase values. */
export function isPhase(value: unknown): value is Phase {
  return (
    value === "idle" ||
    value === "thinking" ||
    value === "streaming" ||
    value === "tool-executing" ||
    value === "sub-executing" ||
    value === "setup"
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** A completed message in the conversation history (rendered in <Static>). */
export interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: DisplayToolCall[];
  timestamp: number;
}

/** A tool call associated with a message. */
export interface DisplayToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  status: "pending" | "running" | "completed";
  startTime: number;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Sub-agents — legacy tracker (for tool-call-based rendering)
// ---------------------------------------------------------------------------

/** Tracks an in-flight delegate or parallel sub-agent tool call. */
export interface SubAgentTracker {
  id: string;
  agentType: string;
  prompt: string;
  kind: "delegate" | "parallel";
  startTime: number;
}

// ---------------------------------------------------------------------------
// Sub-agents — live monitoring state
// ---------------------------------------------------------------------------

/** Live state of a running sub-agent (Phase 3: real-time monitoring). */
export interface SubAgentState {
  childSessionId: string;
  parentSessionId: string;
  label: string;
  agentType: string;
  phase: "running" | "completed" | "error";
  currentTool: string | null;
  /** Rolling ~120-char preview of the sub-agent's stream output. */
  streamPreview: string;
  toolCallCount: number;
  startTime: number;
  durationMs?: number;
  status?: "success" | "error";
}

// ---------------------------------------------------------------------------
// Context window tracking
// ---------------------------------------------------------------------------

/** Tracks context window utilization for the status bar. */
export interface ContextInfo {
  totalTokens: number;
  /** Maximum context window size (from model capabilities). */
  maxTokens: number;
  compactionCount: number;
  lastCompactedAt?: number;
}

/** Create a fresh context info with sensible defaults. */
export function emptyContextInfo(): ContextInfo {
  return { totalTokens: 0, maxTokens: 200_000, compactionCount: 0 };
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Session metadata displayed in the CLI. */
export interface SessionInfo {
  id: string;
  slug: string;
  title: string;
  model: string;
  tokenCount: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** Channel connection status. */
export interface ChannelInfo {
  name: string;
  status: string;
  error?: string;
  connectedAt?: string;
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

/** Connector status for CLI display. */
export interface ConnectorInfo {
  name: string;
  type: string;
  status: "connected" | "disconnected" | "error";
  error?: string;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** Trigger status for CLI display. */
export interface TriggerInfo {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  runCount: number;
  lastRunAt?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** Skill summary for CLI display. */
export interface SkillInfo {
  name: string;
  description: string;
  userInvocable: boolean;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/** Model info for the /models command. */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** A history entry for the /history command. */
export interface HistoryEntry {
  role: string;
  content: string;
  timestamp?: number;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Cumulative token/cost stats for the status bar. */
export interface SessionStats {
  tokensIn: number;
  tokensOut: number;
  turns: number;
  durationMs: number;
}

/** Create a fresh session stats object. */
export function emptyStats(): SessionStats {
  return { tokensIn: 0, tokensOut: 0, turns: 0, durationMs: 0 };
}

// ---------------------------------------------------------------------------
// App state — centralized state for the reducer
// ---------------------------------------------------------------------------

/** Complete UI state — single source of truth managed by useAppReducer. */
export interface AppState {
  phase: Phase;
  messages: DisplayMessage[];
  streamText: string;
  liveToolCalls: DisplayToolCall[];
  subAgents: Map<string, SubAgentState>;
  stats: SessionStats;
  context: ContextInfo;
  model: string;
  sessionSlug: string;
  currentTool: string | undefined;
}

/** Create a fresh initial app state. */
export function createInitialState(opts: {
  phase?: Phase;
  model?: string;
  sessionSlug?: string;
}): AppState {
  return {
    phase: opts.phase ?? "idle",
    messages: [],
    streamText: "",
    liveToolCalls: [],
    subAgents: new Map(),
    stats: emptyStats(),
    context: emptyContextInfo(),
    model: opts.model ?? "claude",
    sessionSlug: opts.sessionSlug ?? "new",
    currentTool: undefined,
  };
}

// ---------------------------------------------------------------------------
// App actions — discriminated union for the reducer
// ---------------------------------------------------------------------------

export type AppAction =
  | { type: "SET_PHASE"; phase: Phase }
  | { type: "ADD_MESSAGE"; message: DisplayMessage }
  | { type: "CLEAR_MESSAGES" }
  | { type: "APPEND_STREAM_TEXT"; content: string }
  | { type: "CLEAR_STREAM" }
  | { type: "TOOL_CALL_START"; toolCall: DisplayToolCall }
  | { type: "TOOL_CALL_RESULT"; id: string; result: string; isError: boolean }
  | { type: "CLEAR_TOOL_CALLS" }
  | { type: "SET_CURRENT_TOOL"; name: string | undefined }
  | { type: "FREEZE_ASSISTANT_MESSAGE"; id: string; text: string; toolCalls: DisplayToolCall[] }
  | { type: "UPDATE_STATS"; tokensIn: number; tokensOut: number; durationMs: number }
  | { type: "RESET_STATS" }
  | { type: "SET_MODEL"; model: string }
  | { type: "SET_SESSION_SLUG"; slug: string }
  | { type: "UPDATE_CONTEXT"; totalTokens: number }
  | { type: "CONTEXT_COMPACTED"; before: number; after: number }
  | { type: "SUB_AGENT_STARTED"; childSessionId: string; parentSessionId: string; label: string; agentType: string }
  | { type: "SUB_AGENT_TEXT_DELTA"; childSessionId: string; content: string }
  | { type: "SUB_AGENT_TOOL_CALL"; childSessionId: string; toolName: string }
  | { type: "SUB_AGENT_TOOL_RESULT"; childSessionId: string; toolCallId: string; isError: boolean }
  | { type: "SUB_AGENT_COMPLETE"; childSessionId: string; status: "success" | "error"; durationMs: number }
  | { type: "CLEAR_SUB_AGENTS" }
  | { type: "RESET_TURN" };
