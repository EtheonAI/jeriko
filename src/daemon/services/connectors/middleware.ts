/**
 * Shared connector middleware — retry, rate-limit, timeout, idempotency,
 * and token refresh helpers that any connector can compose.
 */

// ---------------------------------------------------------------------------
// withRetry — exponential backoff
// ---------------------------------------------------------------------------

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  backoffMs: number = 250,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const jitter = Math.random() * 0.3 + 0.85; // 0.85–1.15
        const delay = backoffMs * Math.pow(2, attempt) * jitter;
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// withRateLimit — sliding-window token bucket
// ---------------------------------------------------------------------------

interface TokenBucket {
  tokens: number;
  last_refill: number;
  last_accessed: number;
  max: number;
  window_ms: number;
}

const buckets = new Map<string, TokenBucket>();

/** Evict rate-limit buckets unused for more than this duration. */
const BUCKET_IDLE_TTL_MS = 60 * 60 * 1000; // 1 hour

function pruneIdleBuckets(now: number, keepName: string): void {
  for (const [k, b] of buckets) {
    if (k !== keepName && now - b.last_accessed > BUCKET_IDLE_TTL_MS) {
      buckets.delete(k);
    }
  }
}

/**
 * Returns a rate-limited wrapper around an async function.
 *
 * Uses a token-bucket algorithm: `maxRequests` tokens refill every
 * `windowMs` milliseconds.  If the bucket is empty the call waits
 * until a token becomes available.
 */
export function withRateLimit(
  name: string,
  maxRequests: number,
  windowMs: number,
): <T>(fn: () => Promise<T>) => Promise<T> {
  // Lazily initialise the bucket for this connector name.
  if (!buckets.has(name)) {
    buckets.set(name, {
      tokens: maxRequests,
      last_refill: Date.now(),
      last_accessed: Date.now(),
      max: maxRequests,
      window_ms: windowMs,
    });
  }

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const bucket = buckets.get(name)!;

    // Refill tokens based on elapsed time.
    const now = Date.now();
    pruneIdleBuckets(now, name);
    bucket.last_accessed = now;
    const elapsed = now - bucket.last_refill;
    const refill = Math.floor((elapsed / bucket.window_ms) * bucket.max);
    if (refill > 0) {
      bucket.tokens = Math.min(bucket.max, bucket.tokens + refill);
      bucket.last_refill = now;
    }

    // Wait if no tokens available.
    if (bucket.tokens <= 0) {
      const waitMs = bucket.window_ms / bucket.max;
      await sleep(waitMs);
      bucket.tokens = 1; // got one token after waiting
    }

    bucket.tokens -= 1;
    return fn();
  };
}

// ---------------------------------------------------------------------------
// withTimeout — promise race against a timer
// ---------------------------------------------------------------------------

export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// withIdempotency — 5-minute dedup cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: unknown;
  expires_at: number;
}

const idempotencyCache = new Map<string, CacheEntry>();

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * If `key` was already executed within the last 5 minutes, return the
 * cached result. Otherwise execute `fn`, cache the result, and return it.
 */
export async function withIdempotency<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  // Prune expired entries (cheap — runs inline, bounded by cache size).
  const now = Date.now();
  for (const [k, entry] of idempotencyCache) {
    if (entry.expires_at <= now) idempotencyCache.delete(k);
  }

  const cached = idempotencyCache.get(key);
  if (cached && cached.expires_at > now) {
    return cached.value as T;
  }

  const result = await fn();
  idempotencyCache.set(key, { value: result, expires_at: now + IDEMPOTENCY_TTL_MS });
  return result;
}

// ---------------------------------------------------------------------------
// refreshToken — mutex-guarded token refresh
// ---------------------------------------------------------------------------

interface TokenEntry {
  token: string;
  refreshing: Promise<string> | null;
  last_accessed: number;
}

const tokenStore = new Map<string, TokenEntry>();

/** Evict token entries unused for more than this duration (and not refreshing). */
const TOKEN_IDLE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function pruneIdleTokens(now: number, keepName: string): void {
  for (const [k, e] of tokenStore) {
    if (k !== keepName && !e.refreshing && now - e.last_accessed > TOKEN_IDLE_TTL_MS) {
      tokenStore.delete(k);
    }
  }
}

/**
 * Get a fresh token for `name`. If another call is already refreshing,
 * piggyback on the in-flight promise instead of issuing a duplicate request.
 */
export async function refreshToken(
  name: string,
  refreshFn: () => Promise<string>,
): Promise<string> {
  const now = Date.now();
  pruneIdleTokens(now, name);
  const entry = tokenStore.get(name);

  // If a refresh is already in-flight, wait for it.
  if (entry?.refreshing) {
    entry.last_accessed = now;
    return entry.refreshing;
  }

  const refreshPromise = refreshFn();

  // Store the in-flight promise so concurrent callers share it.
  const current: TokenEntry = {
    token: entry?.token ?? "",
    refreshing: refreshPromise,
    last_accessed: now,
  };
  tokenStore.set(name, current);

  try {
    const token = await refreshPromise;
    tokenStore.set(name, { token, refreshing: null, last_accessed: Date.now() });
    return token;
  } catch (err) {
    // Clear the in-flight marker so the next call retries.
    if (tokenStore.get(name)?.refreshing === refreshPromise) {
      tokenStore.set(name, {
        token: current.token,
        refreshing: null,
        last_accessed: Date.now(),
      });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
