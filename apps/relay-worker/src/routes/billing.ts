// Relay Worker — Centralized billing webhook.
//
// Stripe sends billing webhooks to ONE endpoint. Since there's no per-user
// webhook URL for billing, the relay handles Stripe billing webhooks centrally.
//
// Flow:
//   1. Stripe sends event to POST /billing/webhook
//   2. Relay verifies Stripe signature (relay has STRIPE_BILLING_WEBHOOK_SECRET)
//   3. Relay extracts jeriko_user_id from subscription metadata
//   4. Relay forwards to the connected daemon (if online)
//   5. Relay persists license state in DO storage (survives hibernation)
//
// The daemon checks its license via GET /billing/license/:userId — the relay
// responds from DO storage (populated by webhook events), with an in-memory
// cache for hot-path performance.

import { Hono } from "hono";
import type { ConnectionManager } from "../connections.js";
import type { Env } from "../lib/types.js";
import { safeCompare, verifyStripeSignature } from "../crypto.js";
import {
  createCheckoutSession,
  createPortalSession,
  StripeApiError,
} from "../lib/stripe-api.js";

// ---------------------------------------------------------------------------
// License cache types
// ---------------------------------------------------------------------------

export interface LicenseEntry {
  userId: string;
  tier: string;
  status: string;
  subscriptionId: string;
  customerId: string;
  email: string;
  updatedAt: number;
}

/** Maximum age for cache entries (30 days). Entries older than this are evicted on access. */
const LICENSE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** DO storage key prefix for license entries. */
const LICENSE_STORAGE_PREFIX = "license:";

/** Default license response for unknown or expired users. */
const FREE_LICENSE_RESPONSE = {
  tier: "free",
  status: "none",
  subscriptionId: null,
  customerId: null,
  email: null,
} as const;

// ---------------------------------------------------------------------------
// LicenseStore — DO-storage-backed license cache
// ---------------------------------------------------------------------------

/**
 * License store backed by Durable Object storage.
 *
 * Durable Object in-memory state is lost on hibernation. This class uses
 * `state.storage` (persistent KV) as the source of truth, with an in-memory
 * Map as a write-through cache for hot-path performance.
 *
 * Writes go to both the Map and DO storage (async, non-blocking to caller).
 * Reads check the Map first, then fall back to DO storage.
 */
export class LicenseStore {
  private readonly cache: Map<string, LicenseEntry>;
  private readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage, cache: Map<string, LicenseEntry>) {
    this.storage = storage;
    this.cache = cache;
  }

  /** Get a license entry. Checks in-memory cache first, then DO storage. */
  async get(userId: string): Promise<LicenseEntry | undefined> {
    // Hot path: in-memory cache
    const cached = this.cache.get(userId);
    if (cached) return cached;

    // Cold path: read from DO storage (survives hibernation)
    const stored = await this.storage.get<LicenseEntry>(`${LICENSE_STORAGE_PREFIX}${userId}`);
    if (stored) {
      // Hydrate the in-memory cache for subsequent reads
      this.cache.set(userId, stored);
    }
    return stored;
  }

  /** Set a license entry in both the in-memory cache and DO storage. */
  async set(userId: string, entry: LicenseEntry): Promise<void> {
    this.cache.set(userId, entry);
    await this.storage.put(`${LICENSE_STORAGE_PREFIX}${userId}`, entry);
  }

  /** Delete a license entry from both cache and storage. */
  async delete(userId: string): Promise<void> {
    this.cache.delete(userId);
    await this.storage.delete(`${LICENSE_STORAGE_PREFIX}${userId}`);
  }
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create billing routes with the given dependencies.
 *
 * @param connections   - ConnectionManager instance from the Durable Object
 * @param env           - Worker env bindings (for STRIPE_BILLING_WEBHOOK_SECRET, RELAY_AUTH_SECRET)
 * @param licenseStore  - Persistent license store (DO storage + in-memory cache)
 */
