// Billing configuration — tier definitions, types, and status classification.
//
// Single source of truth for plan limits and Stripe subscription status mapping.
// No hardcoded limits elsewhere in the codebase — all enforcement reads from here.

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

export const TIER_LIMITS = {
  free:       { connectors: 5,        triggers: 10,       label: "Community" },
  pro:        { connectors: Infinity,  triggers: Infinity,  label: "Pro" },
  team:       { connectors: Infinity,  triggers: Infinity,  label: "Team" },
  enterprise: { connectors: Infinity,  triggers: Infinity,  label: "Enterprise" },
} as const;

/** Human-readable Pro plan price for display in CLI, channels, and docs. */
export const PRO_PRICE_DISPLAY = "$19.99/mo";

export type BillingTier = keyof typeof TIER_LIMITS;

/** Type guard for validating a string as a BillingTier. */
export function isBillingTier(value: string): value is BillingTier {
  return value in TIER_LIMITS;
}

// ---------------------------------------------------------------------------
// Status classification
// ---------------------------------------------------------------------------

/** Statuses that grant full access to the subscribed tier. */
export const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/** Statuses that grant a grace period (7 days) before downgrade. */
export const GRACE_STATUSES = new Set(["past_due"]);

/** Statuses that revert to free tier immediately. */
export const INACTIVE_STATUSES = new Set([
  "canceled",
  "unpaid",
  "incomplete_expired",
  "paused",
  "incomplete",
]);

// ---------------------------------------------------------------------------
// Configuration interface
// ---------------------------------------------------------------------------

export interface BillingConfig {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePriceId: string;
  stripePortalConfigId?: string;
  termsUrl: string;
  privacyUrl: string;
}

// ---------------------------------------------------------------------------
// Env var names (namespaced to avoid collision with user's Stripe connector)
// ---------------------------------------------------------------------------

export const BILLING_ENV = {
  secretKey: "STRIPE_BILLING_SECRET_KEY",
  publishableKey: "STRIPE_BILLING_PUBLISHABLE_KEY",
  webhookSecret: "STRIPE_BILLING_WEBHOOK_SECRET",
  priceId: "STRIPE_BILLING_PRICE_ID",
  portalConfigId: "STRIPE_BILLING_PORTAL_CONFIG_ID",
} as const;

// ---------------------------------------------------------------------------
// Grace period
// ---------------------------------------------------------------------------

/** Offline grace period: 7 days in milliseconds. */
export const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/** Past-due grace period: 7 days in milliseconds. */
export const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Stored value for unlimited triggers.
 *
 * SQLite cannot store `Infinity`, so when a tier has unlimited triggers
 * we store this sentinel value. All gate checks should compare against
 * `TIER_LIMITS[tier].triggers === Infinity`, NOT against this number.
 */
export const UNLIMITED_TRIGGERS_STORED = 999_999;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load billing configuration from environment variables.
 * Returns null if the required secret key is not set (billing not configured).
 */
export function loadBillingConfig(): BillingConfig | null {
  const secretKey = process.env[BILLING_ENV.secretKey];
  if (!secretKey) return null;

  return {
    stripeSecretKey: secretKey,
    stripeWebhookSecret: process.env[BILLING_ENV.webhookSecret] ?? "",
    stripePriceId: process.env[BILLING_ENV.priceId] ?? "",
    stripePortalConfigId: process.env[BILLING_ENV.portalConfigId] || undefined,
    termsUrl: "https://jeriko.ai/terms",
    privacyUrl: "https://jeriko.ai/privacy",
  };
}
