// Connector routes — health, status, and call dispatch for external integrations.

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";
import type { ConnectorManager } from "../../services/connectors/manager.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function connectorRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /connector — List all connectors with their configuration and health status.
   *
   * Iterates CONNECTOR_DEFS via ConnectorManager, runs real health checks
   * (cached for 30s), and returns structured status for each connector.
   */
  router.get("/", async (c) => {
    const connectors = c.get("connectors" as never) as ConnectorManager;

    if (!connectors) {
      return c.json({ ok: false, error: "Connector manager not available" }, 503);
    }

    const statuses = await connectors.healthAll();
    return c.json({ ok: true, data: statuses });
  });

  /**
   * GET /connector/:name — Get status of a specific connector.
   */
  router.get("/:name", async (c) => {
    const name = c.req.param("name");
    const connectors = c.get("connectors" as never) as ConnectorManager;

    if (!connectors) {
      return c.json({ ok: false, error: "Connector manager not available" }, 503);
    }

    if (!connectors.names.includes(name)) {
      return c.json({ ok: false, error: `Unknown connector: "${name}"` }, 404);
    }

    const status = await connectors.health(name);
    return c.json({ ok: true, data: status });
  });

  /**
   * POST /connector/:name/call — Execute a method on a connector.
   *
   * Body: { method: "charges.list", params: { limit: 10 } }
   */
  router.post("/:name/call", async (c) => {
    const name = c.req.param("name");
    const connectors = c.get("connectors" as never) as ConnectorManager;

    if (!connectors) {
      return c.json({ ok: false, error: "Connector manager not available" }, 503);
    }

    const connector = await connectors.get(name);
    if (!connector) {
      return c.json({ ok: false, error: `Connector "${name}" is not available` }, 404);
    }

    const body = await c.req.json<{ method: string; params?: Record<string, unknown> }>();
    if (!body.method) {
      return c.json({ ok: false, error: "method is required" }, 400);
    }

    const result = await connector.call(body.method, body.params ?? {});
    return c.json(result, result.ok ? 200 : 502);
  });

  return router;
}
