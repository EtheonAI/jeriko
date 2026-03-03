// License guard tests — tier enforcement, gate checks, and grace periods.

import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { initDatabase, closeDatabase } from "../../../src/daemon/storage/db.js";
import { updateLicense, upsertSubscription } from "../../../src/daemon/billing/store.js";
import {
  getLicenseState,
  canActivateConnector,
  canAddTrigger,
  effectiveTier,
  isWithinGracePeriod,
  isLicenseStale,
} from "../../../src/daemon/billing/license.js";
import { TIER_LIMITS, GRACE_PERIOD_MS } from "../../../src/daemon/billing/config.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import type { Database } from "bun:sqlite";

const TEST_DB = join(tmpdir(), `jeriko-billing-license-test-${Date.now()}.db`);

describe("billing/license", () => {
  let db: Database;

  beforeAll(() => {
    db = initDatabase(TEST_DB);
  });

  afterAll(() => {
    closeDatabase();
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        if (existsSync(TEST_DB + suffix)) unlinkSync(TEST_DB + suffix);
      } catch { /* cleanup best effort */ }
    }
  });

  beforeEach(() => {
    // Reset to clean state
    db.prepare("DELETE FROM billing_license").run();
    db.prepare("DELETE FROM billing_subscription").run();
  });

  // ── effectiveTier ──────────────────────────────────────────────

  describe("effectiveTier", () => {
    it("returns subscribed tier for active status", () => {
      expect(effectiveTier("active", "pro")).toBe("pro");
      expect(effectiveTier("active", "team")).toBe("team");
      expect(effectiveTier("active", "enterprise")).toBe("enterprise");
    });

    it("returns subscribed tier for trialing status", () => {
      expect(effectiveTier("trialing", "pro")).toBe("pro");
      expect(effectiveTier("trialing", "team")).toBe("team");
    });

    it("returns subscribed tier for past_due (grace period)", () => {
      expect(effectiveTier("past_due", "pro")).toBe("pro");
      expect(effectiveTier("past_due", "team")).toBe("team");
    });

    it("returns free for canceled status", () => {
      expect(effectiveTier("canceled", "pro")).toBe("free");
    });

    it("returns free for unpaid status", () => {
      expect(effectiveTier("unpaid", "pro")).toBe("free");
    });

    it("returns free for incomplete_expired status", () => {
      expect(effectiveTier("incomplete_expired", "pro")).toBe("free");
    });

    it("returns free for paused status", () => {
      expect(effectiveTier("paused", "pro")).toBe("free");
    });

    it("returns free for incomplete status", () => {
      expect(effectiveTier("incomplete", "pro")).toBe("free");
    });

    it("returns free for unknown status", () => {
      expect(effectiveTier("unknown_status", "pro")).toBe("free");
    });

    it("returns free for 'none' status (no subscription)", () => {
      expect(effectiveTier("none", "free")).toBe("free");
    });

    it("handles invalid tier string by defaulting to free", () => {
      expect(effectiveTier("active", "invalid_tier")).toBe("free");
    });

    it("handles empty tier string", () => {
      expect(effectiveTier("active", "")).toBe("free");
    });
  });

  // ── getLicenseState ────────────────────────────────────────────

  describe("getLicenseState", () => {
    it("returns free tier when no license exists", () => {
      const state = getLicenseState();
      expect(state.tier).toBe("free");
      expect(state.label).toBe("Community");
      expect(state.connectorLimit).toBe(2);
      expect(state.triggerLimit).toBe(3);
      expect(state.email).toBeNull();
      expect(state.subscriptionId).toBeNull();
      expect(state.pastDue).toBe(false);
    });

    it("returns pro tier limits when license is pro", () => {
      updateLicense({
        tier: "pro",
        email: "pro@example.com",
        subscription_id: "sub_123",
        connector_limit: TIER_LIMITS.pro.connectors,
        trigger_limit: 999999,
      });

      upsertSubscription({
        id: "sub_123",
        customer_id: "cus_123",
        email: "pro@example.com",
        tier: "pro",
        status: "active",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        terms_accepted_at: null,
      });

      const state = getLicenseState();
      expect(state.tier).toBe("pro");
      expect(state.label).toBe("Pro");
      expect(state.connectorLimit).toBe(10);
      expect(state.email).toBe("pro@example.com");
    });

    it("detects past_due status", () => {
      updateLicense({
        tier: "pro",
        subscription_id: "sub_pd",
      });

      upsertSubscription({
        id: "sub_pd",
        customer_id: "cus_pd",
        email: "pd@example.com",
        tier: "pro",
        status: "past_due",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        terms_accepted_at: null,
      });

      const state = getLicenseState();
      expect(state.pastDue).toBe(true);
      // Still pro during grace period
      expect(state.tier).toBe("pro");
    });

    it("reverts to free when subscription is canceled", () => {
      updateLicense({
        tier: "pro",
        subscription_id: "sub_canceled",
      });

      upsertSubscription({
        id: "sub_canceled",
        customer_id: "cus_canceled",
        email: "canceled@example.com",
        tier: "pro",
        status: "canceled",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        terms_accepted_at: null,
      });

      const state = getLicenseState();
      expect(state.tier).toBe("free");
      expect(state.connectorLimit).toBe(2);
      expect(state.triggerLimit).toBe(3);
    });
  });

  // ── Connector gate ─────────────────────────────────────────────

  describe("canActivateConnector", () => {
    it("allows connector when under limit (free tier)", () => {
      const result = canActivateConnector(0);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("allows connector at limit minus 1 (free tier)", () => {
      const result = canActivateConnector(1);
      expect(result.allowed).toBe(true);
    });

    it("denies connector at free tier limit", () => {
      const result = canActivateConnector(2);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Connector limit reached");
      expect(result.reason).toContain("Community");
      expect(result.reason).toContain("jeriko upgrade");
    });

    it("denies connector above free tier limit", () => {
      const result = canActivateConnector(5);
      expect(result.allowed).toBe(false);
    });

    it("allows more connectors on pro tier", () => {
      updateLicense({
        tier: "pro",
        connector_limit: TIER_LIMITS.pro.connectors,
        trigger_limit: 999999,
      });

      upsertSubscription({
        id: "sub_pro_gate",
        customer_id: "cus_pro_gate",
        email: "gate@example.com",
        tier: "pro",
        status: "active",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        terms_accepted_at: null,
      });

      const result = canActivateConnector(5);
      expect(result.allowed).toBe(true);
    });

    it("denies connector at pro tier limit", () => {
      updateLicense({
        tier: "pro",
        connector_limit: TIER_LIMITS.pro.connectors,
        trigger_limit: 999999,
      });

      upsertSubscription({
        id: "sub_pro_gate_2",
        customer_id: "cus_pro_gate_2",
        email: "gate2@example.com",
        tier: "pro",
        status: "active",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        terms_accepted_at: null,
      });

      const result = canActivateConnector(10);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Pro");
    });
  });

  // ── Trigger gate ───────────────────────────────────────────────

  describe("canAddTrigger", () => {
    beforeEach(() => {
      db.prepare("DELETE FROM billing_license").run();
      db.prepare("DELETE FROM billing_subscription").run();
    });

    it("allows trigger when under limit (free tier)", () => {
      const result = canAddTrigger(0);
      expect(result.allowed).toBe(true);
    });

    it("allows trigger at limit minus 1 (free tier)", () => {
      const result = canAddTrigger(2);
      expect(result.allowed).toBe(true);
    });

    it("denies trigger at free tier limit", () => {
      const result = canAddTrigger(3);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Trigger limit reached");
      expect(result.reason).toContain("Community");
      expect(result.reason).toContain("unlimited");
    });

    it("allows unlimited triggers on pro tier", () => {
      updateLicense({
        tier: "pro",
        connector_limit: TIER_LIMITS.pro.connectors,
        trigger_limit: 999999,
      });

      upsertSubscription({
        id: "sub_trig_pro",
        customer_id: "cus_trig_pro",
        email: "trig@example.com",
        tier: "pro",
        status: "active",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        terms_accepted_at: null,
      });

      // Even a large number should be allowed
      const result = canAddTrigger(100);
      expect(result.allowed).toBe(true);
    });
  });

  // ── Grace period ───────────────────────────────────────────────

  describe("isWithinGracePeriod", () => {
    it("returns false when valid_until is null", () => {
      expect(isWithinGracePeriod({
        key: "current",
        tier: "pro",
        email: null,
        subscription_id: null,
        customer_id: null,
        valid_until: null,
        verified_at: null,
        connector_limit: 10,
        trigger_limit: 999999,
      })).toBe(false);
    });

    it("returns true when valid_until is in the future (seconds)", () => {
      const futureTs = Math.floor(Date.now() / 1000) + 86400; // 1 day ahead
      expect(isWithinGracePeriod({
        key: "current",
        tier: "pro",
        email: null,
        subscription_id: null,
        customer_id: null,
        valid_until: futureTs,
        verified_at: null,
        connector_limit: 10,
        trigger_limit: 999999,
      })).toBe(true);
    });

    it("returns false when valid_until is in the past (seconds)", () => {
      const pastTs = Math.floor(Date.now() / 1000) - 86400; // 1 day ago
      expect(isWithinGracePeriod({
        key: "current",
        tier: "pro",
        email: null,
        subscription_id: null,
        customer_id: null,
        valid_until: pastTs,
        verified_at: null,
        connector_limit: 10,
        trigger_limit: 999999,
      })).toBe(false);
    });

    it("returns true when valid_until is in the future (milliseconds)", () => {
      const futureMs = Date.now() + 86400000; // 1 day ahead
      expect(isWithinGracePeriod({
        key: "current",
        tier: "pro",
        email: null,
        subscription_id: null,
        customer_id: null,
        valid_until: futureMs,
        verified_at: null,
        connector_limit: 10,
        trigger_limit: 999999,
      })).toBe(true);
    });
  });

  // ── License staleness ──────────────────────────────────────────

  describe("isLicenseStale", () => {
    beforeEach(() => {
      db.prepare("DELETE FROM billing_license").run();
    });

    it("returns false for free tier with no verification", () => {
      // Free tier doesn't need verification
      expect(isLicenseStale()).toBe(false);
    });

    it("returns true for non-free tier with no verification", () => {
      updateLicense({ tier: "pro" });
      expect(isLicenseStale()).toBe(true);
    });

    it("returns false when recently verified", () => {
      const now = Math.floor(Date.now() / 1000);
      updateLicense({
        tier: "pro",
        verified_at: now,
      });
      expect(isLicenseStale()).toBe(false);
    });

    it("returns true when verification is older than 7 days", () => {
      const eightDaysAgo = Math.floor((Date.now() - GRACE_PERIOD_MS - 1000) / 1000);
      updateLicense({
        tier: "pro",
        verified_at: eightDaysAgo,
      });
      expect(isLicenseStale()).toBe(true);
    });
  });
});
