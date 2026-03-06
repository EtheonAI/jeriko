// Channel routes — list channels, connect, disconnect, webhook/event ingress.

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";
import type { ChannelRegistry } from "../../services/channels/index.js";
import type { IMessageChannel } from "../../services/channels/imessage.js";
import type { GoogleChatChannel } from "../../services/channels/googlechat.js";

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

// ---------------------------------------------------------------------------
// Channel event ingress routes — unauthenticated (external services post here)
// ---------------------------------------------------------------------------

export function channelEventRoutes(): Hono {
  const router = new Hono();

  /**
   * POST /channel-events/imessage — BlueBubbles webhook ingress.
   *
   * BlueBubbles sends webhook events here when configured with this URL.
   * The adapter's handleWebhookEvent() dispatches to the channel router.
   */
  router.post("/imessage", async (c) => {
    const channels = c.get("channels" as never) as ChannelRegistry;
    if (!channels) {
      return c.json({ ok: false, error: "Channel registry not available" }, 503);
    }

    const adapter = channels.get("imessage") as IMessageChannel | undefined;
    if (!adapter || !adapter.isConnected()) {
      return c.json({ ok: false, error: "iMessage channel not connected" }, 503);
    }

    try {
      const body = await c.req.json();
      adapter.handleWebhookEvent(body);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`iMessage webhook error: ${message}`);
      return c.json({ ok: false, error: message }, 400);
    }
  });

  /**
   * POST /channel-events/googlechat — Google Chat event ingress.
   *
   * Google Chat posts events here (MESSAGE, ADDED_TO_SPACE, CARD_CLICKED, etc.).
   * The bot's HTTPS endpoint in Google Cloud Console should point to this URL.
   *
   * Returns a synchronous response for ADDED_TO_SPACE (welcome message),
   * and empty for MESSAGE events (handled async via the Chat API).
   */
  router.post("/googlechat", async (c) => {
    const channels = c.get("channels" as never) as ChannelRegistry;
    if (!channels) {
      return c.json({ ok: false, error: "Channel registry not available" }, 503);
    }

    const adapter = channels.get("googlechat") as GoogleChatChannel | undefined;
    if (!adapter || !adapter.isConnected()) {
      return c.json({ ok: false, error: "Google Chat channel not connected" }, 503);
    }

    try {
      const event = await c.req.json();
      const type = event.type as string;

      // Card click events dispatch as commands
      if (type === "CARD_CLICKED") {
        adapter.handleCardClick(event);
        return c.json({});
      }

      // All other events (MESSAGE, ADDED_TO_SPACE, etc.)
      const syncResponse = adapter.handleEvent(event);

      // If handleEvent returns a response body, send it back synchronously
      // (Google Chat expects this for ADDED_TO_SPACE welcome messages)
      if (syncResponse) {
        return c.json(syncResponse);
      }

      // Async processing — acknowledge with empty response
      return c.json({});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Google Chat event error: ${message}`);
      return c.json({ ok: false, error: message }, 400);
    }
  });

  return router;
}
