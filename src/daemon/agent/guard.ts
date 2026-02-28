// Agent execution guard — prevents runaway agent loops.
//
// The guard tracks per-run execution state and enforces three boundaries:
//
//   1. Consecutive error rounds   — If the model produces N rounds in a row where
//      every tool call fails, the guard trips. This catches models stuck calling
//      wrong tool names, passing bad args, or retrying broken commands.
//
//   2. Wall-clock duration         — Hard cap on total execution time per run.
//      Prevents unbounded loops on Telegram/headless channels where the user
//      can't easily Ctrl+C.
//
//   3. Per-tool call frequency     — Sliding-window rate limit per tool ID.
//      Prevents any single tool from being spammed (e.g. screenshot every second).
//
// Design decisions:
//   - The guard is instantiated per runAgent() call. No global/shared state.
//   - Tool rate limits are optional — only tools listed in TOOL_LIMITS are governed.
//   - The guard returns descriptive error strings (not booleans) so the LLM
//     receives actionable feedback about why it was stopped.
//   - Following opencode's pattern: tool errors are sent back to the LLM as
//     results. The guard only intervenes when the LLM fails to self-correct
//     after repeated attempts.

import { getLogger } from "../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GuardConfig {
  /** Max consecutive rounds where ALL tool calls fail before tripping. Default: 3. */
  maxConsecutiveErrors: number;
  /** Max wall-clock time for the entire run in ms. Default: 5 minutes. */
  maxDurationMs: number;
  /** Per-tool sliding-window rate limits. Key = tool name. */
  toolLimits: Record<string, ToolLimit>;
}

export interface ToolLimit {
  /** Maximum calls within the window. */
  maxCalls: number;
  /** Window duration in ms. */
  windowMs: number;
}

/** Default rate limits for tools that can cause user-visible side effects. */
const DEFAULT_TOOL_LIMITS: Record<string, ToolLimit> = {
  screenshot: { maxCalls: 10, windowMs: 60_000 },
  browser:    { maxCalls: 30, windowMs: 60_000 },
};

const DEFAULT_CONFIG: GuardConfig = {
  maxConsecutiveErrors: 5,
  maxDurationMs: 10 * 60_000,
  toolLimits: DEFAULT_TOOL_LIMITS,
};

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

export class ExecutionGuard {
  private readonly config: GuardConfig;
  private readonly startedAt: number;
  private consecutiveErrorRounds = 0;

  /** Per-tool call timestamps for sliding-window rate limiting. */
  private readonly toolCalls = new Map<string, number[]>();

  constructor(config?: Partial<GuardConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      toolLimits: { ...DEFAULT_TOOL_LIMITS, ...config?.toolLimits },
    };
    this.startedAt = Date.now();
  }

  // ── Pre-round check ─────────────────────────────────────────────────

  /**
   * Check guard state before starting a new round.
   * Returns null if OK, or an error message if the run should stop.
   */
  checkBeforeRound(): string | null {
    const elapsed = Date.now() - this.startedAt;
    if (elapsed >= this.config.maxDurationMs) {
      const secs = Math.round(elapsed / 1000);
      log.warn(`Guard: duration limit reached (${secs}s)`);
      return `Execution time limit reached (${secs}s). Summarize what you've accomplished and stop.`;
    }
    return null;
  }

  // ── Pre-tool check ──────────────────────────────────────────────────

  /**
   * Check if a specific tool call should be allowed.
   * Returns null if OK, or an error message (used as tool result) if rate-limited.
   */
  checkToolCall(toolName: string): string | null {
    const limit = this.config.toolLimits[toolName];
    if (!limit) return null;

    const now = Date.now();
    const timestamps = this.toolCalls.get(toolName) ?? [];

    // Purge timestamps outside the window
    const cutoff = now - limit.windowMs;
    const active = timestamps.filter((t) => t >= cutoff);

    if (active.length >= limit.maxCalls) {
      const windowSecs = Math.round(limit.windowMs / 1000);
      log.debug(`Guard: tool "${toolName}" rate-limited (${active.length}/${limit.maxCalls} in ${windowSecs}s)`);
      return `Rate limited: ${toolName} called ${active.length} times in the last ${windowSecs}s (max ${limit.maxCalls}). Work with what you have instead of retrying.`;
    }

    active.push(now);
    this.toolCalls.set(toolName, active);
    return null;
  }

  // ── Post-round recording ────────────────────────────────────────────

  /**
   * Record the outcome of a tool-call round.
   * Returns null if OK, or an error message if the circuit breaker trips.
   */
  recordRound(allFailed: boolean): string | null {
    if (allFailed) {
      this.consecutiveErrorRounds++;
      if (this.consecutiveErrorRounds >= this.config.maxConsecutiveErrors) {
        log.warn(`Guard: circuit breaker tripped after ${this.consecutiveErrorRounds} consecutive error rounds`);
        return `Stopped after ${this.consecutiveErrorRounds} consecutive rounds where every tool call failed. Review the errors and try a different approach.`;
      }
    } else {
      this.consecutiveErrorRounds = 0;
    }
    return null;
  }
}
