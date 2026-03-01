/**
 * TUI Formatters — Display-friendly formatting for tokens, cost, and duration.
 *
 * All functions are pure, stateless, and locale-agnostic (uses fixed formatting
 * suitable for monospace terminal display).
 */

// ---------------------------------------------------------------------------
// Token formatting
// ---------------------------------------------------------------------------

/**
 * Format a token count for display.
 * Uses K suffix for thousands to keep the display compact.
 *
 * @example
 *   formatTokens(0)      → "0"
 *   formatTokens(500)    → "500"
 *   formatTokens(1200)   → "1.2K"
 *   formatTokens(15000)  → "15K"
 *   formatTokens(150000) → "150K"
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  const k = tokens / 1000;
  return k < 10 ? `${k.toFixed(1)}K` : `${Math.round(k)}K`;
}

// ---------------------------------------------------------------------------
// Cost formatting
// ---------------------------------------------------------------------------

/**
 * Estimate the cost of a token count based on a simple per-token rate.
 *
 * Uses a blended rate of $3 per million input tokens + $15 per million output tokens
 * (approximate Claude Sonnet pricing). The rate is configurable for future model support.
 *
 * @param tokensIn   Input token count
 * @param tokensOut  Output token count
 * @param inputRate  Cost per million input tokens (default: $3)
 * @param outputRate Cost per million output tokens (default: $15)
 */
export function estimateCost(
  tokensIn: number,
  tokensOut: number,
  inputRate: number = 3,
  outputRate: number = 15,
): number {
  return (tokensIn * inputRate + tokensOut * outputRate) / 1_000_000;
}

/**
 * Format a dollar cost for display.
 *
 * @example
 *   formatCost(0)       → "$0.00"
 *   formatCost(0.005)   → "$0.01"
 *   formatCost(0.12)    → "$0.12"
 *   formatCost(1.5)     → "$1.50"
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * @example
 *   formatDuration(500)    → "0.5s"
 *   formatDuration(2300)   → "2.3s"
 *   formatDuration(65000)  → "1m 5s"
 *   formatDuration(3661000)→ "1h 1m"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return "0s";

  const totalSeconds = ms / 1000;

  if (totalSeconds < 60) {
    return totalSeconds < 10
      ? `${totalSeconds.toFixed(1)}s`
      : `${Math.round(totalSeconds)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

// ---------------------------------------------------------------------------
// Context usage formatting
// ---------------------------------------------------------------------------

/**
 * Format context window usage as a percentage string.
 *
 * @example
 *   formatContextUsage(5000, 200000) → "3%"
 *   formatContextUsage(150000, 200000) → "75%"
 */
export function formatContextUsage(tokens: number, contextLimit: number): string {
  if (contextLimit <= 0) return "—";
  const pct = Math.round((tokens / contextLimit) * 100);
  return `${pct}%`;
}
