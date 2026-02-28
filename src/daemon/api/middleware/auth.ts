// Daemon middleware — Bearer token authentication with timing-safe comparison.

import { timingSafeEqual } from "node:crypto";
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
// Timing-safe comparison
// ---------------------------------------------------------------------------

/**
 * Compare two strings in constant time to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Perform a dummy comparison so timing does not leak length info
    const padded = a.padEnd(b.length, "\0");
    const bufA = Buffer.from(padded, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    timingSafeEqual(bufA, bufB);
    return false;
  }

  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  return timingSafeEqual(bufA, bufB);
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
