// Stripe API client — lazy-initialized wrapper for billing operations.
//
// Uses STRIPE_BILLING_SECRET_KEY (separate from user's Stripe connector).
// Client is initialized once and reused (Stripe SDK is stateless / safe to cache).

import Stripe from "stripe";
import { BILLING_ENV, loadBillingConfig, type BillingConfig } from "./config.js";
import { getLogger } from "../../shared/logger.js";
import { getUserId } from "../../shared/config.js";

const log = getLogger();

/** Default billing website base URL. Override with JERIKO_BILLING_URL. */
const DEFAULT_BILLING_URL = "https://jeriko.ai";

/**
 * Get the base URL for billing pages (success, cancel, portal return).
 * Configurable to support self-hosted or staging environments.
 */
function getBillingBaseUrl(): string {
  return (process.env.JERIKO_BILLING_URL ?? DEFAULT_BILLING_URL).replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Lazy client singleton
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;
let _config: BillingConfig | null = null;

/**
 * Get the Stripe client instance, initializing on first call.
 * Throws if billing is not configured (no STRIPE_BILLING_SECRET_KEY).
 */
function getStripeClient(): Stripe {
  if (_stripe) return _stripe;

  const config = loadBillingConfig();
  if (!config) {
    throw new Error(
      `Billing not configured: set ${BILLING_ENV.secretKey} in ~/.config/jeriko/.env`,
    );
  }

  _stripe = new Stripe(config.stripeSecretKey, {
    apiVersion: "2026-02-25.clover",
    appInfo: {
      name: "jeriko",
      version: "2.0.0",
      url: "https://jeriko.ai",
    },
  });

  _config = config;
  return _stripe;
}

/**
 * Get the billing config (loaded alongside the Stripe client).
 */
function getBillingConfig(): BillingConfig {
  if (!_config) getStripeClient(); // Triggers config load
  return _config!;
}

/**
 * Check if billing is configured (secret key present in env).
 */
export function isBillingConfigured(): boolean {
  return !!process.env[BILLING_ENV.secretKey];
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout session for the Pro plan.
 *
 * @param email           Customer email (pre-fills Checkout)
 * @param termsAccepted   Whether the user accepted T&C (recorded in metadata)
 * @returns Checkout URL to redirect the user to
 */
export async function createCheckoutSession(
  email: string,
  termsAccepted: boolean,
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripeClient();
  const config = getBillingConfig();

  if (!config.stripePriceId) {
    throw new Error(
      `Billing price not configured: set ${BILLING_ENV.priceId} in ~/.config/jeriko/.env`,
    );
  }

  const userId = getUserId() ?? "";
  const billingBaseUrl = getBillingBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [
      {
        price: config.stripePriceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: {
        source: "jeriko-cli",
        jeriko_user_id: userId,
        terms_accepted: termsAccepted ? "true" : "false",
        terms_accepted_at: new Date().toISOString(),
      },
    },
    success_url: `${billingBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${billingBaseUrl}/billing/cancel`,
    metadata: {
      source: "jeriko-cli",
      jeriko_user_id: userId,
    },
  });

  if (!session.url) {
    throw new Error("Stripe Checkout session created but no URL returned");
  }

  log.info(`Checkout session created: ${session.id} for ${email}`);

  return { url: session.url, sessionId: session.id };
}

// ---------------------------------------------------------------------------
// Customer Portal
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Customer Portal session for self-service billing management.
 *
 * @param customerId  Stripe customer ID (cus_xxx)
 * @returns Portal URL to redirect the user to
 */
export async function createPortalSession(customerId: string): Promise<{ url: string }> {
  const stripe = getStripeClient();
  const config = getBillingConfig();

  const params: Stripe.BillingPortal.SessionCreateParams = {
    customer: customerId,
    return_url: `${getBillingBaseUrl()}/billing`,
  };

  if (config.stripePortalConfigId) {
    params.configuration = config.stripePortalConfigId;
  }

  const session = await stripe.billingPortal.sessions.create(params);

  log.info(`Portal session created for customer ${customerId}`);

  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Subscription queries
// ---------------------------------------------------------------------------

/**
 * Get a subscription by ID from Stripe.
 * Returns null if the subscription doesn't exist.
 */
export async function getStripeSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription | null> {
  const stripe = getStripeClient();

  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err: unknown) {
    if (err instanceof Stripe.errors.StripeError && err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Get a customer by email from Stripe.
 * Returns the first match, or null if no customer exists with that email.
 */
export async function getCustomerByEmail(
  email: string,
): Promise<Stripe.Customer | null> {
  const stripe = getStripeClient();

  const result = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (result.data.length === 0) return null;

  const customer = result.data[0]!;
  // Stripe can return deleted customers in the list
  if (customer.deleted) return null;

  return customer as Stripe.Customer;
}

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

/**
 * Cancel a subscription at the end of the current billing period.
 *
 * Uses `cancel_at_period_end: true` — the Stripe best practice for SaaS.
 * The customer keeps full access until the period ends, then downgrades to free.
 *
 * @param subscriptionId  Stripe subscription ID (sub_xxx)
 * @returns Cancel timestamp and current status
 */
export async function cancelSubscription(
  subscriptionId: string,
): Promise<{ cancelAt: number | null; status: string }> {
  const stripe = getStripeClient();

  const updated = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });

  log.info(
    `Subscription ${subscriptionId} set to cancel at period end `
    + `(status=${updated.status}, cancel_at=${updated.cancel_at})`,
  );

  return {
    cancelAt: updated.cancel_at,
    status: updated.status,
  };
}

// ---------------------------------------------------------------------------
// Reset (for testing)
// ---------------------------------------------------------------------------

/** Reset the Stripe client singleton (for tests). */
export function _resetStripeClient(): void {
  _stripe = null;
  _config = null;
}
