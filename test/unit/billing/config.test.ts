// Billing config tests — tier limits, status classification, and config loading.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  TIER_LIMITS,
  ACTIVE_STATUSES,
  GRACE_STATUSES,
  INACTIVE_STATUSES,
  GRACE_PERIOD_MS,
  PAST_DUE_GRACE_MS,
  UNLIMITED_TRIGGERS_STORED,
  BILLING_ENV,
  isBillingTier,
  loadBillingConfig,
  type BillingTier,
} from "../../../src/daemon/billing/config.js";

describe("billing/config", () => {
  // ── Tier definitions ──────────────────────────────────────────

  describe("TIER_LIMITS", () => {
    it("defines free tier with correct limits", () => {
      expect(TIER_LIMITS.free.connectors).toBe(2);
      expect(TIER_LIMITS.free.triggers).toBe(3);
      expect(TIER_LIMITS.free.label).toBe("Community");
    });

    it("defines pro tier with correct limits", () => {
      expect(TIER_LIMITS.pro.connectors).toBe(10);
      expect(TIER_LIMITS.pro.triggers).toBe(Infinity);
      expect(TIER_LIMITS.pro.label).toBe("Pro");
    });

    it("defines team tier with correct limits", () => {
      expect(TIER_LIMITS.team.connectors).toBe(10);
      expect(TIER_LIMITS.team.triggers).toBe(Infinity);
      expect(TIER_LIMITS.team.label).toBe("Team");
    });

    it("defines enterprise tier with correct limits", () => {
      expect(TIER_LIMITS.enterprise.connectors).toBe(10);
      expect(TIER_LIMITS.enterprise.triggers).toBe(Infinity);
      expect(TIER_LIMITS.enterprise.label).toBe("Enterprise");
    });

    it("has exactly 4 tiers", () => {
      expect(Object.keys(TIER_LIMITS)).toHaveLength(4);
    });

    it("every tier has connectors, triggers, and label", () => {
      for (const [name, limits] of Object.entries(TIER_LIMITS)) {
        expect(typeof limits.connectors).toBe("number");
        expect(typeof limits.triggers).toBe("number");
        expect(typeof limits.label).toBe("string");
        expect(limits.label.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Type guard ────────────────────────────────────────────────

  describe("isBillingTier", () => {
    it("returns true for valid tiers", () => {
      expect(isBillingTier("free")).toBe(true);
      expect(isBillingTier("pro")).toBe(true);
      expect(isBillingTier("team")).toBe(true);
      expect(isBillingTier("enterprise")).toBe(true);
    });

    it("returns false for invalid tiers", () => {
      expect(isBillingTier("")).toBe(false);
      expect(isBillingTier("premium")).toBe(false);
      expect(isBillingTier("basic")).toBe(false);
      expect(isBillingTier("FREE")).toBe(false);
    });
  });

  // ── Status classification ─────────────────────────────────────

  describe("status sets", () => {
    it("ACTIVE_STATUSES contains active and trialing", () => {
      expect(ACTIVE_STATUSES.has("active")).toBe(true);
      expect(ACTIVE_STATUSES.has("trialing")).toBe(true);
      expect(ACTIVE_STATUSES.size).toBe(2);
    });

    it("GRACE_STATUSES contains past_due", () => {
      expect(GRACE_STATUSES.has("past_due")).toBe(true);
      expect(GRACE_STATUSES.size).toBe(1);
    });

    it("INACTIVE_STATUSES contains all terminal states", () => {
      expect(INACTIVE_STATUSES.has("canceled")).toBe(true);
      expect(INACTIVE_STATUSES.has("unpaid")).toBe(true);
      expect(INACTIVE_STATUSES.has("incomplete_expired")).toBe(true);
      expect(INACTIVE_STATUSES.has("paused")).toBe(true);
      expect(INACTIVE_STATUSES.has("incomplete")).toBe(true);
    });

    it("status sets are mutually exclusive", () => {
      for (const status of ACTIVE_STATUSES) {
        expect(GRACE_STATUSES.has(status)).toBe(false);
        expect(INACTIVE_STATUSES.has(status)).toBe(false);
      }
      for (const status of GRACE_STATUSES) {
        expect(ACTIVE_STATUSES.has(status)).toBe(false);
        expect(INACTIVE_STATUSES.has(status)).toBe(false);
      }
      for (const status of INACTIVE_STATUSES) {
        expect(ACTIVE_STATUSES.has(status)).toBe(false);
        expect(GRACE_STATUSES.has(status)).toBe(false);
      }
    });
  });

  // ── Grace periods ──────────────────────────────────────────────

  describe("grace periods", () => {
    it("GRACE_PERIOD_MS is 7 days", () => {
      expect(GRACE_PERIOD_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("PAST_DUE_GRACE_MS is 7 days", () => {
      expect(PAST_DUE_GRACE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("UNLIMITED_TRIGGERS_STORED is a high sentinel value", () => {
      expect(UNLIMITED_TRIGGERS_STORED).toBe(999_999);
      // Must be larger than any practical trigger count
      expect(UNLIMITED_TRIGGERS_STORED).toBeGreaterThan(10_000);
    });
  });

  // ── Env var names ──────────────────────────────────────────────

  describe("BILLING_ENV", () => {
    it("uses STRIPE_BILLING_ prefix for all keys", () => {
      expect(BILLING_ENV.secretKey).toBe("STRIPE_BILLING_SECRET_KEY");
      expect(BILLING_ENV.publishableKey).toBe("STRIPE_BILLING_PUBLISHABLE_KEY");
      expect(BILLING_ENV.webhookSecret).toBe("STRIPE_BILLING_WEBHOOK_SECRET");
      expect(BILLING_ENV.priceId).toBe("STRIPE_BILLING_PRICE_ID");
      expect(BILLING_ENV.portalConfigId).toBe("STRIPE_BILLING_PORTAL_CONFIG_ID");
    });

    it("does not collide with user connector env vars", () => {
      // User's Stripe connector uses STRIPE_SECRET_KEY (no _BILLING_ prefix)
      for (const val of Object.values(BILLING_ENV)) {
        expect(val).toContain("BILLING");
      }
    });
  });

  // ── Config loader ──────────────────────────────────────────────

  describe("loadBillingConfig", () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
      savedEnv = {};
      for (const val of Object.values(BILLING_ENV)) {
        savedEnv[val] = process.env[val];
        delete process.env[val];
      }
    });

    afterEach(() => {
      for (const [key, val] of Object.entries(savedEnv)) {
        if (val !== undefined) {
          process.env[key] = val;
        } else {
          delete process.env[key];
        }
      }
    });

    it("returns null when secret key is not set", () => {
      const config = loadBillingConfig();
      expect(config).toBeNull();
    });

    it("returns config when secret key is set", () => {
      process.env[BILLING_ENV.secretKey] = "sk_test_fake";
      process.env[BILLING_ENV.webhookSecret] = "whsec_fake";
      process.env[BILLING_ENV.priceId] = "price_fake";

      const config = loadBillingConfig();
      expect(config).not.toBeNull();
      expect(config!.stripeSecretKey).toBe("sk_test_fake");
      expect(config!.stripeWebhookSecret).toBe("whsec_fake");
      expect(config!.stripePriceId).toBe("price_fake");
    });

    it("handles missing optional fields", () => {
      process.env[BILLING_ENV.secretKey] = "sk_test_fake";

      const config = loadBillingConfig();
      expect(config).not.toBeNull();
      expect(config!.stripeWebhookSecret).toBe("");
      expect(config!.stripePriceId).toBe("");
      expect(config!.stripePortalConfigId).toBeUndefined();
    });

    it("includes terms and privacy URLs", () => {
      process.env[BILLING_ENV.secretKey] = "sk_test_fake";

      const config = loadBillingConfig();
      expect(config!.termsUrl).toContain("jeriko.ai");
      expect(config!.privacyUrl).toContain("jeriko.ai");
    });
  });
});
