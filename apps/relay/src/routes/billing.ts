// Relay — Centralized billing webhook.
//
// Stripe sends billing webhooks to ONE endpoint. Since there's no per-user
// webhook URL for billing, the relay handles Stripe billing webhooks centrally.
//
// Flow:
//   1. Stripe sends event to POST /billing/webhook
//   2. Relay verifies Stripe signature (relay has STRIPE_BILLING_WEBHOOK_SECRET)
//   3. Relay extracts jeriko_user_id from subscription metadata
//   4. Relay forwards to the connected daemon (if online)
//   5. Relay also stores the event for license verification API
//
// The daemon checks its license via GET /billing/license/:userId — the relay
// responds from its own cache (populated by webhook events).

import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getConnection, sendTo } from "../connections.js";

// ---------------------------------------------------------------------------
// In-memory license cache (populated by Stripe webhooks)
// ---------------------------------------------------------------------------

interface LicenseEntry {
  userId: string;
  tier: string;
  status: string;
  subscriptionId: string;
  customerId: string;
  email: string;
  updatedAt: number;
}

const licenseCache = new Map<string, LicenseEntry>();

/** Maximum age for cache entries (30 days). Entries older than this are evicted on access. */
const LICENSE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function billingRoutes(): Hono {
  const router = new Hono();

  /**
   * POST /billing/webhook — Stripe billing webhook.
   *
   * Verifies the Stripe signature, extracts the user ID from metadata,
   * updates the license cache, and optionally forwards to the connected daemon.
   */
  router.post("/webhook", async (c) => {
    const signatureHeader = c.req.header("stripe-signature") ?? "";
    const rawBody = await c.req.text();

    if (!signatureHeader) {
      return c.json({ ok: false, error: "Missing Stripe-Signature header" }, 400);
    }

    const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[billing] STRIPE_BILLING_WEBHOOK_SECRET not configured");
      return c.json({ ok: false, error: "Webhook secret not configured" }, 503);
    }

    // Verify Stripe signature
    if (!verifyStripeSignature(rawBody, signatureHeader, webhookSecret)) {
      return c.json({ ok: false, error: "Invalid signature" }, 400);
    }

    let event: { id: string; type: string; data: { object: Record<string, unknown> } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return c.json({ ok: false, error: "Invalid JSON" }, 400);
    }

    // Extract jeriko_user_id from subscription or session metadata
    const userId = extractUserId(event);

    if (userId) {
      // Update license cache
      updateLicenseCache(userId, event);

      // Forward to connected daemon (if online)
      const conn = getConnection(userId);
      if (conn) {
        sendTo(userId, {
          type: "webhook",
          requestId: event.id,
          triggerId: "__billing__",
          headers: { "stripe-signature": signatureHeader, "content-type": "application/json" },
          body: rawBody,
        });
      }
    }

    return c.json({ ok: true, data: { received: true } });
  });

  /**
   * GET /billing/license/:userId — License check API.
   *
   * Called by daemons to verify their subscription status.
   * Returns the cached license state from Stripe webhook events.
   *
   * Authentication: requires the daemon's auth token via Authorization header.
   * This prevents unauthenticated access to subscription/PII data.
   */
  router.get("/license/:userId", (c) => {
    // Authenticate the request — daemon must provide its auth token
    const authHeader = c.req.header("authorization");
    const expectedSecret = process.env.RELAY_AUTH_SECRET;

    if (!expectedSecret || !authHeader) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    // Use HMAC-based comparison to prevent timing attacks
    const hashExpected = createHmac("sha256", "license-auth").update(expectedSecret).digest();
    const hashProvided = createHmac("sha256", "license-auth").update(token).digest();
    if (!timingSafeEqual(hashExpected, hashProvided)) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    const userId = c.req.param("userId");
    const entry = licenseCache.get(userId);

    // Evict stale entries
    if (entry && Date.now() - entry.updatedAt > LICENSE_CACHE_TTL_MS) {
      licenseCache.delete(userId);
      return c.json({
        ok: true,
        data: {
          tier: "free",
          status: "none",
          subscriptionId: null,
          customerId: null,
          email: null,
        },
      });
    }

    if (!entry) {
      return c.json({
        ok: true,
        data: {
          tier: "free",
          status: "none",
          subscriptionId: null,
          customerId: null,
          email: null,
        },
      });
    }

    return c.json({
      ok: true,
      data: {
        tier: entry.tier,
        status: entry.status,
        subscriptionId: entry.subscriptionId,
        customerId: entry.customerId,
        email: entry.email,
        updatedAt: entry.updatedAt,
      },
    });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Stripe signature verification (standalone — no Stripe SDK dependency)
// ---------------------------------------------------------------------------

/**
 * Verify Stripe webhook signature using HMAC-SHA256.
 * Matches the format: t=timestamp,v1=signature
 */
function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  try {
    const parts: Record<string, string> = {};

    for (const item of signatureHeader.split(",")) {
      const [key, value] = item.split("=", 2);
      if (key && value) parts[key.trim()] = value.trim();
    }

    const timestamp = parts.t;
    const expectedSig = parts.v1;
    if (!timestamp || !expectedSig) return false;

    // Reject timestamps older than 5 minutes (replay protection)
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

    const signedPayload = `${timestamp}.${rawBody}`;
    const computedSig = createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    return timingSafeEqual(
      Buffer.from(computedSig),
      Buffer.from(expectedSig),
    );
  } catch (err) {
    console.error("[billing] Stripe signature verification error:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract jeriko_user_id from Stripe event metadata.
 *
 * Checks (in order):
 *   1. Direct metadata on the subscription or checkout session
 *   2. subscription_data.metadata (from checkout session creation)
 *   3. Invoice → subscription metadata (for invoice events)
 */
function extractUserId(event: { type: string; data: { object: Record<string, unknown> } }): string | null {
  const obj = event.data.object;
  const metadata = obj.metadata as Record<string, string> | undefined;

  // Direct metadata on the subscription or session
  if (metadata?.jeriko_user_id) return metadata.jeriko_user_id;

  // Subscription data within checkout session
  const subscriptionData = obj.subscription_data as Record<string, unknown> | undefined;
  const subMetadata = subscriptionData?.metadata as Record<string, string> | undefined;
  if (subMetadata?.jeriko_user_id) return subMetadata.jeriko_user_id;

  // Invoice events — the subscription object is nested or referenced
  // Stripe invoice events include `subscription` as an ID string or expanded object.
  // If expanded, check its metadata.
  if (event.type.startsWith("invoice.")) {
    const subscription = obj.subscription as Record<string, unknown> | string | undefined;
    if (typeof subscription === "object" && subscription !== null) {
      const invoiceSubMetadata = subscription.metadata as Record<string, string> | undefined;
      if (invoiceSubMetadata?.jeriko_user_id) return invoiceSubMetadata.jeriko_user_id;
    }
  }

  return null;
}

/**
 * Update the in-memory license cache from a Stripe event.
 */
function updateLicenseCache(
  userId: string,
  event: { type: string; data: { object: Record<string, unknown> } },
): void {
  const obj = event.data.object;

  const entry: LicenseEntry = licenseCache.get(userId) ?? {
    userId,
    tier: "free",
    status: "none",
    subscriptionId: "",
    customerId: "",
    email: "",
    updatedAt: Date.now(),
  };

  // Subscription events
  if (event.type.startsWith("customer.subscription.")) {
    entry.subscriptionId = (obj.id as string) ?? entry.subscriptionId;
    entry.customerId = (obj.customer as string) ?? entry.customerId;
    entry.status = (obj.status as string) ?? entry.status;

    const metadata = obj.metadata as Record<string, string> | undefined;
    // Preserve tier from metadata if present, otherwise infer from status
    if (metadata?.tier) {
      entry.tier = metadata.tier;
    } else if (entry.status === "canceled") {
      entry.tier = "free";
    } else if (entry.status === "active" || entry.status === "trialing") {
      // Only default to "pro" for active subscriptions without explicit tier
      entry.tier = entry.tier === "free" ? "pro" : entry.tier;
    }

    if (event.type === "customer.subscription.deleted") {
      entry.tier = "free";
      entry.status = "canceled";
    }
  }

  // Checkout completed
  if (event.type === "checkout.session.completed") {
    entry.subscriptionId = (obj.subscription as string) ?? entry.subscriptionId;
    entry.customerId = (obj.customer as string) ?? entry.customerId;
    entry.email = (obj.customer_email as string) ?? entry.email;
    entry.tier = "pro";
    entry.status = "active";
  }

  // Invoice events — update status based on payment outcome
  if (event.type === "invoice.payment_failed") {
    entry.status = "past_due";
  }
  if (event.type === "invoice.payment_succeeded") {
    entry.status = "active";
  }

  entry.updatedAt = Date.now();
  licenseCache.set(userId, entry);
}
