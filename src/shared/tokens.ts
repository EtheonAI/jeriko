// Layer 0 — Token estimation. Zero internal imports.
// No hardcoded model limits — capabilities come from the model registry.

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

/**
 * Check whether context usage has crossed the compaction threshold (75%).
 *
 * @param tokens        Current estimated token count
 * @param contextLimit  The model's context window size (from capabilities)
 */
export function shouldCompact(tokens: number, contextLimit: number): boolean {
  if (contextLimit <= 0) return false;
  return (tokens / contextLimit) * 100 >= 75;
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
