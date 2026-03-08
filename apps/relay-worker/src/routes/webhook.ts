// Relay Worker — Webhook ingress route.
//
// Receives external webhooks (Stripe, GitHub, PayPal, etc.) and forwards
// them to the correct user's daemon via WebSocket.
//
// URL format: POST /hooks/:userId/:triggerId
//
// Also handles Meta platform (Instagram, Threads) webhook verification
// and broadcast-style forwarding for app-level webhooks.
//
// The relay does NOT verify webhook signatures — that stays on the daemon
// where the secrets live. The relay is a transparent forwarder.

import { Hono } from "hono";
import type { ConnectionManager } from "../connections.js";
import type { Env } from "../lib/types.js";
import type { RelayWebhookMessage } from "../../../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// Meta webhook verify token mapping
// ---------------------------------------------------------------------------

const META_VERIFY_TOKEN_KEYS: Readonly<Record<string, keyof Env>> = {
  instagram: "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
  threads: "THREADS_WEBHOOK_VERIFY_TOKEN",
};

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
 * @param env - Worker environment bindings (for Meta verify tokens)
 */
export function createWebhookRoutes(connections: ConnectionManager, env: Env): Hono {
  const router = new Hono();

  // -------------------------------------------------------------------------
  // Meta platform webhooks (Instagram, Threads)
  //
  // MUST be registered before the wildcard /:userId/:triggerId routes,
  // otherwise /hooks/meta/instagram matches as userId=meta, triggerId=instagram.
  //
  // Meta webhooks are app-level — no userId/triggerId in the URL.
  // GET  /hooks/meta/:provider — verification challenge (subscription setup)
  // POST /hooks/meta/:provider — event forwarding (broadcast to all daemons)
  // -------------------------------------------------------------------------

  /**
   * GET /hooks/meta/:provider — Meta webhook verification challenge.
   *
   * Meta sends this when subscribing a webhook in the app dashboard.
   * Must echo hub.challenge if hub.verify_token matches our secret.
   */
  router.get("/meta/:provider", (c) => {
    const provider = c.req.param("provider");
    const envKey = META_VERIFY_TOKEN_KEYS[provider];
    if (!envKey) {
      return c.json({ ok: false, error: `Unknown Meta provider: ${provider}` }, 404);
    }

    const verifyToken = env[envKey] as string | undefined;
    if (!verifyToken) {
      return c.json({ ok: false, error: `Verify token not configured for ${provider}` }, 500);
    }

    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");

    if (mode === "subscribe" && token === verifyToken) {
      return c.text(challenge ?? "", 200);
    }

    return c.json({ ok: false, error: "Verification failed" }, 403);
  });

  /**
   * POST /hooks/meta/:provider — Receive Meta webhook events.
   *
   * Meta webhooks are app-level (not per-user), so we broadcast
   * to all connected daemons using the existing forwarding helpers.
   */
  router.post("/meta/:provider", async (c) => {
    const provider = c.req.param("provider");
    if (!META_VERIFY_TOKEN_KEYS[provider]) {
      return c.json({ ok: false, error: `Unknown Meta provider: ${provider}` }, 404);
    }

    const { body, headers, requestId } = await extractWebhookPayload(c);
    const triggerId = `meta:${provider}`;

    // Broadcast to all connected daemons
    let forwarded = 0;
    for (const userId of connections.getAllUserIds()) {
      const message = buildWebhookMessage(requestId, triggerId, headers, body);
      if (connections.sendTo(userId, message)) forwarded++;
    }

    return c.json({ ok: true, data: { provider, forwarded } });
  });

  // -------------------------------------------------------------------------
  // Connector-level webhooks (app-level, broadcast to all daemons)
  //
  // Providers like PayPal, Stripe, etc. send webhooks to a single fixed URL
  // configured in their dashboard. These are NOT per-user — the relay
  // broadcasts to all connected daemons and each daemon verifies the
  // signature with its own secrets.
  //
  // POST /hooks/connector/:provider — forward to all connected daemons
  // -------------------------------------------------------------------------

  router.post("/connector/:provider", async (c) => {
    const provider = c.req.param("provider");
    const { body, headers, requestId } = await extractWebhookPayload(c);
    const triggerId = `connector:${provider}`;

    let forwarded = 0;
    for (const userId of connections.getAllUserIds()) {
      const message = buildWebhookMessage(requestId, triggerId, headers, body);
      if (connections.sendTo(userId, message)) forwarded++;
    }

    if (forwarded === 0) {
      return c.json({ ok: false, error: "No connected daemons" }, 503);
    }

    return c.json({ ok: true, data: { provider, forwarded } });
  });

  // -------------------------------------------------------------------------
  // Standard webhook routes (per-user, per-trigger)
  // -------------------------------------------------------------------------

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
