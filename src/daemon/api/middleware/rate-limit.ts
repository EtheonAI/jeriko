// Daemon middleware — Token bucket rate limiter.
// Limits requests per client IP within a rolling time window.

import type { Context, Next } from "hono";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitOptions {
  /** Maximum number of requests per window. Default: 100 */
  maxRequests?: number;
  /** Window duration in milliseconds. Default: 60000 (1 minute) */
  windowMs?: number;
  /** If true, include rate limit headers in response. Default: true */
  includeHeaders?: boolean;
  /** Maximum number of tracked client buckets. Default: 10000 */
  maxBuckets?: number;
  /** If true, trust X-Forwarded-For / X-Real-IP headers for client IP. Default: false */
  trustProxy?: boolean;
}

/** Internal bucket state for a single client. */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const buckets = new Map<string, TokenBucket>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer(windowMs: number): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > windowMs * 2) {
        buckets.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Don't prevent process exit
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }
}

// ---------------------------------------------------------------------------
// Extract client IP
// ---------------------------------------------------------------------------

function getClientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() ?? "127.0.0.1";

    const realIp = c.req.header("x-real-ip");
    if (realIp) return realIp.trim();
  }

  return "127.0.0.1";
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create a token-bucket rate limiter middleware.
 *
 * Each client IP gets a bucket of `maxRequests` tokens that refills
 * linearly over `windowMs` milliseconds. Excess requests get HTTP 429.
 */
export function rateLimitMiddleware(
  opts: RateLimitOptions = {},
): (c: Context, next: Next) => Promise<Response | void> {
  const maxRequests = opts.maxRequests ?? 100;
  const windowMs = opts.windowMs ?? 60_000;
  const includeHeaders = opts.includeHeaders ?? true;
  const maxBuckets = opts.maxBuckets ?? 10_000;
  const trustProxy = opts.trustProxy ?? false;

  ensureCleanupTimer(windowMs);

  return async (c: Context, next: Next): Promise<Response | void> => {
    const clientIp = getClientIp(c, trustProxy);
    const now = Date.now();

    let bucket = buckets.get(clientIp);
    if (bucket) {
      // LRU: delete and re-insert to move to end of iteration order
      buckets.delete(clientIp);
      buckets.set(clientIp, bucket);
    } else {
      // Evict oldest bucket if at capacity
      if (buckets.size >= maxBuckets) {
        const oldest = buckets.keys().next().value;
        if (oldest !== undefined) buckets.delete(oldest);
      }
      bucket = { tokens: maxRequests, lastRefill: now };
      buckets.set(clientIp, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refillRate = maxRequests / windowMs;
    const tokensToAdd = elapsed * refillRate;
    bucket.tokens = Math.min(maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check limit
    if (bucket.tokens < 1) {
      const retryAfterMs = Math.ceil((1 - bucket.tokens) / refillRate);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      log.warn(`Rate limit exceeded for ${clientIp}`, { remaining: 0, retryAfterSec });

      if (includeHeaders) {
        c.header("Retry-After", String(retryAfterSec));
        c.header("X-RateLimit-Limit", String(maxRequests));
        c.header("X-RateLimit-Remaining", "0");
        c.header("X-RateLimit-Reset", String(Math.ceil((now + retryAfterMs) / 1000)));
      }

      return c.json(
        { ok: false, error: "Too many requests", retry_after_seconds: retryAfterSec },
        429,
      );
    }

    // Consume one token
    bucket.tokens -= 1;
    const remaining = Math.floor(bucket.tokens);

    if (includeHeaders) {
      c.header("X-RateLimit-Limit", String(maxRequests));
      c.header("X-RateLimit-Remaining", String(remaining));
      c.header("X-RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));
    }

    return next();
  };
}

/** Reset all rate limit buckets. For testing only. */
export function resetRateLimits(): void {
  buckets.clear();
}
