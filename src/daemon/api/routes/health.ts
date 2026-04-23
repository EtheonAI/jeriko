// Health endpoint — returns daemon status, uptime, and subsystem health.

import { Hono } from "hono";
import { diagnosticsSnapshot } from "../../../shared/diagnostics.js";

const startTime = Date.now();

export function healthRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /health — Basic health check.
   *
   * No authentication required. Used by load balancers, monitoring, and
   * the `jeriko service status` CLI command.
   */
  router.get("/", (c) => {
    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const diag = diagnosticsSnapshot();

    return c.json({
      ok: true,
      data: {
        status: "healthy",
        version: diag.version,
        build_ref: diag.buildRef,
        platform: diag.platform,
        os_release: diag.osRelease,
        runtime: diag.runtime,
        uptime_seconds: uptimeSeconds,
        uptime_human: formatUptime(uptimeSeconds),
        memory: {
          rss_mb: Math.round(process.memoryUsage.rss() / 1024 / 1024),
          heap_mb: Math.round(
            (process.memoryUsage as unknown as { heapUsed?: () => number }).heapUsed?.() ??
            process.memoryUsage.rss() / 2 / 1024 / 1024,
          ),
        },
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(" ");
}
