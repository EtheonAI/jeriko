// HTTP retry utility — single source of truth for transient-failure recovery
// across every driver and connector.
//
// The existing `withRetry` in `connectors/middleware.ts` only retries on
// thrown exceptions — HTTP 5xx responses slip through because `fetch` does
// not throw on bad status. This module inspects `Response.status` and
// honours `Retry-After` so every caller gets the same discipline.
//
// Pure utility: no daemon / driver imports. Safe to use anywhere.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HttpRetryOptions {
  /** Maximum retry attempts after the first call. Default: 4 → 5 total attempts. */
  readonly maxRetries?: number;
  /** Base delay (ms) for exponential backoff. Default: 1000. */
  readonly baseDelayMs?: number;
  /** Cap on delay (ms) — prevents 30-minute waits on aggressive Retry-After. */
  readonly maxDelayMs?: number;
  /** Status codes eligible for retry. Default: `RETRYABLE_STATUSES`. */
  readonly retryableStatuses?: ReadonlySet<number>;
  /** Optional observer — called once per retry wait with (attempt, delayMs, reason). */
  readonly onRetry?: (info: RetryNotice) => void;
}

export interface RetryNotice {
  /** Retry attempt number (0-based). Attempt 0 is the first retry after the initial call. */
  readonly attempt: number;
  /** Milliseconds the utility is about to sleep. */
  readonly delayMs: number;
  /** What triggered the retry: the HTTP status code, or `-1` for a thrown exception. */
  readonly status: number;
  /** Reason text suitable for logs. */
  readonly reason: string;
}

export const DEFAULT_RETRYABLE_STATUSES: ReadonlySet<number> = Object.freeze(
  new Set([408, 425, 429, 500, 502, 503, 504]),
);

const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 60_000;
const DEFAULT_MAX_RETRIES = 4;

// ---------------------------------------------------------------------------
// Utility: parse Retry-After header
// ---------------------------------------------------------------------------

/**
 * Parse an HTTP `Retry-After` header.
 *
 * The header may be:
 *   - delta-seconds (e.g. "5")
 *   - HTTP-date (e.g. "Wed, 21 Oct 2026 07:28:00 GMT")
 *
 * Returns the delay in milliseconds, or `undefined` if the header is missing
 * or unparseable. Past dates resolve to 0.
 */
export function parseRetryAfter(header: string | null | undefined, now: number = Date.now()): number | undefined {
  if (header === null || header === undefined || header === "") return undefined;
  const trimmed = header.trim();

  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.round(asNumber * 1000);
  }

  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - now);
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Utility: compute backoff delay with jitter
// ---------------------------------------------------------------------------

/**
 * Exponential backoff with ±20% jitter, optionally capped.
 *
 * Deterministic signature for tests: the caller can pass `random` to stub
 * the jitter source.
 */
export function computeBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const raw = baseDelayMs * Math.pow(2, Math.max(0, attempt));
  const jitterFactor = 0.2 * (random() * 2 - 1); // ±20%
  const withJitter = raw + raw * jitterFactor;
  return Math.max(0, Math.min(maxDelayMs, Math.round(withJitter)));
}

// ---------------------------------------------------------------------------
// Core retry wrapper
// ---------------------------------------------------------------------------

export interface HttpRetryExecutor {
  /** Must return a fresh Response each call — the wrapper will retry on transient failures. */
  (): Promise<Response>;
}

/**
 * Call `fn` until it returns a non-retryable response or retries are exhausted.
 *
 * Return semantics:
 *   - A "successful" (2xx) or non-retryable-error response is returned directly.
 *   - On the final attempt, the most recent response is returned even if it
 *     has a retryable status — the caller owns the final error rendering.
 *   - Network / fetch exceptions bubble up after retries are exhausted.
 */
export async function withHttpRetry(
  fn: HttpRetryExecutor,
  opts: HttpRetryOptions = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const retryable = opts.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) throw err;
      const delayMs = computeBackoff(attempt, baseDelayMs, maxDelayMs);
      opts.onRetry?.({
        attempt,
        delayMs,
        status: -1,
        reason: err instanceof Error ? err.message : String(err),
      });
      await sleep(delayMs);
      continue;
    }

    if (response.ok || !retryable.has(response.status)) {
      return response;
    }

    lastResponse = response;
    if (attempt === maxRetries) {
      return response; // final attempt — let caller handle the error body
    }

    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
    const delayMs = retryAfter !== undefined
      ? Math.min(retryAfter, maxDelayMs)
      : computeBackoff(attempt, baseDelayMs, maxDelayMs);

    opts.onRetry?.({
      attempt,
      delayMs,
      status: response.status,
      reason: `HTTP ${response.status}`,
    });

    // Drain the response body so keep-alive connections can be reused.
    try { await response.arrayBuffer(); } catch { /* ignore drain failure */ }

    await sleep(delayMs);
  }

  // Unreachable — the loop always returns inside it. Kept for type completeness.
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("withHttpRetry: exhausted without a response");
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