export function createBillingRoutes(
  connections: ConnectionManager,
  env: Env,
  licenseStore: LicenseStore,
): Hono {
  const router = new Hono();

  /**
   * POST /billing/webhook — Stripe billing webhook.
   *
   * Verifies the Stripe signature, extracts the user ID from metadata,
   * updates the license store, and optionally forwards to the connected daemon.
   */
  router.post("/webhook", async (c) => {
    const signatureHeader = c.req.header("stripe-signature") ?? "";
    const rawBody = await c.req.text();

    if (!signatureHeader) {
      return c.json({ ok: false, error: "Missing Stripe-Signature header" }, 400);
    }

    const webhookSecret = env.STRIPE_BILLING_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[billing] STRIPE_BILLING_WEBHOOK_SECRET not configured");
      return c.json({ ok: false, error: "Webhook secret not configured" }, 503);
    }

    // Verify Stripe signature (async — Web Crypto)
    const valid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
    if (!valid) {
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
      // Persist license state (DO storage + in-memory cache)
      await updateLicenseStore(licenseStore, userId, event);

      // Forward to connected daemon (if online)
      const conn = connections.getConnection(userId);
      if (conn) {
        connections.sendTo(userId, {
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
   * Returns the persisted license state from Stripe webhook events.
   *
   * Authentication: requires the daemon's auth token via Authorization header.
   * This prevents unauthenticated access to subscription/PII data.
   */
  router.get("/license/:userId", async (c) => {
    if (!(await authenticateRequest(c, env))) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    const userId = c.req.param("userId");
    const entry = await licenseStore.get(userId);

    // Evict stale entries (> 30 days)
    if (entry && Date.now() - entry.updatedAt > LICENSE_CACHE_TTL_MS) {
      await licenseStore.delete(userId);
      return c.json({ ok: true, data: FREE_LICENSE_RESPONSE });
    }

    if (!entry) {
      return c.json({ ok: true, data: FREE_LICENSE_RESPONSE });
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

  /**
   * POST /billing/checkout — Create Stripe Checkout session via relay.
   *
   * Allows distributed daemons to create checkout sessions without needing
   * the Stripe secret key locally. The relay holds the key and proxies the call.
   *
   * Authentication: Bearer RELAY_AUTH_SECRET (same as license endpoint).
   * Body: { userId: string, email: string, termsAccepted?: boolean }
   */
  router.post("/checkout", async (c) => {
    if (!(await authenticateRequest(c, env))) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    if (!env.STRIPE_BILLING_SECRET_KEY) {
      return c.json({ ok: false, error: "Stripe billing not configured on relay" }, 503);
    }

    if (!env.STRIPE_BILLING_PRICE_ID) {
      return c.json({ ok: false, error: "Stripe price ID not configured on relay" }, 503);
    }

    let body: { userId?: string; email?: string; termsAccepted?: boolean };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    if (!body.email) {
      return c.json({ ok: false, error: "email is required" }, 400);
    }

    if (!body.userId) {
      return c.json({ ok: false, error: "userId is required" }, 400);
    }

    const billingBaseUrl = (env.JERIKO_BILLING_URL || "https://jeriko.ai").replace(/\/+$/, "");

    try {
      const result = await createCheckoutSession({
        secretKey: env.STRIPE_BILLING_SECRET_KEY,
        priceId: env.STRIPE_BILLING_PRICE_ID,
        email: body.email,
        userId: body.userId,
        termsAccepted: body.termsAccepted ?? false,
        successUrl: `${billingBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${billingBaseUrl}/billing/cancel`,
      });

      return c.json({ ok: true, data: result });
    } catch (err) {
      const message = err instanceof StripeApiError ? err.message : "Checkout session creation failed";
      console.error(`[billing] Checkout error: ${err}`);
      return c.json({ ok: false, error: message }, 502);
    }
  });

  /**
   * POST /billing/portal — Create Stripe Customer Portal session via relay.
   *
   * Allows distributed daemons to create portal sessions without needing
   * the Stripe secret key locally.
   *
   * Authentication: Bearer RELAY_AUTH_SECRET.
   * Body: { customerId: string, returnUrl?: string }
   */
  router.post("/portal", async (c) => {
    if (!(await authenticateRequest(c, env))) {
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    if (!env.STRIPE_BILLING_SECRET_KEY) {
      return c.json({ ok: false, error: "Stripe billing not configured on relay" }, 503);
    }

    let body: { customerId?: string; returnUrl?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    if (!body.customerId) {
      return c.json({ ok: false, error: "customerId is required" }, 400);
    }

    const billingBaseUrl = (env.JERIKO_BILLING_URL || "https://jeriko.ai").replace(/\/+$/, "");

    try {
      const result = await createPortalSession({
        secretKey: env.STRIPE_BILLING_SECRET_KEY,
        customerId: body.customerId,
        returnUrl: body.returnUrl ?? `${billingBaseUrl}/billing`,
      });

      return c.json({ ok: true, data: result });
    } catch (err) {
      const message = err instanceof StripeApiError ? err.message : "Portal session creation failed";
      console.error(`[billing] Portal error: ${err}`);
      return c.json({ ok: false, error: message }, 502);
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Auth helper (shared by license, checkout, and portal routes)
// ---------------------------------------------------------------------------

/**
 * Authenticate a request using Bearer token against RELAY_AUTH_SECRET.
 * Returns true if authorized, false otherwise.
 */
async function authenticateRequest(c: { req: { header(name: string): string | undefined } }, env: Env): Promise<boolean> {
  const authHeader = c.req.header("authorization");
  const expectedSecret = env.RELAY_AUTH_SECRET;

  if (!expectedSecret || !authHeader) return false;

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  return safeCompare(token, expectedSecret);
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
function extractUserId(
  event: { type: string; data: { object: Record<string, unknown> } },
): string | null {
  const obj = event.data.object;
  const metadata = obj.metadata as Record<string, string> | undefined;

  // Direct metadata on the subscription or session
  if (metadata?.jeriko_user_id) return metadata.jeriko_user_id;

  // Subscription data within checkout session
  const subscriptionData = obj.subscription_data as Record<string, unknown> | undefined;
  const subMetadata = subscriptionData?.metadata as Record<string, string> | undefined;
  if (subMetadata?.jeriko_user_id) return subMetadata.jeriko_user_id;

  // Invoice events — the subscription object is nested or referenced.
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
 * Update the license store from a Stripe event.
 * Persists to DO storage so the state survives hibernation.
 */
async function updateLicenseStore(
  store: LicenseStore,
  userId: string,
  event: { type: string; data: { object: Record<string, unknown> } },
): Promise<void> {
  const obj = event.data.object;

  const entry: LicenseEntry = (await store.get(userId)) ?? {
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
  await store.set(userId, entry);
}
