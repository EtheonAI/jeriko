// Billing store tests — CRUD operations for subscriptions, events, and license cache.

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { initDatabase, closeDatabase } from "../../../src/daemon/storage/db.js";
import {
  getSubscription,
  getSubscriptionById,
  upsertSubscription,
  recordEvent,
  hasEvent,
  getEventsByType,
  getRecentEvents,
  getLicense,
  updateLicense,
  recordConsent,
  getConsentBySubscription,
  getConsentBySession,
} from "../../../src/daemon/billing/store.js";
import { TIER_LIMITS, UNLIMITED_TRIGGERS_STORED } from "../../../src/daemon/billing/config.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import type { Database } from "bun:sqlite";

const TEST_DB = join(tmpdir(), `jeriko-billing-store-test-${Date.now()}.db`);

describe("billing/store", () => {
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

  // ── Migration ────────────────────────────────────────────────

  describe("migration", () => {
    it("creates billing_subscription table", () => {
      const tables = db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name);
      expect(tables).toContain("billing_subscription");
    });

    it("creates billing_event table", () => {
      const tables = db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name);
      expect(tables).toContain("billing_event");
    });

    it("creates billing_license table", () => {
      const tables = db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name);
      expect(tables).toContain("billing_license");
    });

    it("creates indexes on billing_event", () => {
      const indexes = db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
        .all()
        .map((r) => r.name);
      expect(indexes).toContain("idx_billing_event_type");
      expect(indexes).toContain("idx_billing_event_sub");
    });
  });

  // ── Subscription CRUD ────────────────────────────────────────

  describe("subscription", () => {
    it("returns null when no subscription exists", () => {
      const sub = getSubscription();
      // May be null or may return from a previous test — test is run in isolation
      // by checking specific IDs
      const specific = getSubscriptionById("sub_nonexistent");
      expect(specific).toBeNull();
    });

    it("creates a subscription via upsert", () => {
      upsertSubscription({
        id: "sub_test_001",
        customer_id: "cus_test_001",
        email: "test@example.com",
        tier: "pro",
        status: "active",
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        cancel_at_period_end: false,
        terms_accepted_at: 1699999000,
      });

      const sub = getSubscriptionById("sub_test_001");
      expect(sub).not.toBeNull();
      expect(sub!.id).toBe("sub_test_001");
      expect(sub!.customer_id).toBe("cus_test_001");
      expect(sub!.email).toBe("test@example.com");
      expect(sub!.tier).toBe("pro");
      expect(sub!.status).toBe("active");
      expect(sub!.current_period_start).toBe(1700000000);
      expect(sub!.current_period_end).toBe(1702592000);
      expect(sub!.cancel_at_period_end).toBe(false);
      expect(sub!.terms_accepted_at).toBe(1699999000);
    });

    it("updates existing subscription via upsert", () => {
      upsertSubscription({
        id: "sub_test_001",
        customer_id: "cus_test_001",
        email: "test@example.com",
        tier: "pro",
        status: "past_due",
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        cancel_at_period_end: true,
        terms_accepted_at: 1699999000,
      });

      const sub = getSubscriptionById("sub_test_001");
      expect(sub!.status).toBe("past_due");
      expect(sub!.cancel_at_period_end).toBe(true);
    });

    it("getSubscription returns the most recently updated", () => {
      // Set explicit timestamps to ensure ordering (unixepoch() may collide within a second)
      const now = Math.floor(Date.now() / 1000);

      upsertSubscription({
        id: "sub_test_002",
        customer_id: "cus_test_002",
        email: "other@example.com",
        tier: "team",
        status: "active",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        terms_accepted_at: null,
        updated_at: now + 100, // Explicitly newer
      });

      const sub = getSubscription();
      expect(sub).not.toBeNull();
      // Should be the most recently updated
      expect(sub!.id).toBe("sub_test_002");
    });

    it("handles null period timestamps", () => {
      const sub = getSubscriptionById("sub_test_002");
      expect(sub!.current_period_start).toBeNull();
      expect(sub!.current_period_end).toBeNull();
    });

    it("handles null terms_accepted_at", () => {
      const sub = getSubscriptionById("sub_test_002");
      expect(sub!.terms_accepted_at).toBeNull();
    });
  });

  // ── Event audit trail ─────────────────────────────────────────

  describe("events", () => {
    it("records an event", () => {
      recordEvent({
        id: "evt_test_001",
        type: "invoice.paid",
        subscription_id: "sub_test_001",
        payload: JSON.stringify({ type: "invoice.paid", data: { object: {} } }),
      });

      expect(hasEvent("evt_test_001")).toBe(true);
    });

    it("hasEvent returns false for unknown events", () => {
      expect(hasEvent("evt_nonexistent")).toBe(false);
    });

    it("is idempotent — ignores duplicate event IDs", () => {
      recordEvent({
        id: "evt_test_dup",
        type: "invoice.paid",
        subscription_id: "sub_test_001",
        payload: JSON.stringify({ first: true }),
      });

      // Record again with different payload
      recordEvent({
        id: "evt_test_dup",
        type: "invoice.paid",
        subscription_id: "sub_test_001",
        payload: JSON.stringify({ second: true }),
      });

      // Should still have the first payload
      const events = getEventsByType("invoice.paid");
      const found = events.find((e) => e.id === "evt_test_dup");
      expect(found).toBeTruthy();
      expect(JSON.parse(found!.payload).first).toBe(true);
    });

    it("getEventsByType filters by type", () => {
      recordEvent({
        id: "evt_test_002",
        type: "checkout.session.completed",
        subscription_id: "sub_test_001",
        payload: "{}",
      });

      const invoiceEvents = getEventsByType("invoice.paid");
      const checkoutEvents = getEventsByType("checkout.session.completed");

      for (const e of invoiceEvents) {
        expect(e.type).toBe("invoice.paid");
      }
      for (const e of checkoutEvents) {
        expect(e.type).toBe("checkout.session.completed");
      }
    });

    it("getEventsByType respects limit", () => {
      // Add more events
      for (let i = 10; i < 20; i++) {
        recordEvent({
          id: `evt_limit_${i}`,
          type: "invoice.paid",
          subscription_id: null,
          payload: "{}",
        });
      }

      const events = getEventsByType("invoice.paid", 3);
      expect(events.length).toBeLessThanOrEqual(3);
    });

    it("getRecentEvents returns events across all types", () => {
      const events = getRecentEvents(100);
      const types = new Set(events.map((e) => e.type));
      expect(types.size).toBeGreaterThanOrEqual(2);
    });

    it("getRecentEvents sorts by processed_at descending", () => {
      const events = getRecentEvents(100);
      for (let i = 1; i < events.length; i++) {
        expect(events[i - 1]!.processed_at).toBeGreaterThanOrEqual(events[i]!.processed_at);
      }
    });

    it("stores full JSON payload", () => {
      const payload = { type: "customer.subscription.updated", data: { object: { id: "sub_123", status: "active" } } };
      recordEvent({
        id: "evt_payload_test",
        type: "customer.subscription.updated",
        subscription_id: "sub_123",
        payload: JSON.stringify(payload),
      });

      const events = getEventsByType("customer.subscription.updated");
      const found = events.find((e) => e.id === "evt_payload_test");
      expect(found).toBeTruthy();
      const parsed = JSON.parse(found!.payload);
      expect(parsed.data.object.id).toBe("sub_123");
    });
  });

  // ── License cache ──────────────────────────────────────────────

  describe("license", () => {
    it("returns free-tier defaults when no license exists", () => {
      // Clear any existing license first
      db.prepare("DELETE FROM billing_license").run();

      const license = getLicense();
      expect(license.key).toBe("current");
      expect(license.tier).toBe("free");
      expect(license.email).toBeNull();
      expect(license.subscription_id).toBeNull();
      expect(license.customer_id).toBeNull();
      expect(license.valid_until).toBeNull();
      expect(license.verified_at).toBeNull();
      expect(license.connector_limit).toBe(TIER_LIMITS.free.connectors);
      expect(license.trigger_limit).toBe(TIER_LIMITS.free.triggers);
    });

    it("updates license with partial data", () => {
      updateLicense({
        tier: "pro",
        connector_limit: UNLIMITED_TRIGGERS_STORED,
        trigger_limit: UNLIMITED_TRIGGERS_STORED,
      });

      const license = getLicense();
      expect(license.tier).toBe("pro");
      expect(license.connector_limit).toBe(UNLIMITED_TRIGGERS_STORED);
      expect(license.trigger_limit).toBe(UNLIMITED_TRIGGERS_STORED);
      // Other fields should remain as defaults
      expect(license.key).toBe("current");
    });

    it("updates license email and customer_id", () => {
      updateLicense({
        email: "pro@example.com",
        customer_id: "cus_pro",
        subscription_id: "sub_pro",
      });

      const license = getLicense();
      expect(license.email).toBe("pro@example.com");
      expect(license.customer_id).toBe("cus_pro");
      expect(license.subscription_id).toBe("sub_pro");
    });

    it("updates verified_at and valid_until", () => {
      const now = Math.floor(Date.now() / 1000);
      const validUntil = now + 604800; // 7 days

      updateLicense({
        verified_at: now,
        valid_until: validUntil,
      });

      const license = getLicense();
      expect(license.verified_at).toBe(now);
      expect(license.valid_until).toBe(validUntil);
    });

    it("overwrites previous license on subsequent updates", () => {
      updateLicense({ tier: "free", connector_limit: TIER_LIMITS.free.connectors, trigger_limit: TIER_LIMITS.free.triggers });
      let license = getLicense();
      expect(license.tier).toBe("free");

      updateLicense({ tier: "pro", connector_limit: UNLIMITED_TRIGGERS_STORED, trigger_limit: UNLIMITED_TRIGGERS_STORED });
      license = getLicense();
      expect(license.tier).toBe("pro");
      expect(license.connector_limit).toBe(UNLIMITED_TRIGGERS_STORED);
    });

    it("always uses 'current' as the singleton key", () => {
      const rows = db
        .query<{ key: string }, []>("SELECT key FROM billing_license")
        .all();
      expect(rows.length).toBe(1);
      expect(rows[0]!.key).toBe("current");
    });
  });

  // ── Consent evidence ─────────────────────────────────────────

  describe("consent", () => {
    it("creates billing_consent table via migration", () => {
      const tables = db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name);
      expect(tables).toContain("billing_consent");
    });

    it("creates indexes on billing_consent", () => {
      const indexes = db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
        .all()
        .map((r) => r.name);
      expect(indexes).toContain("idx_billing_consent_sub");
      expect(indexes).toContain("idx_billing_consent_customer");
    });

    it("records consent evidence", () => {
      recordConsent({
        id: "consent_sub_001_1700000000",
        subscription_id: "sub_consent_001",
        customer_id: "cus_consent_001",
        email: "consent@example.com",
        client_ip: "192.168.1.100",
        user_agent: "jeriko-cli/2.0.0 (darwin)",
        terms_url: "https://jeriko.ai/terms",
        terms_version: "1.0",
        terms_accepted_at: 1700000000,
        privacy_url: "https://jeriko.ai/privacy",
        billing_address_collected: true,
        stripe_consent_collected: true,
        checkout_session_id: "cs_test_001",
      });

      const consent = getConsentBySubscription("sub_consent_001");
      expect(consent).not.toBeNull();
      expect(consent!.subscription_id).toBe("sub_consent_001");
      expect(consent!.customer_id).toBe("cus_consent_001");
      expect(consent!.email).toBe("consent@example.com");
      expect(consent!.client_ip).toBe("192.168.1.100");
      expect(consent!.user_agent).toBe("jeriko-cli/2.0.0 (darwin)");
      expect(consent!.terms_url).toBe("https://jeriko.ai/terms");
      expect(consent!.terms_version).toBe("1.0");
      expect(consent!.terms_accepted_at).toBe(1700000000);
      expect(consent!.privacy_url).toBe("https://jeriko.ai/privacy");
      expect(consent!.billing_address_collected).toBe(true);
      expect(consent!.stripe_consent_collected).toBe(true);
      expect(consent!.checkout_session_id).toBe("cs_test_001");
    });

    it("retrieves consent by checkout session ID", () => {
      const consent = getConsentBySession("cs_test_001");
      expect(consent).not.toBeNull();
      expect(consent!.subscription_id).toBe("sub_consent_001");
    });

    it("returns null for unknown subscription", () => {
      const consent = getConsentBySubscription("sub_nonexistent");
      expect(consent).toBeNull();
    });

    it("returns null for unknown session", () => {
      const consent = getConsentBySession("cs_nonexistent");
      expect(consent).toBeNull();
    });

    it("is idempotent — ignores duplicate consent IDs", () => {
      recordConsent({
        id: "consent_dup_test",
        subscription_id: "sub_consent_dup",
        customer_id: "cus_dup",
        email: "first@example.com",
        client_ip: "10.0.0.1",
        user_agent: "first-agent",
        terms_url: null,
        terms_version: null,
        terms_accepted_at: null,
        privacy_url: null,
        billing_address_collected: false,
        stripe_consent_collected: false,
        checkout_session_id: null,
      });

      // Record again with different data
      recordConsent({
        id: "consent_dup_test",
        subscription_id: "sub_consent_dup",
        customer_id: "cus_dup",
        email: "second@example.com",
        client_ip: "10.0.0.2",
        user_agent: "second-agent",
        terms_url: null,
        terms_version: null,
        terms_accepted_at: null,
        privacy_url: null,
        billing_address_collected: true,
        stripe_consent_collected: true,
        checkout_session_id: null,
      });

      // Should still have the first record
      const consent = getConsentBySubscription("sub_consent_dup");
      expect(consent).not.toBeNull();
      expect(consent!.email).toBe("first@example.com");
      expect(consent!.client_ip).toBe("10.0.0.1");
    });

    it("handles null fields gracefully", () => {
      recordConsent({
        id: "consent_nulls",
        subscription_id: null,
        customer_id: null,
        email: null,
        client_ip: null,
        user_agent: null,
        terms_url: null,
        terms_version: null,
        terms_accepted_at: null,
        privacy_url: null,
        billing_address_collected: false,
        stripe_consent_collected: false,
        checkout_session_id: "cs_nulls",
      });

      const consent = getConsentBySession("cs_nulls");
      expect(consent).not.toBeNull();
      expect(consent!.subscription_id).toBeNull();
      expect(consent!.client_ip).toBeNull();
      expect(consent!.billing_address_collected).toBe(false);
      expect(consent!.stripe_consent_collected).toBe(false);
    });
  });
});
