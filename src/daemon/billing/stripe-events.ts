// Stripe webhook event schemas — runtime validation for payloads the daemon
// trusts for billing decisions. Guards against malformed or spoofed events
// that would otherwise coerce silently via `as string` casts.
//
// These are minimal schemas covering only the fields the webhook handler
// reads. Unknown fields pass through (`.passthrough()`) because Stripe adds
// new properties over time and we don't want to reject future events.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

const unixSeconds = z.number().int().nonnegative();
const stripeId = z.string().min(1);

// ---------------------------------------------------------------------------
// Event objects
// ---------------------------------------------------------------------------

/** checkout.session.completed — new subscription signup. */
export const CheckoutSessionSchema = z.object({
  id: stripeId.optional(),
  subscription: stripeId.optional(),
  customer: stripeId.optional(),
  customer_email: z.string().email().nullish(),
  customer_details: z.object({
    email: z.string().email().nullish(),
  }).passthrough().nullish(),
  metadata: z.record(z.string(), z.string()).nullish(),
  consent: z.object({
    terms_of_service: z.enum(["accepted"]).nullish(),
  }).passthrough().nullish(),
  billing_address_collection: z.enum(["required", "auto"]).nullish(),
}).passthrough();

export type CheckoutSession = z.infer<typeof CheckoutSessionSchema>;

/** customer.subscription.* — subscription lifecycle events.
 *
 * `status` is marked optional to accommodate `customer.subscription.deleted`
 * events whose handler overrides the status to "canceled" regardless of what
 * Stripe sent. Handlers that rely on `status` provide their own fallback.
 */
export const SubscriptionSchema = z.object({
  id: stripeId,
  customer: stripeId,
  status: z.string().min(1).optional(),
  cancel_at_period_end: z.boolean().optional().default(false),
  current_period_start: unixSeconds.optional(),
  current_period_end: unixSeconds.optional(),
  metadata: z.record(z.string(), z.string()).nullish(),
}).passthrough();

export type Subscription = z.infer<typeof SubscriptionSchema>;

/** invoice.paid / invoice.payment_failed / invoice.payment_action_required. */
export const InvoiceSchema = z.object({
  id: stripeId.optional(),
  subscription: stripeId.optional(),
  hosted_invoice_url: z.string().url().optional(),
}).passthrough();

export type Invoice = z.infer<typeof InvoiceSchema>;

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

/** Bare event envelope — the handler dispatches on `type` before parsing the body. */
export const StripeEventEnvelopeSchema = z.object({
  id: stripeId,
  type: z.string().min(1),
  data: z.object({
    object: z.record(z.string(), z.unknown()),
  }).passthrough(),
}).passthrough();

export type StripeEventEnvelope = z.infer<typeof StripeEventEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Parse helpers — each returns the narrowed object or throws a typed error.
// ---------------------------------------------------------------------------

export class StripeEventParseError extends Error {
  constructor(readonly eventType: string, readonly issues: z.ZodIssue[]) {
    super(
      `Malformed Stripe "${eventType}" payload: ` +
      issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; "),
    );
    this.name = "StripeEventParseError";
  }
}

function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  eventType: string,
  object: unknown,
): z.infer<T> {
  const result = schema.safeParse(object);
  if (!result.success) {
    throw new StripeEventParseError(eventType, result.error.issues);
  }
  return result.data;
}

/** Parse the event envelope. Throws on malformed top-level structure. */
export function parseEventEnvelope(raw: unknown): StripeEventEnvelope {
  return parseOrThrow(StripeEventEnvelopeSchema, "<envelope>", raw);
}

/** Parse a checkout.session.completed payload. */
export function parseCheckoutSession(eventType: string, object: unknown): CheckoutSession {
  return parseOrThrow(CheckoutSessionSchema, eventType, object);
}

/** Parse a customer.subscription.* payload. */
export function parseSubscription(eventType: string, object: unknown): Subscription {
  return parseOrThrow(SubscriptionSchema, eventType, object);
}

/** Parse an invoice.* payload. */
export function parseInvoice(eventType: string, object: unknown): Invoice {
  return parseOrThrow(InvoiceSchema, eventType, object);
}
