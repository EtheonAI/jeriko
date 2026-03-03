// Relay Worker — Health and status routes.

import { Hono } from "hono";
import type { ConnectionManager } from "../connections.js";
import type { Env } from "../lib/types.js";
import { safeCompare } from "../crypto.js";

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create health routes with the given dependencies.
 *
 * @param connections - ConnectionManager instance from the Durable Object
 * @param env        - Worker env bindings (for RELAY_AUTH_SECRET)
 * @param startTime  - Timestamp when the DO was instantiated (for uptime)
 */
export function createHealthRoutes(
  connections: ConnectionManager,
  env: Env,
  startTime: number,
): Hono {
  const router = new Hono();

  /**
   * GET /health — Basic health check.
   *
   * Unauthenticated — used by load balancers and monitoring.
   * Only exposes aggregate data (connection count), no user details.
   */
  router.get("/", (c) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const stats = connections.getStats();

    return c.json({
      ok: true,
      data: {
        service: "jeriko-relay",
        status: "healthy",
        uptime_seconds: uptimeSeconds,
        connected_daemons: stats.totalConnections,
        timestamp: new Date().toISOString(),
      },
    });
  });

  /**
   * GET /health/status — Detailed relay status (authenticated).
   *
   * Requires RELAY_AUTH_SECRET via Authorization header.
   * Exposes connection details, user IDs, versions — admin-only.
   */
  router.get("/status", async (c) => {
    const expectedSecret = env.RELAY_AUTH_SECRET;
    const authHeader = c.req.header("authorization");

    if (!expectedSecret || !authHeader) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    // Timing-safe comparison (async — Web Crypto)
    const authorized = await safeCompare(token, expectedSecret);
    if (!authorized) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    const stats = connections.getStats();
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    return c.json({
      ok: true,
      data: {
        uptime_seconds: uptimeSeconds,
        connections: stats.totalConnections,
        users: stats.users,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}
