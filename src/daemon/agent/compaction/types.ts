// Compaction subsystem — types.
//
// Compaction is the process of collapsing conversation history into a
// smaller, semantically-equivalent form. Three strategies cooperate:
//   • Truncation (turn-based, algorithmic) — the original
//     `history.compactHistory()` path. Always available, zero LLM cost.
//   • Summarization (LLM-backed) — replaces dropped turns with a concise
//     summary. Costs one extra call but preserves semantics.
//   • Reactive (on 413) — triggered when the provider rejects for size.
//
// Every strategy returns a `CompactionResult` describing what changed,
// so the agent loop can emit a deterministic `compaction` event.

import type { DriverMessage } from "../drivers/index.js";

/** Which strategy produced a result. Telemetry-friendly. */
export type CompactionStrategyName =
  | "none"
  | "truncate"
  | "summarize"
  | "reactive";

export interface CompactionResult {
  /** Post-compaction history (replace the caller's buffer with this). */
  messages: DriverMessage[];
  /** Estimated tokens before compaction. */
  beforeTokens: number;
  /** Estimated tokens after compaction. */
  afterTokens: number;
  /** How many turns were removed / collapsed. */
  turnsRemoved: number;
  /** The strategy that won — useful for metrics and log context. */
  strategy: CompactionStrategyName;
  /** Optional summary text injected (summarize/reactive only). */
  summary?: string;
}

export const NO_OP_RESULT = (messages: DriverMessage[], tokens: number): CompactionResult => ({
  messages,
  beforeTokens: tokens,
  afterTokens: tokens,
  turnsRemoved: 0,
  strategy: "none",
});

/**
 * Policy — tunable thresholds. Defaults live in `constants.ts`. Callers
 * resolve a policy from `JerikoConfig.agent.compaction` before invoking
 * the auto/reactive entry points.
 */
export interface CompactionPolicy {
  /**
   * Fraction of the model's context window at which auto-compaction kicks in.
   * Default: `COMPACTION_CONTEXT_RATIO` from shared/tokens.ts (0.75).
   */
  autoCompactRatio: number;
  /**
   * Fraction of the context window to target after compaction. Default: 0.5.
   */
  targetRatio: number;
  /**
   * When true, the compaction subsystem will attempt LLM summarization before
   * falling back to raw truncation. Default: true when the backend driver
   * supports tool-capable chat; false otherwise.
   */
  summarize: boolean;
  /**
   * Cap on summary output tokens. Prevents a runaway summarizer call.
   */
  summaryMaxTokens: number;
  /**
   * Minimum number of non-system messages before any compaction is attempted.
   */
  minMessages: number;
}
