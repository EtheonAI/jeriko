// Layer 0 — Token estimation and context management constants.
// Zero internal imports. No hardcoded model limits — capabilities
// come from the model registry at runtime.

// ---------------------------------------------------------------------------
// Context management constants
// ---------------------------------------------------------------------------

/** Default context window assumed when model capabilities are unknown. */
export const DEFAULT_CONTEXT_LIMIT = 24_000;

/**
 * Fraction of context window used as the auto token budget for pre-trim.
 * Applied when loading history before the agent loop starts.
 * Leaves 40% headroom for system prompt, tool definitions, and response.
 */
export const PRE_TRIM_CONTEXT_RATIO = 0.6;

/**
 * Fraction of context window that triggers in-loop compaction.
 * When accumulated tokens exceed this ratio during execution,
 * emergency compaction fires to free space.
 */
export const COMPACTION_CONTEXT_RATIO = 0.75;

/**
 * Target context usage after emergency compaction.
 * Tighter than PRE_TRIM_CONTEXT_RATIO because we're already near
 * the limit and need guaranteed headroom for continued execution.
 */
export const COMPACT_TARGET_RATIO = 0.5;

/**
 * Minimum number of non-system messages required before compaction
 * is allowed. Prevents thrashing on very short conversations.
 */
export const MIN_MESSAGES_FOR_COMPACTION = 5;

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the token count for a text string.
 *
 * Uses the widely-accepted heuristic of ~4 characters per token for
 * English text with code mixed in. This is intentionally simple —
 * use a proper tokenizer (tiktoken / claude-tokenizer) when precision matters.
 *
 * @param text  The input string
 * @returns     Estimated token count (always >= 0)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Context threshold checks
// ---------------------------------------------------------------------------

/**
 * Check whether context usage has crossed the compaction threshold.
 *
 * @param tokens        Current estimated token count
 * @param contextLimit  The model's context window size (from capabilities)
 */
export function shouldCompact(tokens: number, contextLimit: number): boolean {
  if (contextLimit <= 0) return false;
  return tokens / contextLimit >= COMPACTION_CONTEXT_RATIO;
}

/**
 * Check if tokens exceed the model's context window.
 *
 * @param tokens        Current token count
 * @param contextLimit  The model's context window size (from capabilities)
 */
export function isOverContextLimit(tokens: number, contextLimit: number): boolean {
  return tokens >= contextLimit;
}

/**
 * Return the percentage of the context window consumed.
 *
 * @param tokens        Current token count
 * @param contextLimit  The model's context window size (from capabilities)
 * @returns A number between 0 and 100+ (can exceed 100 if over limit)
 */
export function contextUsagePercent(tokens: number, contextLimit: number): number {
  if (contextLimit <= 0) return 0;
  return (tokens / contextLimit) * 100;
}
