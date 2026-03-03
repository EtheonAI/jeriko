// Relay Worker — Webhook ingress route.
//
// Receives external webhooks (Stripe, GitHub, PayPal, etc.) and forwards
// them to the correct user's daemon via WebSocket.
//
// URL format: POST /hooks/:userId/:triggerId
//
// The relay does NOT verify webhook signatures — that stays on the daemon
// where the secrets live. The relay is a transparent forwarder.

import { Hono } from "hono";
import type { ConnectionManager } from "../connections.js";
import type { RelayWebhookMessage } from "../../../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// Shared webhook forwarding logic
// ---------------------------------------------------------------------------

/**
 * Extract the raw body and lowercase headers from an incoming request.
 * Used by both the userId-scoped and legacy webhook routes.
 */
async function extractWebhookPayload(c: { req: { text(): Promise<string>; raw: Request } }): Promise<{
  body: string;
  headers: Record<string, string>;
  requestId: string;
}> {
  const body = await c.req.text();
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return { body, headers, requestId: crypto.randomUUID() };
}

/**
 * Build the webhook relay message from extracted payload.
 */
function buildWebhookMessage(
  requestId: string,
  triggerId: string,
  headers: Record<string, string>,
  body: string,
): RelayWebhookMessage {
  return {
    type: "webhook",
    requestId,
    triggerId,
    headers,
    body,
  };
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create webhook routes with the given connection manager.
 *
 * @param connections - ConnectionManager instance from the Durable Object
 */
export function createWebhookRoutes(connections: ConnectionManager): Hono {
  const router = new Hono();

  /**
   * POST /hooks/:userId/:triggerId — Forward webhook to user's daemon.
   *
   * Returns 200 immediately to the external service (async delivery).
   * If the user is not connected, returns 503 (daemon offline).
   * If the trigger is not registered for this user, returns 404.
   */
  router.post("/:userId/:triggerId", async (c) => {
    const userId = c.req.param("userId");
    const triggerId = c.req.param("triggerId");

    const conn = connections.getConnection(userId);
    if (!conn) {
      return c.json({
        ok: false,
        error: "Daemon not connected",
        user_id: userId,
      }, 503);
    }

    // Verify the trigger is actually registered for this user.
    // Prevents injection of fake webhook payloads to arbitrary trigger IDs.
    if (!conn.triggerIds.has(triggerId)) {
      return c.json({
        ok: false,
        error: "Trigger not registered for this user",
      }, 404);
    }

    const { body, headers, requestId } = await extractWebhookPayload(c);
    const message = buildWebhookMessage(requestId, triggerId, headers, body);

    const sent = connections.sendTo(userId, message);
    if (!sent) {
      return c.json({
        ok: false,
        error: "Failed to forward webhook (connection lost)",
      }, 503);
    }

    // Return 200 immediately — daemon processes asynchronously.
    // External services (Stripe, GitHub) expect a quick response.
    return c.json({ ok: true, data: { trigger_id: triggerId, request_id: requestId } });
  });

  /**
   * POST /hooks/:triggerId — Legacy format (no userId in URL).
   *
   * Looks up the trigger owner from registered triggers.
   * This supports backward compatibility during migration.
   */
  router.post("/:triggerId", async (c) => {
    const triggerId = c.req.param("triggerId");

    // Try to find which connected daemon owns this trigger
    const conn = connections.findByTriggerId(triggerId);
    if (!conn) {
      return c.json({
        ok: false,
        error: "No connected daemon owns this trigger",
      }, 503);
    }

    const { body, headers, requestId } = await extractWebhookPayload(c);
    const message = buildWebhookMessage(requestId, triggerId, headers, body);

    const sent = connections.sendTo(conn.userId, message);
    if (!sent) {
      return c.json({
        ok: false,
        error: "Failed to forward webhook (connection lost)",
      }, 503);
    }

    return c.json({ ok: true, data: { trigger_id: triggerId, request_id: requestId } });
  });

  return router;
}
