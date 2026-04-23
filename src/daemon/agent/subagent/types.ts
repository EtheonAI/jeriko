// Subagent subsystem — public types.
//
// This module centralizes every type the subagent runners expose so that
// `agent/agent.ts`, `agent/orchestrator.ts`, and the agent-facing tools
// (delegate, spawn_agent, task_status) all share one vocabulary.
//
// Lifecycle summary:
//   pending  → created, not yet running
//   running  → executing the agent loop
//   completed → finished normally (result_text populated)
//   failed    → threw or exited with error
//   cancelled → aborted by user or by the orchestrator
//
// Modes:
//   sync       — parent awaits completion in the tool-call round
//   async      — fire-and-forget; parent sees a task-notification later
//   fork       — sync but child inherits parent's exact system prompt bytes
//   worktree   — runs inside an isolated git worktree

import type { AgentType } from "../orchestrator.js";
import type { DriverMessage } from "../drivers/index.js";

/** How the subagent is spawned. */
export type SubagentMode = "sync" | "async" | "fork" | "worktree";

/** Lifecycle state of a subagent task. */
export type SubagentStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Inputs required to spawn any kind of subagent.
 *
 * The runner resolves any unspecified backend/model from the parent's
 * active context (see `orchestrator-context.ts`).
 */
export interface SubagentSpawnInput {
  /** Task prompt — what the subagent is asked to do. */
  prompt: string;
  /** Short label for logs / task-notification. Defaults to truncated prompt. */
  label?: string;
  /** Agent role preset; determines default tool set (see `orchestrator.AGENT_TYPES`). */
  agentType?: AgentType;
  /** How the subagent is spawned. Default: "sync". */
  mode?: SubagentMode;
  /** Parent session id (for linkage + task-notification injection). */
  parentSessionId?: string;
  /** Optional backend override. Falls back to parent's active backend. */
  backend?: string;
  /** Optional model override. Falls back to parent's active model. */
  model?: string;
  /**
   * Optional explicit tool id whitelist. Overrides the agent-type preset.
   * Typically callers should rely on `agentType` for consistency.
   */
  toolIds?: string[];
  /** Parent conversation messages to forward to the child as context. */
  parentMessages?: DriverMessage[];
  /**
   * Parent's exact rendered system prompt bytes. Required for `mode: "fork"`
   * to achieve byte-identical API prefix (prompt-cache hit). Ignored in other
   * modes, which derive the system prompt from config.
   */
  forkSystemPrompt?: string;
  /** AbortSignal forwarded to the agent loop + driver. */
  signal?: AbortSignal;
  /**
   * For `mode: "worktree"`, an optional branch name. Defaults to an auto-
   * generated name under `jeriko/subagent/<task-id>`.
   */
  worktreeBranch?: string;
  /**
   * Threshold in milliseconds after which a `sync`/`fork` task transitions
   * to async execution (auto-backgrounding). Set to 0 to disable. Default
   * is read from `SUBAGENT_AUTO_BACKGROUND_MS` constant.
   */
  autoBackgroundAfterMs?: number;
}

/** Lightweight handle returned from a spawn call. */
export interface SubagentHandle {
  taskId: string;
  childSessionId: string;
  mode: SubagentMode;
  /**
   * In sync/fork modes this is the completion; in async it is the initial
   * {status: "async_launched"} acknowledgement. Await to observe completion.
   */
  completion: Promise<SubagentCompletion>;
}

/** Terminal outcome of a subagent run. */
export interface SubagentCompletion {
  taskId: string;
  childSessionId: string;
  status: SubagentStatus;
  /** Final text response. Empty string on error or async launch. */
  response: string;
  /** Human-readable error message for non-success statuses. */
  error?: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  /** Mode this task ran in — may differ from requested mode if auto-backgrounded. */
  mode: SubagentMode;
}

/**
 * Async launch acknowledgement — returned synchronously when `mode: "async"`
 * or when a sync task auto-backgrounds. The actual completion arrives via
 * the parent's next tool-call round as a `task-notification` user message.
 */
export interface SubagentAsyncLaunch {
  taskId: string;
  childSessionId: string;
  /** Constant `"async_launched"` for pattern matching. */
  status: "async_launched";
  mode: SubagentMode;
}

/** Default auto-background threshold (ms). Mirrors Claude Code's 2 s behaviour. */
export const SUBAGENT_AUTO_BACKGROUND_MS = 2000;

/** Hardcoded minimum and maximum auto-background thresholds. */
export const SUBAGENT_AUTO_BACKGROUND_MIN_MS = 500;
export const SUBAGENT_AUTO_BACKGROUND_MAX_MS = 30_000;
