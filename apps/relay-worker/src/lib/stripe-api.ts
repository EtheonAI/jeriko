// Relay Worker — Stripe REST API helpers.
//
// Raw fetch() calls to the Stripe API — no SDK dependency. Keeps the Worker
// bundle lean and avoids Node.js compatibility issues in the CF runtime.
//
// Uses application/x-www-form-urlencoded (Stripe's native API format).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckoutSessionParams {
  secretKey: string;
  priceId: string;
  email: string;
  userId: string;
  termsAccepted: boolean;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

export interface PortalSessionParams {
  secretKey: string;
  customerId: string;
  returnUrl: string;
  portalConfigId?: string;
}

export interface PortalSessionResult {
  url: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STRIPE_API_BASE = "https://api.stripe.com/v1";

// ---------------------------------------------------------------------------
// Stripe API calls
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout session for the Pro plan.
 *
 * Equivalent to `stripe.checkout.sessions.create()` from the SDK.
 * Uses form-encoded POST as required by the Stripe REST API.
 */
export async function createCheckoutSession(
  params: CheckoutSessionParams,
): Promise<CheckoutSessionResult> {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer_email", params.email);
  body.set("line_items[0][price]", params.priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);

  // Subscription metadata — persisted on the subscription object
  body.set("subscription_data[metadata][source]", "jeriko-cli");
  body.set("subscription_data[metadata][jeriko_user_id]", params.userId);
  body.set("subscription_data[metadata][terms_accepted]", params.termsAccepted ? "true" : "false");
  body.set("subscription_data[metadata][terms_accepted_at]", new Date().toISOString());

  // Session metadata — available in checkout.session.completed event
  body.set("metadata[source]", "jeriko-cli");
  body.set("metadata[jeriko_user_id]", params.userId);

  const response = await stripeRequest(params.secretKey, "/checkout/sessions", body);

  if (!response.url) {
    throw new StripeApiError("Stripe Checkout session created but no URL returned", 500);
  }

  return {
    url: response.url as string,
    sessionId: response.id as string,
  };
}

/**
 * Create a Stripe Customer Portal session for self-service billing management.
 *
 * Equivalent to `stripe.billingPortal.sessions.create()` from the SDK.
 */
export async function createPortalSession(
  params: PortalSessionParams,
): Promise<PortalSessionResult> {
  const body = new URLSearchParams();
  body.set("customer", params.customerId);
  body.set("return_url", params.returnUrl);

  if (params.portalConfigId) {
    body.set("configuration", params.portalConfigId);
  }

  const response = await stripeRequest(params.secretKey, "/billing_portal/sessions", body);

  return {
    url: response.url as string,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Custom error class for Stripe API errors.
 * Preserves the HTTP status code and Stripe error details.
 */
export class StripeApiError extends Error {
  readonly statusCode: number;
  readonly stripeCode?: string;

  constructor(message: string, statusCode: number, stripeCode?: string) {
    super(message);
    this.name = "StripeApiError";
    this.statusCode = statusCode;
    this.stripeCode = stripeCode;
  }
}

/**
 * Make an authenticated POST request to the Stripe REST API.
 *
 * @param secretKey  Stripe secret key (sk_live_... or sk_test_...)
 * @param path       API endpoint path (e.g. "/checkout/sessions")
 * @param body       URL-encoded form body
 * @returns Parsed JSON response body
 */
async function stripeRequest(
  secretKey: string,
  path: string,
  body: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-12-18.acacia",
    },
    body: body.toString(),
  });

  const result = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const error = result.error as Record<string, unknown> | undefined;
    const message = (error?.message as string) ?? `Stripe API error (${response.status})`;
    const code = error?.code as string | undefined;
    throw new StripeApiError(message, response.status, code);
  }

  return result;
}
