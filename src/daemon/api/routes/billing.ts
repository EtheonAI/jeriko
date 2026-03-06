// Billing routes — Stripe checkout, portal, plan info, and webhook.
//
// Authenticated routes (require auth, mounted at /billing):
//   GET  /billing/plan     — current tier, limits, usage counts
//   POST /billing/checkout — create Stripe Checkout session, return URL
//   POST /billing/portal   — create Stripe Customer Portal session, return URL
//   GET  /billing/events   — audit trail (recent events)
//
// Public routes (unauthenticated, mounted separately):
//   POST /billing/webhook  — Stripe webhook endpoint (signature-verified)

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Authenticated billing management routes
// ---------------------------------------------------------------------------

export function billingRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /billing/plan — Current plan info with usage counts.
   */
  router.get("/plan", async (c) => {
    const { getLicenseState } = await import("../../billing/license.js");
    const { getConfiguredConnectorCount } = await import("../../../shared/connector.js");
    const state = getLicenseState();

    // Use configured connector count — single source of truth across all surfaces
    const connectorCount = getConfiguredConnectorCount();

    let triggerCount = 0;
    try {
      const triggers = c.get("triggers" as never) as { listActive?: () => unknown[] } | undefined;
      if (triggers?.listActive) {
        triggerCount = triggers.listActive().length;
      }
    } catch { /* triggers not available */ }

    return c.json({
      ok: true,
      data: {
        tier: state.tier,
        label: state.label,
        status: state.status,
        email: state.email,
        connectors: {
          used: connectorCount,
          limit: state.connectorLimit,
        },
        triggers: {
          used: triggerCount,
          limit: state.triggerLimit === Infinity ? "unlimited" : state.triggerLimit,
        },
        pastDue: state.pastDue,
        gracePeriod: state.gracePeriod,
        validUntil: state.validUntil,
      },
    });
  });

  /**
   * POST /billing/checkout — Create Stripe Checkout session.
   *
   * Resolution strategy (tries in order):
   *   1. Relay proxy (works for all distributed users — no local Stripe keys)
   *   2. Direct Stripe SDK (self-hosted users with STRIPE_BILLING_SECRET_KEY)
   *
   * Body: { email: string, client_ip?: string, user_agent?: string }
   *
   * Client IP and user agent are captured for chargeback defense evidence.
   * If not provided in the body, they are extracted from the HTTP request.
   */
  router.post("/checkout", async (c) => {
    const body = await c.req.json<{
      email?: string;
      client_ip?: string;
      user_agent?: string;
    }>();

    if (!body.email) {
      return c.json({ ok: false, error: "email is required" }, 400);
    }

    const email = body.email;

    // Extract client metadata from request if not explicitly provided.
    // x-forwarded-for handles proxied requests; x-real-ip is a common alternative.
    const clientIp = body.client_ip
      ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      ?? c.req.header("x-real-ip")
      ?? "unknown";
    const userAgent = body.user_agent
      ?? c.req.header("user-agent")
      ?? "unknown";
    const clientMeta = { clientIp, userAgent };

    // Strategy 1: Try relay proxy first (distributed users)
    try {
      const { createCheckoutViaRelay } = await import("../../billing/relay-proxy.js");
      const relayResult = await createCheckoutViaRelay(email, clientMeta);
      if (relayResult) {
        return c.json({
          ok: true,
          data: { url: relayResult.url, session_id: relayResult.sessionId },
        });
      }
    } catch (err) {
      log.debug(`Relay checkout proxy unavailable: ${err}`);
    }

    // Strategy 2: Direct Stripe SDK (self-hosted fallback)
    try {
      const { isBillingConfigured } = await import("../../billing/stripe.js");
      if (!isBillingConfigured()) {
        return c.json({
          ok: false,
          error: "Unable to create checkout session — billing server unavailable. Check your internet connection.",
        }, 503);
      }

      const { createCheckoutSession } = await import("../../billing/stripe.js");
      const result = await createCheckoutSession(email, clientMeta);

      return c.json({
        ok: true,
        data: { url: result.url, session_id: result.sessionId },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Billing checkout failed: ${message}`);
      return c.json({ ok: false, error: message }, 500);
    }
  });

  /**
   * POST /billing/portal — Create Stripe Customer Portal session.
   *
   * Resolution strategy (tries in order):
   *   1. Relay proxy (works for all distributed users — no local Stripe keys)
   *   2. Direct Stripe SDK (self-hosted users with STRIPE_BILLING_SECRET_KEY)
   *
   * Body: { customer_id?: string }
   * If no customer_id, uses the one from the current subscription.
   */
  router.post("/portal", async (c) => {
    const body = await c.req.json<{
      customer_id?: string;
    }>().catch(() => ({ customer_id: undefined }));

    let customerId = body.customer_id;

    if (!customerId) {
      const { getSubscription } = await import("../../billing/store.js");
      const sub = getSubscription();
      customerId = sub?.customer_id;
    }

    if (!customerId) {
      return c.json({
        ok: false,
        error: "No active subscription found. Use `jeriko upgrade` to subscribe first.",
      }, 400);
    }

    // Strategy 1: Try relay proxy first (distributed users)
    try {
      const { createPortalViaRelay } = await import("../../billing/relay-proxy.js");
      const relayResult = await createPortalViaRelay(customerId);
      if (relayResult) {
        return c.json({ ok: true, data: { url: relayResult.url } });
      }
    } catch (err) {
      log.debug(`Relay portal proxy unavailable: ${err}`);
    }

    // Strategy 2: Direct Stripe SDK (self-hosted fallback)
    try {
      const { isBillingConfigured } = await import("../../billing/stripe.js");
      if (!isBillingConfigured()) {
        return c.json({
          ok: false,
          error: "Unable to open billing portal — billing server unavailable. Check your internet connection.",
        }, 503);
      }

      const { createPortalSession } = await import("../../billing/stripe.js");
      const result = await createPortalSession(customerId);

      return c.json({
        ok: true,
        data: { url: result.url },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Billing portal failed: ${message}`);
      return c.json({ ok: false, error: message }, 500);
    }
  });

  /**
   * GET /billing/events — Recent billing events (audit trail).
   *
   * Query: ?limit=50&type=invoice.paid
   */
  router.get("/events", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
    const type = c.req.query("type");

    const { getEventsByType, getRecentEvents } = await import("../../billing/store.js");

    const events = type
      ? getEventsByType(type, limit)
      : getRecentEvents(limit);

    // Return events without full payloads (summary only) unless requested
    const includePayload = c.req.query("include_payload") === "true";

    const data = events.map((e) => ({
      id: e.id,
      type: e.type,
      subscription_id: e.subscription_id,
      processed_at: e.processed_at,
      ...(includePayload ? { payload: e.payload } : {}),
    }));

    return c.json({ ok: true, data });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Public webhook route (unauthenticated — Stripe verifies via signature)
// ---------------------------------------------------------------------------

export function publicBillingRoutes(): Hono {
  const router = new Hono();

  /**
   * POST /billing/webhook — Stripe webhook endpoint.
   *
   * Signature is verified using STRIPE_BILLING_WEBHOOK_SECRET.
   * The raw body must be preserved (not re-serialized) for HMAC verification.
   *
   * After processing events that change the license (deletions, downgrades,
   * payment failures), enforce limits on active connectors and triggers.
   */
  router.post("/webhook", async (c) => {
    const signatureHeader = c.req.header("stripe-signature") ?? "";
    const rawBody = await c.req.text();

    if (!signatureHeader) {
      return c.json({ ok: false, error: "Missing Stripe-Signature header" }, 400);
    }

    const { processWebhookEvent } = await import("../../billing/webhook.js");
    const result = processWebhookEvent(rawBody, signatureHeader);

    if (!result.handled) {
      log.warn(`Billing webhook rejected: ${result.error}`);
      return c.json({ ok: false, error: result.error }, 400);
    }

    // Enforce license limits after events that may downgrade the tier.
    // This runs asynchronously — webhook response is sent immediately.
    const enforcementEvents = new Set([
      "customer.subscription.deleted",
      "customer.subscription.updated",
      "customer.subscription.paused",
      "invoice.payment_failed",
    ]);

    if (result.eventType && enforcementEvents.has(result.eventType)) {
      try {
        const connectors = c.get("connectors" as never) as
          | { enforceLimits(max: number): Promise<string[]>; activeCount: number }
          | undefined;
        const triggers = c.get("triggers" as never) as
          | { enforceLimits(max: number): string[]; enabledCount: number }
          | undefined;

        if (connectors && triggers) {
          const { enforceLicenseLimits } = await import("../../billing/license.js");
          const enforcement = await enforceLicenseLimits(connectors, triggers);

          if (enforcement.connectors.evicted.length > 0 || enforcement.triggers.disabled.length > 0) {
            log.info(
              `Webhook enforcement: evicted ${enforcement.connectors.evicted.length} connector(s), `
              + `disabled ${enforcement.triggers.disabled.length} trigger(s)`,
            );
          }
        }
      } catch (err) {
        log.warn(`Webhook enforcement failed (non-fatal): ${err}`);
      }
    }

    return c.json({ ok: true, data: { received: true } });
  });

  return router;
}
