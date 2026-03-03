// Relay — Health and status routes.

import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getStats } from "../connections.js";

const startTime = Date.now();

export function healthRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /health — Basic health check.
   *
   * Unauthenticated — used by load balancers and monitoring.
   * Only exposes aggregate data (connection count), no user details.
   */
  router.get("/", (c) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const stats = getStats();

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
  router.get("/status", (c) => {
    const expectedSecret = process.env.RELAY_AUTH_SECRET;
    const authHeader = c.req.header("authorization");

    if (!expectedSecret || !authHeader) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    const hashExpected = createHmac("sha256", "status-auth").update(expectedSecret).digest();
    const hashProvided = createHmac("sha256", "status-auth").update(token).digest();
    if (!timingSafeEqual(hashExpected, hashProvided)) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    const stats = getStats();
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    return c.json({
      ok: true,
      data: {
        uptime_seconds: uptimeSeconds,
        connections: stats.totalConnections,
        users: stats.users,
        memory: {
          rss_mb: Math.round(process.memoryUsage.rss() / 1024 / 1024),
        },
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}
