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
 * Uses AbortSignal.any() when available (Bun 1.1+), falls back to
 * manual wiring for older runtimes.
 */
export function withTimeout(
  signal?: AbortSignal,
  timeoutMs: number = LLM_REQUEST_TIMEOUT_MS,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  if (!signal) return timeoutSignal;

  // AbortSignal.any() is available in modern runtimes (Bun 1.1+, Node 20+)
  if ("any" in AbortSignal) {
    return (AbortSignal as any).any([signal, timeoutSignal]);
  }

  // Fallback: manual composite for older runtimes
  const controller = new AbortController();

  const onAbort = () => controller.abort(signal.reason ?? "User aborted");
  const onTimeout = () => controller.abort(timeoutSignal.reason ?? "Request timed out");

  if (signal.aborted) {
    controller.abort(signal.reason);
    return controller.signal;
  }
  if (timeoutSignal.aborted) {
    controller.abort(timeoutSignal.reason);
    return controller.signal;
  }

  signal.addEventListener("abort", onAbort, { once: true });
  timeoutSignal.addEventListener("abort", onTimeout, { once: true });

  return controller.signal;
}
