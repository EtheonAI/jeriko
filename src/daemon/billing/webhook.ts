// Billing webhook processor — handles Stripe subscription lifecycle events.
//
// Every event is stored in billing_event with full payload (chargeback protection).
// Idempotent — duplicate events are silently ignored.
//
// Reuses verifyStripeSignature() from the Stripe connector for signature verification.

import { getLogger } from "../../shared/logger.js";
import { verifyStripeSignature } from "../services/connectors/stripe/webhook.js";
import { loadBillingConfig, TIER_LIMITS, UNLIMITED_TRIGGERS_STORED, GRACE_PERIOD_MS, type BillingTier, isBillingTier } from "./config.js";
import {
  upsertSubscription,
  recordEvent,
  recordConsent,
  hasEvent,
  updateLicense,
  getSubscriptionById,
} from "./store.js";
import {
  parseCheckoutSession,
  parseSubscription,
  parseInvoice,
  parseEventEnvelope,
  StripeEventParseError,
} from "./stripe-events.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookResult {
  handled: boolean;
  eventId?: string;
  eventType?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Event handlers (keyed by Stripe event type)
// ---------------------------------------------------------------------------

type EventHandler = (event: StripeEvent) => void;

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

const EVENT_HANDLERS: Record<string, EventHandler> = {
  "checkout.session.completed": handleCheckoutCompleted,
  "customer.subscription.created": handleSubscriptionChange,
  "customer.subscription.updated": handleSubscriptionChange,
  "customer.subscription.deleted": handleSubscriptionDeleted,
  "customer.subscription.paused": handleSubscriptionPaused,
  "customer.subscription.resumed": handleSubscriptionResumed,
  "invoice.paid": handleInvoicePaid,
  "invoice.payment_failed": handleInvoicePaymentFailed,
  "invoice.payment_action_required": handlePaymentActionRequired,
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface WebhookOptions {
  /**
   * When true, skip local signature verification.
   *
   * Used for webhooks forwarded from the relay server, which already
   * verified the Stripe signature before forwarding. The daemon trusts
   * the relay's verification since communication is authenticated via
   * RELAY_AUTH_SECRET over a secure WebSocket.
   *
   * Direct webhooks (self-hosted mode) always verify locally.
   */
  trusted?: boolean;
}

/**
 * Process a Stripe webhook event.
 *
 * @param rawBody         Raw request body string (for signature verification)
 * @param signatureHeader Stripe-Signature header value
 * @param options         Processing options (e.g. trusted relay forwarding)
 * @returns Processing result with handled status
 */
export function processWebhookEvent(
  rawBody: string,
  signatureHeader: string,
  options?: WebhookOptions,
): WebhookResult {
  // Skip signature verification for trusted relay-forwarded webhooks
  if (!options?.trusted) {
    const config = loadBillingConfig();
    if (!config?.stripeWebhookSecret) {
      log.warn("Billing webhook: no webhook secret configured");
      return { handled: false, error: "Webhook secret not configured" };
    }

    if (!verifyStripeSignature(rawBody, signatureHeader, config.stripeWebhookSecret)) {
      log.warn("Billing webhook: signature verification failed");
      return { handled: false, error: "Invalid signature" };
    }
  }

  // Parse and validate the event envelope.
  // JSON.parse handles syntactic validity; parseEventEnvelope enforces the
  // shape we rely on (id, type, data.object).
  let event: StripeEvent;
  try {
    const parsed = parseEventEnvelope(JSON.parse(rawBody));
    event = { id: parsed.id, type: parsed.type, data: { object: parsed.data.object } };
  } catch (err) {
    if (err instanceof StripeEventParseError) {
      log.warn(`Billing webhook: ${err.message}`);
      return { handled: false, error: err.message };
    }
    log.warn("Billing webhook: failed to parse event body");
    return { handled: false, error: "Invalid JSON" };
  }

  // Idempotency: skip already-processed events
  if (hasEvent(event.id)) {
    log.debug(`Billing webhook: event ${event.id} already processed — skipping`);
    return { handled: true, eventId: event.id, eventType: event.type };
  }

  // Record the full event payload (audit trail / chargeback protection)
  const subscriptionId = extractSubscriptionId(event);
  recordEvent({
    id: event.id,
    type: event.type,
    subscription_id: subscriptionId,
    payload: rawBody,
  });

  // Dispatch to handler
  const handler = EVENT_HANDLERS[event.type];
  if (handler) {
    try {
      handler(event);
      log.info(`Billing webhook: processed ${event.type} (${event.id})`);
    } catch (err) {
      log.error(`Billing webhook: handler failed for ${event.type}: ${err}`);
      return { handled: false, eventId: event.id, eventType: event.type, error: String(err) };
    }
  } else {
    log.debug(`Billing webhook: unhandled event type ${event.type}`);
  }

  return { handled: true, eventId: event.id, eventType: event.type };
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * Checkout completed — customer just subscribed.
 *
 * Creates subscription record, stores consent evidence for chargeback
 * defense, and updates the local license cache.
 *
 * Consent data is extracted from:
 *   - session.consent (Stripe consent_collection result)
 *   - session.metadata (client_ip, user_agent passed at session creation)
 *   - subscription_data.metadata (propagated from session creation)
 */
function handleCheckoutCompleted(event: StripeEvent): void {
  const session = parseCheckoutSession(event.type, event.data.object);

  if (!session.subscription || !session.customer) {
    log.warn("Billing webhook: checkout.session.completed missing subscription/customer");
    return;
  }

  const email = session.customer_email ?? session.customer_details?.email ?? "";
  const now = Math.floor(Date.now() / 1000);
  const stripeConsentCollected = session.consent?.terms_of_service === "accepted";

  upsertSubscription({
    id: session.subscription,
    customer_id: session.customer,
    email,
    tier: "pro",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    terms_accepted_at: stripeConsentCollected ? now : null,
  });

  // Store consent evidence for chargeback defense.
  // IP and user agent are passed through metadata at checkout session creation.
  recordConsent({
    id: `consent_${session.subscription}_${now}`,
    subscription_id: session.subscription,
    customer_id: session.customer,
    email,
    client_ip: session.metadata?.client_ip ?? null,
    user_agent: session.metadata?.user_agent ?? null,
    terms_url: "https://jeriko.ai/terms",
    terms_version: "1.0",
    terms_accepted_at: stripeConsentCollected ? now : null,
    privacy_url: "https://jeriko.ai/privacy",
    billing_address_collected: session.billing_address_collection === "required",
    stripe_consent_collected: stripeConsentCollected,
    checkout_session_id: session.id ?? null,
  });

  syncLicenseFromTier("pro", "active", session.subscription, session.customer, email);
  log.info(`Billing: new subscription ${session.subscription} for ${email} (consent=${stripeConsentCollected})`);
}

/**
 * Subscription created or updated — sync state from Stripe.
 */
function handleSubscriptionChange(event: StripeEvent): void {
  const sub = parseSubscription(event.type, event.data.object);
  const tier = resolveTier(sub.metadata?.tier);
  const status = sub.status ?? "active";

  // Look up the existing record for THIS specific subscription to preserve email/terms.
  // Using getSubscriptionById() ensures we don't read a stale record from a different
  // subscription when multiple subscription records exist.
  const existing = getSubscriptionById(sub.id);
  const email = existing?.email ?? "";

  upsertSubscription({
    id: sub.id,
    customer_id: sub.customer,
    email,
    tier,
    status,
    current_period_start: sub.current_period_start ?? null,
    current_period_end: sub.current_period_end ?? null,
    cancel_at_period_end: sub.cancel_at_period_end,
    terms_accepted_at: existing?.terms_accepted_at ?? null,
  });

  syncLicenseFromTier(tier, status, sub.id, sub.customer, email);
  log.info(`Billing: subscription ${sub.id} updated — status=${status}, tier=${tier}`);
}

/**
 * Subscription deleted — downgrade to free.
 */
function handleSubscriptionDeleted(event: StripeEvent): void {
  const sub = parseSubscription(event.type, event.data.object);

  const existing = getSubscriptionById(sub.id);
  const email = existing?.email ?? "";

  upsertSubscription({
    id: sub.id,
    customer_id: sub.customer,
    email,
    tier: "free",
    status: "canceled",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    terms_accepted_at: existing?.terms_accepted_at ?? null,
  });

  syncLicenseFromTier("free", "canceled", sub.id, sub.customer, email);
  log.info(`Billing: subscription ${sub.id} deleted — downgraded to free`);
}

/**
 * Subscription paused — revert to free.
 */
function handleSubscriptionPaused(event: StripeEvent): void {
  const sub = parseSubscription(event.type, event.data.object);

  const existing = getSubscriptionById(sub.id);
  if (existing) {
    upsertSubscription({
      ...existing,
      status: "paused",
    });
  }

  syncLicenseFromTier("free", "paused", sub.id, existing?.customer_id ?? sub.customer, existing?.email ?? "");
  log.info(`Billing: subscription ${sub.id} paused — access reverted to free`);
}

/**
 * Subscription resumed — restore to subscribed tier.
 */
function handleSubscriptionResumed(event: StripeEvent): void {
  const sub = parseSubscription(event.type, event.data.object);
  const tier = resolveTier(sub.metadata?.tier);
  const status = sub.status ?? "active";

  const existing = getSubscriptionById(sub.id);
  if (existing) {
    upsertSubscription({
      ...existing,
      tier,
      status,
    });
  }

  syncLicenseFromTier(tier, status, sub.id, existing?.customer_id ?? sub.customer, existing?.email ?? "");
  log.info(`Billing: subscription ${sub.id} resumed — restored to ${tier}`);
}

/**
 * Invoice paid — extend grace period, record payment.
 */
function handleInvoicePaid(event: StripeEvent): void {
  const invoice = parseInvoice(event.type, event.data.object);

  if (!invoice.subscription) return;

  const now = Math.floor(Date.now() / 1000);
  updateLicense({
    verified_at: now,
    valid_until: now + Math.floor(GRACE_PERIOD_MS / 1000),
  });

  log.info(`Billing: invoice paid for subscription ${invoice.subscription}`);
}

/**
 * Invoice payment failed — mark as past_due.
 */
function handleInvoicePaymentFailed(event: StripeEvent): void {
  const invoice = parseInvoice(event.type, event.data.object);

  if (!invoice.subscription) return;

  const existing = getSubscriptionById(invoice.subscription);
  if (existing) {
    upsertSubscription({
      ...existing,
      status: "past_due",
    });
  }

  log.warn(`Billing: payment failed for subscription ${invoice.subscription}`);
}

/**
 * Invoice payment action required — 3D Secure / SCA authentication needed.
 *
 * The customer must complete additional authentication (e.g. bank 3DS challenge)
 * before the payment can succeed. Stripe will send the hosted_invoice_url to
 * the customer if configured, but we log this for observability and to allow
 * the daemon to surface it to the user.
 */
function handlePaymentActionRequired(event: StripeEvent): void {
  const invoice = parseInvoice(event.type, event.data.object);

  if (!invoice.subscription) return;

  // Don't downgrade — the payment isn't failed, it needs customer action.
  // The subscription stays active while waiting for authentication.
  log.warn(
    `Billing: payment action required for subscription ${invoice.subscription}`
    + (invoice.hosted_invoice_url ? ` — invoice URL: ${invoice.hosted_invoice_url}` : ""),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract subscription ID from a Stripe event (varies by event type).
 */
function extractSubscriptionId(event: StripeEvent): string | null {
  const obj = event.data.object;

  // Direct subscription events
  if (typeof obj.id === "string" && (obj.id as string).startsWith("sub_")) {
    return obj.id as string;
  }

  // Checkout session and invoice events
  if (typeof obj.subscription === "string") {
    return obj.subscription as string;
  }

  return null;
}

/**
 * Resolve a tier string to a valid BillingTier, defaulting to "pro".
 * Used when reading tier from Stripe metadata.
 */
function resolveTier(raw: string | undefined): BillingTier {
  if (raw && isBillingTier(raw)) return raw;
  return "pro"; // Default for paid subscriptions
}

/**
 * Sync the local license cache from a tier + status update.
 * Called by all event handlers after updating the subscription.
 */
function syncLicenseFromTier(
  tier: BillingTier,
  status: string,
  subscriptionId: string,
  customerId: string,
  email: string,
): void {
  const limits = TIER_LIMITS[tier];
  const now = Math.floor(Date.now() / 1000);

  updateLicense({
    tier,
    email: email || null,
    subscription_id: subscriptionId,
    customer_id: customerId,
    connector_limit: limits.connectors === Infinity ? UNLIMITED_TRIGGERS_STORED : limits.connectors,
    trigger_limit: limits.triggers === Infinity ? UNLIMITED_TRIGGERS_STORED : limits.triggers,
    verified_at: now,
    valid_until: now + Math.floor(GRACE_PERIOD_MS / 1000),
  });
}
