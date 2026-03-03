// Billing webhook processor — handles Stripe subscription lifecycle events.
//
// Every event is stored in billing_event with full payload (chargeback protection).
// Idempotent — duplicate events are silently ignored.
//
// Reuses verifyStripeSignature() from the Stripe connector for signature verification.

import { getLogger } from "../../shared/logger.js";
import { verifyStripeSignature } from "../services/connectors/stripe/webhook.js";
import { loadBillingConfig, TIER_LIMITS, GRACE_PERIOD_MS, type BillingTier, isBillingTier } from "./config.js";
import {
  upsertSubscription,
  recordEvent,
  hasEvent,
  updateLicense,
  getSubscription,
} from "./store.js";

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
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Process a Stripe webhook event.
 *
 * @param rawBody         Raw request body string (for signature verification)
 * @param signatureHeader Stripe-Signature header value
 * @returns Processing result with handled status
 */
export function processWebhookEvent(
  rawBody: string,
  signatureHeader: string,
): WebhookResult {
  // Verify signature
  const config = loadBillingConfig();
  if (!config?.stripeWebhookSecret) {
    log.warn("Billing webhook: no webhook secret configured");
    return { handled: false, error: "Webhook secret not configured" };
  }

  if (!verifyStripeSignature(rawBody, signatureHeader, config.stripeWebhookSecret)) {
    log.warn("Billing webhook: signature verification failed");
    return { handled: false, error: "Invalid signature" };
  }

  // Parse the event
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    log.warn("Billing webhook: failed to parse event body");
    return { handled: false, error: "Invalid JSON" };
  }

  if (!event.id || !event.type) {
    log.warn("Billing webhook: event missing id or type");
    return { handled: false, error: "Invalid event structure" };
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
 * Creates subscription record and updates license.
 */
function handleCheckoutCompleted(event: StripeEvent): void {
  const session = event.data.object;
  const subscriptionId = session.subscription as string | undefined;
  const customerId = session.customer as string | undefined;
  const customerDetails = session.customer_details as Record<string, unknown> | undefined;
  const email = (session.customer_email as string)
    ?? (customerDetails?.email as string)
    ?? "";
  const metadata = session.metadata as Record<string, string> | undefined;

  if (!subscriptionId || !customerId) {
    log.warn("Billing webhook: checkout.session.completed missing subscription/customer");
    return;
  }

  const termsAccepted = metadata?.terms_accepted === "true";
  const now = Math.floor(Date.now() / 1000);

  upsertSubscription({
    id: subscriptionId,
    customer_id: customerId,
    email,
    tier: "pro",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    terms_accepted_at: termsAccepted ? now : null,
  });

  syncLicenseFromTier("pro", "active", subscriptionId, customerId, email);
  log.info(`Billing: new subscription ${subscriptionId} for ${email}`);
}

/**
 * Subscription created or updated — sync state from Stripe.
 */
function handleSubscriptionChange(event: StripeEvent): void {
  const sub = event.data.object;
  const id = sub.id as string;
  const customerId = sub.customer as string;
  const status = sub.status as string;
  const cancelAtPeriodEnd = sub.cancel_at_period_end as boolean ?? false;

  // Extract period timestamps
  const currentPeriodStart = sub.current_period_start as number | undefined;
  const currentPeriodEnd = sub.current_period_end as number | undefined;

  // Determine tier from metadata or existing record
  const metadata = sub.metadata as Record<string, string> | undefined;
  const tier = resolveTier(metadata?.tier);

  // Get email from existing record or leave empty
  const existing = getSubscription();
  const email = existing?.email ?? "";

  upsertSubscription({
    id,
    customer_id: customerId,
    email,
    tier,
    status,
    current_period_start: currentPeriodStart ?? null,
    current_period_end: currentPeriodEnd ?? null,
    cancel_at_period_end: cancelAtPeriodEnd,
    terms_accepted_at: existing?.terms_accepted_at ?? null,
  });

  syncLicenseFromTier(tier, status, id, customerId, email);
  log.info(`Billing: subscription ${id} updated — status=${status}, tier=${tier}`);
}

/**
 * Subscription deleted — downgrade to free.
 */
function handleSubscriptionDeleted(event: StripeEvent): void {
  const sub = event.data.object;
  const id = sub.id as string;
  const customerId = sub.customer as string;

  const existing = getSubscription();
  const email = existing?.email ?? "";

  upsertSubscription({
    id,
    customer_id: customerId,
    email,
    tier: "free",
    status: "canceled",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    terms_accepted_at: existing?.terms_accepted_at ?? null,
  });

  syncLicenseFromTier("free", "canceled", id, customerId, email);
  log.info(`Billing: subscription ${id} deleted — downgraded to free`);
}

/**
 * Subscription paused — revert to free.
 */
function handleSubscriptionPaused(event: StripeEvent): void {
  const sub = event.data.object;
  const id = sub.id as string;

  const existing = getSubscription();
  if (existing) {
    upsertSubscription({
      ...existing,
      status: "paused",
    });
  }

  syncLicenseFromTier("free", "paused", id, existing?.customer_id ?? "", existing?.email ?? "");
  log.info(`Billing: subscription ${id} paused — access reverted to free`);
}

/**
 * Subscription resumed — restore to subscribed tier.
 */
function handleSubscriptionResumed(event: StripeEvent): void {
  const sub = event.data.object;
  const id = sub.id as string;
  const status = sub.status as string ?? "active";
  const metadata = sub.metadata as Record<string, string> | undefined;
  const tier = resolveTier(metadata?.tier);

  const existing = getSubscription();
  if (existing) {
    upsertSubscription({
      ...existing,
      tier,
      status,
    });
  }

  syncLicenseFromTier(tier, status, id, existing?.customer_id ?? "", existing?.email ?? "");
  log.info(`Billing: subscription ${id} resumed — restored to ${tier}`);
}

/**
 * Invoice paid — extend grace period, record payment.
 */
function handleInvoicePaid(event: StripeEvent): void {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription as string | undefined;

  if (!subscriptionId) return;

  const now = Math.floor(Date.now() / 1000);
  updateLicense({
    verified_at: now,
    valid_until: now + Math.floor(GRACE_PERIOD_MS / 1000),
  });

  log.info(`Billing: invoice paid for subscription ${subscriptionId}`);
}

/**
 * Invoice payment failed — mark as past_due.
 */
function handleInvoicePaymentFailed(event: StripeEvent): void {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription as string | undefined;

  if (!subscriptionId) return;

  const existing = getSubscription();
  if (existing && existing.id === subscriptionId) {
    upsertSubscription({
      ...existing,
      status: "past_due",
    });
  }

  log.warn(`Billing: payment failed for subscription ${subscriptionId}`);
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
    connector_limit: limits.connectors,
    trigger_limit: limits.triggers === Infinity ? 999999 : limits.triggers,
    verified_at: now,
    valid_until: now + Math.floor(GRACE_PERIOD_MS / 1000),
  });
}
