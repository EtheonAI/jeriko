// Webhook routes — receive external webhooks and dispatch to trigger engine.

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";
import type { TriggerEngine } from "../../services/triggers/engine.js";

const log = getLogger();

export function webhookRoutes(): Hono {
  const router = new Hono();

  /**
   * POST /hooks/:triggerId — Receive an external webhook.
   *
   * The trigger engine verifies the signature and dispatches the action.
   * No auth required — webhooks authenticate via signature headers.
   */
  router.post("/:triggerId", async (c) => {
    const triggerId = c.req.param("triggerId");
    const triggers = c.get("triggers" as never) as TriggerEngine;

    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    // Read the raw body for signature verification
    const rawBody = await c.req.text();
    let payload: unknown;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = rawBody;
    }

    // Collect headers into a plain object (lowercase keys)
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    try {
      const handled = await triggers.handleWebhook(triggerId, payload, headers, rawBody);

      if (!handled) {
        log.warn(`Webhook received for unknown/disabled trigger: ${triggerId}`);
        return c.json({ ok: false, error: "Trigger not found or disabled" }, 404);
      }

      log.info(`Webhook received and dispatched: ${triggerId}`);
      return c.json({ ok: true, data: { trigger_id: triggerId } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Webhook processing error for ${triggerId}: ${message}`);
      return c.json({ ok: false, error: "Webhook processing failed" }, 500);
    }
  });

  return router;
}
