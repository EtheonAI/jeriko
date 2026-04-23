// Daemon middleware — Bearer token authentication with timing-safe comparison.

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { Context, Next } from "hono";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthMiddlewareOptions {
  /** Environment variable name holding the auth secret. Default: NODE_AUTH_SECRET */
  envVar?: string;
  /** Header name to read the token from. Default: "Authorization" */
  headerName?: string;
  /** Paths that skip authentication (exact match). */
  skipPaths?: string[];
}

// ---------------------------------------------------------------------------
// Timing-safe comparison — HMAC-based, length-agnostic
// ---------------------------------------------------------------------------

/**
 * Process-lifetime HMAC key used to canonicalize strings to fixed-length
 * digests. Generated fresh on module load so digests aren't reproducible
 * across runs, which prevents precomputed timing-probe tables from being
 * reused against new processes.
 *
 * The key does not need to be secret: HMAC's timing cost is input-length
 * dependent, but both sides of the comparison pass through the same
 * HMAC before the constant-time `timingSafeEqual` runs. The digests
 * themselves are always 32 bytes, so the final comparison is length-agnostic.
 */
const COMPARE_HMAC_KEY = randomBytes(32);

function canonicalize(value: string): Buffer {
  return createHmac("sha256", COMPARE_HMAC_KEY).update(value, "utf-8").digest();
}

/**
 * Compare two strings in constant time, independent of input lengths.
 *
 * Implementation: HMAC-SHA256 both inputs to produce fixed-length 32-byte
 * digests, then `timingSafeEqual` the digests. Length differences are
 * absorbed by the HMAC (variable-time there, but the attacker sees the
 * same downstream comparison cost regardless). We also check actual
 * length equality — HMAC digest collisions are astronomically unlikely
 * but the explicit check is cheap insurance and keeps intent obvious.
 */
export function safeCompare(a: string, b: string): boolean {
  const digestsEqual = timingSafeEqual(canonicalize(a), canonicalize(b));
  const lengthsEqual = a.length === b.length;
  return digestsEqual && lengthsEqual;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create a Hono middleware that validates Bearer tokens.
 *
 * The secret is read from the `NODE_AUTH_SECRET` environment variable.
 * If the variable is not set, all requests are rejected — no fallback.
 */
export function authMiddleware(
  opts: AuthMiddlewareOptions = {},
): (c: Context, next: Next) => Promise<Response | void> {
  const envVar = opts.envVar ?? "NODE_AUTH_SECRET";
  const headerName = opts.headerName ?? "Authorization";
  const skipPaths = new Set(opts.skipPaths ?? []);

  return async (c: Context, next: Next): Promise<Response | void> => {
    const path = new URL(c.req.url).pathname;

    if (skipPaths.has(path)) {
      return next();
    }

    const secret = process.env[envVar];
    if (!secret) {
      log.audit("Auth rejected: secret not configured", { envVar, path });
      return c.json(
        { ok: false, error: "Server authentication is not configured" },
        503,
      );
    }

    const authHeader = c.req.header(headerName);
    if (!authHeader) {
      log.audit("Auth rejected: no Authorization header", { path });
      return c.json({ ok: false, error: "Missing Authorization header" }, 401);
    }

    // Support "Bearer <token>" format
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      log.audit("Auth rejected: empty token", { path });
      return c.json({ ok: false, error: "Empty authorization token" }, 401);
    }

    if (!safeCompare(token, secret)) {
      log.audit("Auth rejected: invalid token", { path });
      return c.json({ ok: false, error: "Invalid authorization token" }, 403);
    }

    return next();
  };
}
