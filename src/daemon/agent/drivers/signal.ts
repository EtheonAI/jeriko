// Shared abort signal utilities for LLM drivers.
//
// Combines a user-provided AbortSignal (from /stop) with a request-level
// timeout so hung API calls don't block forever.

/** Default timeout for an LLM API request (2 minutes). */
export const LLM_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Combine a user abort signal with a request timeout.
 *
 * Returns a composite AbortSignal that fires when either:
 *   - The user aborts (via /stop or controller.abort())
 *   - The timeout expires
 *
 * If no user signal is provided, returns a pure timeout signal.
 */
export function withTimeout(
  signal?: AbortSignal,
  timeoutMs: number = LLM_REQUEST_TIMEOUT_MS,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeoutSignal;
  return AbortSignal.any([signal, timeoutSignal]);
}
