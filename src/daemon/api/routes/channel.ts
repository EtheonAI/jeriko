// Channel routes — list channels, connect, disconnect.

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";
import type { ChannelRegistry } from "../../services/channels/index.js";

const log = getLogger();

export function channelRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /channel — List all registered channels with their status.
   */
  router.get("/", (c) => {
    const channels = c.get("channels" as never) as ChannelRegistry;

    if (!channels) {
      return c.json({ ok: false, error: "Channel registry not available" }, 503);
    }

    return c.json({
      ok: true,
      data: channels.status(),
    });
  });

  /**
   * POST /channel/:name/connect — Connect a channel by name.
   */
  router.post("/:name/connect", async (c) => {
    const name = c.req.param("name");
    const channels = c.get("channels" as never) as ChannelRegistry;

    if (!channels) {
      return c.json({ ok: false, error: "Channel registry not available" }, 503);
    }

    const adapter = channels.get(name);
    if (!adapter) {
      return c.json({ ok: false, error: `Channel "${name}" is not registered` }, 404);
    }

    try {
      await channels.connect(name);
      const status = channels.statusOf(name);
      log.info(`Channel connected via API: ${name}`);

      return c.json({ ok: true, data: status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Channel connect failed via API: ${name} — ${message}`);
      return c.json({ ok: false, error: message }, 500);
    }
  });

  /**
   * POST /channel/:name/disconnect — Disconnect a channel by name.
   */
  router.post("/:name/disconnect", async (c) => {
    const name = c.req.param("name");
    const channels = c.get("channels" as never) as ChannelRegistry;

    if (!channels) {
      return c.json({ ok: false, error: "Channel registry not available" }, 503);
    }

    const adapter = channels.get(name);
    if (!adapter) {
      return c.json({ ok: false, error: `Channel "${name}" is not registered` }, 404);
    }

    try {
      await channels.disconnect(name);
      const status = channels.statusOf(name);
      log.info(`Channel disconnected via API: ${name}`);

      return c.json({ ok: true, data: status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Channel disconnect failed via API: ${name} — ${message}`);
      return c.json({ ok: false, error: message }, 500);
    }
  });

  return router;
}
