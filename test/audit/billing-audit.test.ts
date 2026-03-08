// Billing system audit tests — comprehensive verification of tier limits,
// license lifecycle, grace periods, store CRUD, webhook processing,
// gate enforcement, and CLI output format.
//
// No real Stripe API calls. Tests logic, limits, and gates only.

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { createHmac } from "node:crypto";
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
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
  PRO_PRICE_DISPLAY,
} from "../../src/daemon/billing/config.js";
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
} from "../../src/daemon/billing/store.js";
import {
  getLicenseState,
  canActivateConnector,
  canAddTrigger,
  effectiveTier,
  isWithinGracePeriod,
  isLicenseStale,
  enforceLicenseLimits,
} from "../../src/daemon/billing/license.js";
import { processWebhookEvent } from "../../src/daemon/billing/webhook.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import type { Database } from "bun:sqlite";

const TEST_DB = join(tmpdir(), `jeriko-billing-audit-${Date.now()}.db`);
const TEST_WEBHOOK_SECRET = "whsec_audit_test_secret";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signPayload(body: string, secret: string = TEST_WEBHOOK_SECRET): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${body}`;
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function makeEvent(type: string, data: Record<string, unknown>, id?: string): string {
  return JSON.stringify({
    id: id ?? `evt_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    data: { object: data },
  });
}

function setTierState(
  db: Database,
  tier: "free" | "pro" | "team" | "enterprise",
  status: string = tier === "free" ? "none" : "active",
): void {
  const limits = TIER_LIMITS[tier];
  db.prepare("DELETE FROM billing_subscription").run();
  if (status !== "none") {
    upsertSubscription({
      id: "sub_audit_test",
      customer_id: "cus_audit",
      email: "audit@test.com",
      tier,
      status,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      terms_accepted_at: null,
    });
  }
  updateLicense({
    tier,
    subscription_id: status !== "none" ? "sub_audit_test" : null,
    connector_limit: limits.connectors === Infinity ? UNLIMITED_TRIGGERS_STORED : limits.connectors,
    trigger_limit: limits.triggers === Infinity ? UNLIMITED_TRIGGERS_STORED : limits.triggers,
  });
}

// Mock ConnectorManager
class MockConnectors {
  private instances = new Map<string, boolean>();
  addInstance(name: string): void { this.instances.set(name, true); }
  get activeCount(): number { return this.instances.size; }
  async enforceLimits(max: number): Promise<string[]> {
    const entries = [...this.instances.keys()].reverse();
    const evicted: string[] = [];
    const excess = this.instances.size - max;
    if (excess <= 0) return [];
    for (const name of entries) {
      if (evicted.length >= excess) break;
      this.instances.delete(name);
      evicted.push(name);
    }
    return evicted;
  }
  getActiveNames(): string[] { return [...this.instances.keys()]; }
}

// Mock TriggerEngine
class MockTriggers {
  private triggers = new Map<string, { enabled: boolean; created_at: string }>();
  addTrigger(id: string, enabled: boolean, created_at?: string): void {
    this.triggers.set(id, { enabled, created_at: created_at ?? new Date().toISOString() });
  }
  get enabledCount(): number {
    return [...this.triggers.values()].filter((t) => t.enabled).length;
  }
  enforceLimits(max: number): string[] {
    const enabled = [...this.triggers.entries()]
      .filter(([, t]) => t.enabled)
      .sort((a, b) => new Date(a[1].created_at).getTime() - new Date(b[1].created_at).getTime());
    if (enabled.length <= max) return [];
    const excess = enabled.slice(max);
    const disabled: string[] = [];
    for (const [id, trigger] of excess) {
      trigger.enabled = false;
      disabled.push(id);
    }
    return disabled;
  }
  isEnabled(id: string): boolean { return this.triggers.get(id)?.enabled ?? false; }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("billing audit", () => {
  let db: Database;
  let savedEnv: Record<string, string | undefined>;

  beforeAll(() => {
    savedEnv = {};
    for (const val of Object.values(BILLING_ENV)) {
      savedEnv[val] = process.env[val];
    }
    process.env[BILLING_ENV.secretKey] = "sk_test_audit";
    process.env[BILLING_ENV.webhookSecret] = TEST_WEBHOOK_SECRET;
    db = initDatabase(TEST_DB);
  });

  afterAll(() => {
    closeDatabase();
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) process.env[key] = val;
      else delete process.env[key];
    }
    for (const suffix of ["", "-wal", "-shm"]) {
      try { if (existsSync(TEST_DB + suffix)) unlinkSync(TEST_DB + suffix); } catch {}
    }
  });

  beforeEach(() => {
    db.prepare("DELETE FROM billing_subscription").run();
    db.prepare("DELETE FROM billing_license").run();
    db.prepare("DELETE FROM billing_event").run();
    db.prepare("DELETE FROM billing_consent").run();
  });

  // =========================================================================
  // 1. Tier Limits Correctness
  // =========================================================================

  describe("tier limits", () => {
    it("free tier: 5 connectors, 10 triggers, label 'Community'", () => {
      expect(TIER_LIMITS.free).toEqual({ connectors: 5, triggers: 10, label: "Community" });
    });

    it("pro tier: unlimited connectors, unlimited triggers, label 'Pro'", () => {
      expect(TIER_LIMITS.pro.connectors).toBe(Infinity);
      expect(TIER_LIMITS.pro.triggers).toBe(Infinity);
      expect(TIER_LIMITS.pro.label).toBe("Pro");
    });

    it("team tier: unlimited connectors, unlimited triggers, label 'Team'", () => {
      expect(TIER_LIMITS.team.connectors).toBe(Infinity);
      expect(TIER_LIMITS.team.triggers).toBe(Infinity);
      expect(TIER_LIMITS.team.label).toBe("Team");
    });

    it("enterprise tier: unlimited connectors, unlimited triggers, label 'Enterprise'", () => {
      expect(TIER_LIMITS.enterprise.connectors).toBe(Infinity);
      expect(TIER_LIMITS.enterprise.triggers).toBe(Infinity);
      expect(TIER_LIMITS.enterprise.label).toBe("Enterprise");
    });

    it("exactly 4 tiers defined", () => {
      expect(Object.keys(TIER_LIMITS)).toHaveLength(4);
    });

    it("UNLIMITED_TRIGGERS_STORED sentinel is 999999", () => {
      expect(UNLIMITED_TRIGGERS_STORED).toBe(999_999);
    });

    it("isBillingTier validates correctly", () => {
      expect(isBillingTier("free")).toBe(true);
      expect(isBillingTier("pro")).toBe(true);
      expect(isBillingTier("team")).toBe(true);
      expect(isBillingTier("enterprise")).toBe(true);
      expect(isBillingTier("premium")).toBe(false);
      expect(isBillingTier("")).toBe(false);
      expect(isBillingTier("FREE")).toBe(false);
    });

    it("PRO_PRICE_DISPLAY is set", () => {
      expect(PRO_PRICE_DISPLAY).toBe("$19.99/mo");
    });
  });

  // =========================================================================
  // 2. Status Classification
  // =========================================================================

  describe("status classification", () => {
    it("ACTIVE_STATUSES: active, trialing", () => {
      expect(ACTIVE_STATUSES.has("active")).toBe(true);
      expect(ACTIVE_STATUSES.has("trialing")).toBe(true);
      expect(ACTIVE_STATUSES.size).toBe(2);
    });

    it("GRACE_STATUSES: past_due only", () => {
      expect(GRACE_STATUSES.has("past_due")).toBe(true);
      expect(GRACE_STATUSES.size).toBe(1);
    });

    it("INACTIVE_STATUSES: 5 terminal states", () => {
      const expected = ["canceled", "unpaid", "incomplete_expired", "paused", "incomplete"];
      for (const s of expected) {
        expect(INACTIVE_STATUSES.has(s)).toBe(true);
      }
      expect(INACTIVE_STATUSES.size).toBe(5);
    });

    it("status sets are mutually exclusive", () => {
      const all = [...ACTIVE_STATUSES, ...GRACE_STATUSES, ...INACTIVE_STATUSES];
      const unique = new Set(all);
      expect(unique.size).toBe(all.length);
    });
  });

  // =========================================================================
  // 3. License Creation and Validation
  // =========================================================================

  describe("license creation and validation", () => {
    it("default license is free tier with correct limits", () => {
      const license = getLicense();
      expect(license.key).toBe("current");
      expect(license.tier).toBe("free");
      expect(license.connector_limit).toBe(TIER_LIMITS.free.connectors);
      expect(license.trigger_limit).toBe(TIER_LIMITS.free.triggers);
      expect(license.email).toBeNull();
      expect(license.subscription_id).toBeNull();
      expect(license.customer_id).toBeNull();
      expect(license.valid_until).toBeNull();
      expect(license.verified_at).toBeNull();
    });

    it("updateLicense merges partial updates", () => {
      updateLicense({ tier: "pro", connector_limit: UNLIMITED_TRIGGERS_STORED });
      const license = getLicense();
      expect(license.tier).toBe("pro");
      expect(license.connector_limit).toBe(UNLIMITED_TRIGGERS_STORED);
      // trigger_limit should remain at default (free tier) since not updated
      expect(license.trigger_limit).toBe(TIER_LIMITS.free.triggers);
    });

    it("updateLicense always uses singleton key 'current'", () => {
      updateLicense({ tier: "pro" });
      updateLicense({ tier: "team" });
      const rows = db.query<{ key: string }, []>("SELECT key FROM billing_license").all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.key).toBe("current");
    });

    it("getLicenseState returns free when no subscription exists", () => {
      const state = getLicenseState();
      expect(state.tier).toBe("free");
      expect(state.label).toBe("Community");
      expect(state.connectorLimit).toBe(TIER_LIMITS.free.connectors);
      expect(state.triggerLimit).toBe(TIER_LIMITS.free.triggers);
      expect(state.status).toBe("none");
      expect(state.pastDue).toBe(false);
      expect(state.gracePeriod).toBe(false);
    });

    it("getLicenseState returns pro with active subscription", () => {
      setTierState(db, "pro", "active");
      const state = getLicenseState();
      expect(state.tier).toBe("pro");
      expect(state.label).toBe("Pro");
      expect(state.connectorLimit).toBe(UNLIMITED_TRIGGERS_STORED);
      expect(state.status).toBe("active");
    });

    it("getLicenseState uses Math.min for limit enforcement after cancellation", () => {
      // License says pro (stale), but subscription is canceled
      updateLicense({
        tier: "pro",
        connector_limit: UNLIMITED_TRIGGERS_STORED,
        trigger_limit: UNLIMITED_TRIGGERS_STORED,
        subscription_id: "sub_canceled",
      });
      upsertSubscription({
        id: "sub_canceled",
        customer_id: "cus_1",
        email: "x@x.com",
        tier: "pro",
        status: "canceled",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        terms_accepted_at: null,
      });
      const state = getLicenseState();
      // effectiveTier("canceled", "pro") = "free"
      // Math.min(999999, 5) = 5, Math.min(999999, 10) = 10
      expect(state.tier).toBe("free");
      expect(state.connectorLimit).toBe(TIER_LIMITS.free.connectors);
      expect(state.triggerLimit).toBe(TIER_LIMITS.free.triggers);
    });
  });

  // =========================================================================
  // 4. Grace Period Calculation
  // =========================================================================

  describe("grace period", () => {
    it("GRACE_PERIOD_MS is exactly 7 days", () => {
      expect(GRACE_PERIOD_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("PAST_DUE_GRACE_MS is exactly 7 days", () => {
      expect(PAST_DUE_GRACE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("isWithinGracePeriod returns false when valid_until is null", () => {
      expect(isWithinGracePeriod({
        key: "current", tier: "pro", email: null, subscription_id: null,
        customer_id: null, valid_until: null, verified_at: null,
        connector_limit: UNLIMITED_TRIGGERS_STORED, trigger_limit: UNLIMITED_TRIGGERS_STORED,
      })).toBe(false);
    });

    it("isWithinGracePeriod returns true when valid_until is future (seconds)", () => {
      const future = Math.floor(Date.now() / 1000) + 86400;
      expect(isWithinGracePeriod({
        key: "current", tier: "pro", email: null, subscription_id: null,
        customer_id: null, valid_until: future, verified_at: null,
        connector_limit: UNLIMITED_TRIGGERS_STORED, trigger_limit: UNLIMITED_TRIGGERS_STORED,
      })).toBe(true);
    });

    it("isWithinGracePeriod returns false when valid_until is past (seconds)", () => {
      const past = Math.floor(Date.now() / 1000) - 86400;
      expect(isWithinGracePeriod({
        key: "current", tier: "pro", email: null, subscription_id: null,
        customer_id: null, valid_until: past, verified_at: null,
        connector_limit: UNLIMITED_TRIGGERS_STORED, trigger_limit: UNLIMITED_TRIGGERS_STORED,
      })).toBe(false);
    });

    it("isWithinGracePeriod handles millisecond timestamps", () => {
      const futureMs = Date.now() + 86400_000;
      expect(isWithinGracePeriod({
        key: "current", tier: "pro", email: null, subscription_id: null,
        customer_id: null, valid_until: futureMs, verified_at: null,
        connector_limit: UNLIMITED_TRIGGERS_STORED, trigger_limit: UNLIMITED_TRIGGERS_STORED,
      })).toBe(true);
    });

    it("past_due subscription keeps tier and sets pastDue flag", () => {
      setTierState(db, "pro", "past_due");
      const state = getLicenseState();
      expect(state.tier).toBe("pro");
      expect(state.pastDue).toBe(true);
      expect(state.connectorLimit).toBe(UNLIMITED_TRIGGERS_STORED);
    });

    it("past_due with valid_until set has gracePeriod true", () => {
      updateLicense({
        tier: "pro",
        connector_limit: UNLIMITED_TRIGGERS_STORED,
        trigger_limit: UNLIMITED_TRIGGERS_STORED,
        subscription_id: "sub_pd",
        valid_until: Math.floor(Date.now() / 1000) + 86400,
      });
      upsertSubscription({
        id: "sub_pd", customer_id: "cus_1", email: "x@x.com",
        tier: "pro", status: "past_due",
        current_period_start: null, current_period_end: null,
        cancel_at_period_end: false, terms_accepted_at: null,
      });
      const state = getLicenseState();
      expect(state.gracePeriod).toBe(true);
    });

    it("isLicenseStale: free tier never stale without verification", () => {
      expect(isLicenseStale()).toBe(false);
    });

    it("isLicenseStale: non-free tier without verification is stale", () => {
      updateLicense({ tier: "pro" });
      expect(isLicenseStale()).toBe(true);
    });

    it("isLicenseStale: recently verified is not stale", () => {
      updateLicense({ tier: "pro", verified_at: Math.floor(Date.now() / 1000) });
      expect(isLicenseStale()).toBe(false);
    });

    it("isLicenseStale: verified 8+ days ago is stale", () => {
      const eightDaysAgo = Math.floor((Date.now() - GRACE_PERIOD_MS - 1000) / 1000);
      updateLicense({ tier: "pro", verified_at: eightDaysAgo });
      expect(isLicenseStale()).toBe(true);
    });
  });

  // =========================================================================
  // 5. Store CRUD
  // =========================================================================

  describe("store CRUD", () => {
    describe("subscription", () => {
      it("getSubscriptionById returns null for unknown ID", () => {
        expect(getSubscriptionById("sub_nonexistent")).toBeNull();
      });

      it("upsert creates and retrieves subscription", () => {
        upsertSubscription({
          id: "sub_crud_1", customer_id: "cus_1", email: "crud@test.com",
          tier: "pro", status: "active",
          current_period_start: 1700000000, current_period_end: 1702592000,
          cancel_at_period_end: false, terms_accepted_at: 1699999000,
        });
        const sub = getSubscriptionById("sub_crud_1");
        expect(sub).not.toBeNull();
        expect(sub!.id).toBe("sub_crud_1");
        expect(sub!.email).toBe("crud@test.com");
        expect(sub!.tier).toBe("pro");
        expect(sub!.status).toBe("active");
        expect(sub!.cancel_at_period_end).toBe(false);
        expect(sub!.current_period_start).toBe(1700000000);
      });

      it("upsert updates existing subscription", () => {
        upsertSubscription({
          id: "sub_crud_1", customer_id: "cus_1", email: "crud@test.com",
          tier: "pro", status: "past_due",
          current_period_start: null, current_period_end: null,
          cancel_at_period_end: true, terms_accepted_at: null,
        });
        const sub = getSubscriptionById("sub_crud_1");
        expect(sub!.status).toBe("past_due");
        expect(sub!.cancel_at_period_end).toBe(true);
      });

      it("getSubscription returns most recently updated", () => {
        const now = Math.floor(Date.now() / 1000);
        upsertSubscription({
          id: "sub_old", customer_id: "cus_1", email: "a@test.com",
          tier: "pro", status: "active",
          current_period_start: null, current_period_end: null,
          cancel_at_period_end: false, terms_accepted_at: null,
          updated_at: now - 100,
        });
        upsertSubscription({
          id: "sub_new", customer_id: "cus_2", email: "b@test.com",
          tier: "team", status: "active",
          current_period_start: null, current_period_end: null,
          cancel_at_period_end: false, terms_accepted_at: null,
          updated_at: now + 100,
        });
        const sub = getSubscription();
        expect(sub!.id).toBe("sub_new");
      });
    });

    describe("events", () => {
      it("recordEvent + hasEvent", () => {
        recordEvent({
          id: "evt_crud_1", type: "invoice.paid",
          subscription_id: "sub_1", payload: '{"test":true}',
        });
        expect(hasEvent("evt_crud_1")).toBe(true);
        expect(hasEvent("evt_nonexistent")).toBe(false);
      });

      it("recordEvent is idempotent (INSERT OR IGNORE)", () => {
        recordEvent({
          id: "evt_dup", type: "invoice.paid",
          subscription_id: null, payload: '{"first":true}',
        });
        recordEvent({
          id: "evt_dup", type: "invoice.paid",
          subscription_id: null, payload: '{"second":true}',
        });
        const events = getEventsByType("invoice.paid");
        const found = events.find((e) => e.id === "evt_dup");
        expect(JSON.parse(found!.payload).first).toBe(true);
      });

      it("getEventsByType filters correctly", () => {
        recordEvent({ id: "evt_a", type: "invoice.paid", subscription_id: null, payload: "{}" });
        recordEvent({ id: "evt_b", type: "checkout.session.completed", subscription_id: null, payload: "{}" });
        const invoiceEvents = getEventsByType("invoice.paid");
        for (const e of invoiceEvents) expect(e.type).toBe("invoice.paid");
      });

      it("getEventsByType respects limit", () => {
        for (let i = 0; i < 10; i++) {
          recordEvent({ id: `evt_lim_${i}`, type: "test.type", subscription_id: null, payload: "{}" });
        }
        expect(getEventsByType("test.type", 3).length).toBeLessThanOrEqual(3);
      });

      it("getRecentEvents returns descending by processed_at", () => {
        recordEvent({ id: "evt_r1", type: "a", subscription_id: null, payload: "{}" });
        recordEvent({ id: "evt_r2", type: "b", subscription_id: null, payload: "{}" });
        const events = getRecentEvents(100);
        for (let i = 1; i < events.length; i++) {
          expect(events[i - 1]!.processed_at).toBeGreaterThanOrEqual(events[i]!.processed_at);
        }
      });
    });

    describe("license", () => {
      it("getLicense returns defaults when empty", () => {
        const lic = getLicense();
        expect(lic.tier).toBe("free");
        expect(lic.connector_limit).toBe(TIER_LIMITS.free.connectors);
        expect(lic.trigger_limit).toBe(TIER_LIMITS.free.triggers);
      });

      it("updateLicense partial merge preserves existing fields", () => {
        updateLicense({ tier: "pro", connector_limit: 10, email: "a@b.com" });
        updateLicense({ trigger_limit: UNLIMITED_TRIGGERS_STORED });
        const lic = getLicense();
        expect(lic.tier).toBe("pro");
        expect(lic.connector_limit).toBe(10);
        expect(lic.email).toBe("a@b.com");
        expect(lic.trigger_limit).toBe(UNLIMITED_TRIGGERS_STORED);
      });
    });

    describe("consent", () => {
      it("records and retrieves consent by subscription", () => {
        recordConsent({
          id: "consent_1", subscription_id: "sub_c1", customer_id: "cus_c1",
          email: "c@test.com", client_ip: "1.2.3.4", user_agent: "test/1.0",
          terms_url: "https://jeriko.ai/terms", terms_version: "1.0",
          terms_accepted_at: 1700000000, privacy_url: "https://jeriko.ai/privacy",
          billing_address_collected: true, stripe_consent_collected: true,
          checkout_session_id: "cs_1",
        });
        const consent = getConsentBySubscription("sub_c1");
        expect(consent).not.toBeNull();
        expect(consent!.client_ip).toBe("1.2.3.4");
        expect(consent!.billing_address_collected).toBe(true);
        expect(consent!.stripe_consent_collected).toBe(true);
      });

      it("retrieves consent by session ID", () => {
        recordConsent({
          id: "consent_2", subscription_id: "sub_c2", customer_id: "cus_c2",
          email: null, client_ip: null, user_agent: null,
          terms_url: null, terms_version: null, terms_accepted_at: null,
          privacy_url: null, billing_address_collected: false,
          stripe_consent_collected: false, checkout_session_id: "cs_lookup",
        });
        const consent = getConsentBySession("cs_lookup");
        expect(consent).not.toBeNull();
        expect(consent!.subscription_id).toBe("sub_c2");
      });

      it("consent is idempotent", () => {
        recordConsent({
          id: "consent_dup", subscription_id: "sub_dup", customer_id: "cus_dup",
          email: "first@test.com", client_ip: "10.0.0.1", user_agent: "first",
          terms_url: null, terms_version: null, terms_accepted_at: null,
          privacy_url: null, billing_address_collected: false,
          stripe_consent_collected: false, checkout_session_id: null,
        });
        recordConsent({
          id: "consent_dup", subscription_id: "sub_dup", customer_id: "cus_dup",
          email: "second@test.com", client_ip: "10.0.0.2", user_agent: "second",
          terms_url: null, terms_version: null, terms_accepted_at: null,
          privacy_url: null, billing_address_collected: true,
          stripe_consent_collected: true, checkout_session_id: null,
        });
        const consent = getConsentBySubscription("sub_dup");
        expect(consent!.email).toBe("first@test.com");
      });
    });
  });

  // =========================================================================
  // 6. Webhook Event Processing
  // =========================================================================

  describe("webhook processing", () => {
    it("rejects invalid signature", () => {
      const body = makeEvent("invoice.paid", {});
      const result = processWebhookEvent(body, "t=123,v1=bad");
      expect(result.handled).toBe(false);
    });

    it("accepts valid signature", () => {
      const body = makeEvent("some.event", {});
      const result = processWebhookEvent(body, signPayload(body));
      expect(result.handled).toBe(true);
    });

    it("idempotent — same event processed once", () => {
      const eventId = "evt_idem_audit";
      const body = makeEvent("invoice.paid", { subscription: "sub_idem" }, eventId);
      processWebhookEvent(body, signPayload(body));
      const result2 = processWebhookEvent(body, signPayload(body));
      expect(result2.handled).toBe(true);
      const events = getRecentEvents(100).filter((e) => e.id === eventId);
      expect(events).toHaveLength(1);
    });

    it("trusted mode skips signature verification", () => {
      const body = makeEvent("checkout.session.completed", {
        subscription: "sub_trusted", customer: "cus_trusted",
        customer_email: "t@test.com", metadata: {},
      });
      const result = processWebhookEvent(body, "invalid", { trusted: true });
      expect(result.handled).toBe(true);
      expect(getSubscriptionById("sub_trusted")).not.toBeNull();
    });

    it("checkout.session.completed creates subscription + license + consent", () => {
      const body = makeEvent("checkout.session.completed", {
        id: "cs_full", subscription: "sub_full", customer: "cus_full",
        customer_email: "full@test.com",
        consent: { terms_of_service: "accepted" },
        billing_address_collection: "required",
        metadata: { client_ip: "8.8.8.8", user_agent: "test/2.0" },
      });
      processWebhookEvent(body, signPayload(body));

      const sub = getSubscriptionById("sub_full");
      expect(sub!.tier).toBe("pro");
      expect(sub!.status).toBe("active");
      expect(sub!.terms_accepted_at).not.toBeNull();

      const lic = getLicense();
      expect(lic.tier).toBe("pro");
      expect(lic.connector_limit).toBe(UNLIMITED_TRIGGERS_STORED);
      expect(lic.trigger_limit).toBe(UNLIMITED_TRIGGERS_STORED);

      const consent = getConsentBySubscription("sub_full");
      expect(consent!.client_ip).toBe("8.8.8.8");
      expect(consent!.stripe_consent_collected).toBe(true);
      expect(consent!.checkout_session_id).toBe("cs_full");
    });

    it("customer.subscription.deleted downgrades to free", () => {
      // Setup pro subscription
      const checkout = makeEvent("checkout.session.completed", {
        subscription: "sub_del", customer: "cus_del",
        customer_email: "del@test.com", metadata: {},
      });
      processWebhookEvent(checkout, signPayload(checkout));
      expect(getLicense().tier).toBe("pro");

      // Delete
      const del = makeEvent("customer.subscription.deleted", {
        id: "sub_del", customer: "cus_del",
      });
      processWebhookEvent(del, signPayload(del));

      expect(getSubscriptionById("sub_del")!.status).toBe("canceled");
      expect(getSubscriptionById("sub_del")!.tier).toBe("free");
      expect(getLicense().tier).toBe("free");
      expect(getLicense().connector_limit).toBe(TIER_LIMITS.free.connectors);
      expect(getLicense().trigger_limit).toBe(TIER_LIMITS.free.triggers);
    });

    it("invoice.paid extends valid_until", () => {
      const checkout = makeEvent("checkout.session.completed", {
        subscription: "sub_inv", customer: "cus_inv",
        customer_email: "inv@test.com", metadata: {},
      });
      processWebhookEvent(checkout, signPayload(checkout));

      const inv = makeEvent("invoice.paid", { subscription: "sub_inv" });
      processWebhookEvent(inv, signPayload(inv));

      const lic = getLicense();
      expect(lic.verified_at).not.toBeNull();
      expect(lic.valid_until).not.toBeNull();
      const now = Math.floor(Date.now() / 1000);
      // valid_until should be ~7 days from now (within 10 seconds tolerance)
      expect(lic.valid_until!).toBeGreaterThan(now + 604790);
      expect(lic.valid_until!).toBeLessThan(now + 604810);
    });

    it("invoice.payment_failed marks subscription past_due", () => {
      const checkout = makeEvent("checkout.session.completed", {
        subscription: "sub_fail", customer: "cus_fail",
        customer_email: "fail@test.com", metadata: {},
      });
      processWebhookEvent(checkout, signPayload(checkout));

      const fail = makeEvent("invoice.payment_failed", { subscription: "sub_fail" });
      processWebhookEvent(fail, signPayload(fail));

      expect(getSubscriptionById("sub_fail")!.status).toBe("past_due");
    });

    it("customer.subscription.paused reverts license to free", () => {
      const checkout = makeEvent("checkout.session.completed", {
        subscription: "sub_pause", customer: "cus_pause",
        customer_email: "pause@test.com", metadata: {},
      });
      processWebhookEvent(checkout, signPayload(checkout));
      expect(getLicense().tier).toBe("pro");

      const pause = makeEvent("customer.subscription.paused", {
        id: "sub_pause", customer: "cus_pause",
      });
      processWebhookEvent(pause, signPayload(pause));
      expect(getLicense().tier).toBe("free");
    });

    it("customer.subscription.resumed restores tier", () => {
      // Create then pause
      const checkout = makeEvent("checkout.session.completed", {
        subscription: "sub_resume", customer: "cus_resume",
        customer_email: "resume@test.com", metadata: {},
      });
      processWebhookEvent(checkout, signPayload(checkout));

      const pause = makeEvent("customer.subscription.paused", {
        id: "sub_resume", customer: "cus_resume",
      });
      processWebhookEvent(pause, signPayload(pause));
      expect(getLicense().tier).toBe("free");

      // Resume
      const resume = makeEvent("customer.subscription.resumed", {
        id: "sub_resume", customer: "cus_resume",
        status: "active", metadata: { tier: "pro" },
      });
      processWebhookEvent(resume, signPayload(resume));
      expect(getLicense().tier).toBe("pro");
    });

    it("invoice.payment_action_required does NOT downgrade", () => {
      const checkout = makeEvent("checkout.session.completed", {
        subscription: "sub_3ds", customer: "cus_3ds",
        customer_email: "3ds@test.com", metadata: {},
      });
      processWebhookEvent(checkout, signPayload(checkout));

      const action = makeEvent("invoice.payment_action_required", {
        subscription: "sub_3ds",
        hosted_invoice_url: "https://invoice.stripe.com/test",
      });
      processWebhookEvent(action, signPayload(action));

      // Should still be pro
      expect(getSubscriptionById("sub_3ds")!.status).toBe("active");
      expect(getLicense().tier).toBe("pro");
    });

    it("rejects invalid JSON even in trusted mode", () => {
      const result = processWebhookEvent("not json", "", { trusted: true });
      expect(result.handled).toBe(false);
      expect(result.error).toContain("Invalid JSON");
    });

    it("rejects event missing id or type", () => {
      const result = processWebhookEvent('{"data":{}}', "", { trusted: true });
      expect(result.handled).toBe(false);
      expect(result.error).toContain("Invalid event");
    });
  });

  // =========================================================================
  // 7. effectiveTier
  // =========================================================================

  describe("effectiveTier", () => {
    it("active -> subscribed tier", () => {
      expect(effectiveTier("active", "pro")).toBe("pro");
      expect(effectiveTier("active", "team")).toBe("team");
      expect(effectiveTier("active", "enterprise")).toBe("enterprise");
      expect(effectiveTier("active", "free")).toBe("free");
    });

    it("trialing -> subscribed tier", () => {
      expect(effectiveTier("trialing", "pro")).toBe("pro");
    });

    it("past_due -> subscribed tier (grace)", () => {
      expect(effectiveTier("past_due", "pro")).toBe("pro");
    });

    it("canceled/unpaid/paused/incomplete/incomplete_expired -> free", () => {
      for (const status of ["canceled", "unpaid", "paused", "incomplete", "incomplete_expired"]) {
        expect(effectiveTier(status, "pro")).toBe("free");
      }
    });

    it("unknown status -> free", () => {
      expect(effectiveTier("weird_status", "pro")).toBe("free");
    });

    it("invalid tier string -> free", () => {
      expect(effectiveTier("active", "bogus")).toBe("free");
      expect(effectiveTier("active", "")).toBe("free");
    });
  });

  // =========================================================================
  // 8. Gate Enforcement (Connector + Trigger limits)
  // =========================================================================

  describe("gate enforcement", () => {
    describe("canActivateConnector", () => {
      it("free tier: allows 0-4, denies at 5", () => {
        setTierState(db, "free", "none");
        expect(canActivateConnector(0).allowed).toBe(true);
        expect(canActivateConnector(4).allowed).toBe(true);
        expect(canActivateConnector(5).allowed).toBe(false);
        expect(canActivateConnector(5).reason).toContain("Connector limit reached");
        expect(canActivateConnector(5).reason).toContain("5/5");
        expect(canActivateConnector(5).reason).toContain("Community");
      });

      it("pro tier: allows any count (unlimited)", () => {
        setTierState(db, "pro", "active");
        expect(canActivateConnector(5).allowed).toBe(true);
        expect(canActivateConnector(100).allowed).toBe(true);
        expect(canActivateConnector(999998).allowed).toBe(true);
      });

      it("denial message includes upgrade hint", () => {
        setTierState(db, "free", "none");
        const result = canActivateConnector(5);
        expect(result.reason).toContain("jeriko upgrade");
        expect(result.reason).toContain("unlimited");
      });
    });

    describe("canAddTrigger", () => {
      it("free tier: allows 0-9, denies at 10", () => {
        setTierState(db, "free", "none");
        expect(canAddTrigger(0).allowed).toBe(true);
        expect(canAddTrigger(9).allowed).toBe(true);
        expect(canAddTrigger(10).allowed).toBe(false);
        expect(canAddTrigger(10).reason).toContain("Trigger limit reached");
        expect(canAddTrigger(10).reason).toContain("10/10");
        expect(canAddTrigger(10).reason).toContain("Community");
      });

      it("pro tier: allows any count (unlimited)", () => {
        setTierState(db, "pro", "active");
        expect(canAddTrigger(0).allowed).toBe(true);
        expect(canAddTrigger(100).allowed).toBe(true);
        expect(canAddTrigger(999998).allowed).toBe(true);
      });

      it("denial message includes upgrade hint", () => {
        setTierState(db, "free", "none");
        const result = canAddTrigger(10);
        expect(result.reason).toContain("unlimited");
        expect(result.reason).toContain("jeriko upgrade");
      });
    });

    describe("enforceLicenseLimits", () => {
      it("no evictions when within limits (pro)", async () => {
        setTierState(db, "pro", "active");
        const connectors = new MockConnectors();
        connectors.addInstance("a");
        connectors.addInstance("b");
        connectors.addInstance("c");
        const triggers = new MockTriggers();
        triggers.addTrigger("t1", true);
        const result = await enforceLicenseLimits(connectors, triggers);
        expect(result.connectors.evicted).toHaveLength(0);
        expect(result.triggers.disabled).toHaveLength(0);
      });

      it("evicts excess connectors on downgrade (8 -> 5)", async () => {
        setTierState(db, "free", "canceled");
        const connectors = new MockConnectors();
        for (const n of ["a", "b", "c", "d", "e", "f", "g", "h"]) connectors.addInstance(n);
        const triggers = new MockTriggers();
        const result = await enforceLicenseLimits(connectors, triggers);
        expect(result.connectors.evicted).toHaveLength(3);
        expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
        expect(result.connectors.limit).toBe(TIER_LIMITS.free.connectors);
      });

      it("disables excess triggers on downgrade (15 -> 10)", async () => {
        setTierState(db, "free", "canceled");
        const connectors = new MockConnectors();
        const triggers = new MockTriggers();
        for (let i = 1; i <= 15; i++) {
          triggers.addTrigger(`t${i}`, true, new Date(Date.now() + i * 1000).toISOString());
        }
        const result = await enforceLicenseLimits(connectors, triggers);
        expect(result.triggers.disabled).toHaveLength(5);
        expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);
        expect(result.triggers.limit).toBe(TIER_LIMITS.free.triggers);
      });

      it("preserves oldest items (LIFO eviction)", async () => {
        setTierState(db, "free", "canceled");
        const connectors = new MockConnectors();
        // 7 connectors → limit 5, evict 2 newest
        for (const n of ["c1", "c2", "c3", "c4", "c5", "c6", "c7"]) connectors.addInstance(n);
        const triggers = new MockTriggers();
        // 12 triggers → limit 10, disable 2 newest
        for (let i = 1; i <= 12; i++) {
          triggers.addTrigger(`t${i}`, true, new Date(2024, 0, i).toISOString());
        }

        await enforceLicenseLimits(connectors, triggers);

        // Connectors: 2 newest evicted (c7, c6), oldest 5 survive
        expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
        expect(connectors.getActiveNames()).toContain("c1");
        expect(connectors.getActiveNames()).toContain("c5");
        expect(connectors.getActiveNames()).not.toContain("c7");
        expect(connectors.getActiveNames()).not.toContain("c6");

        // Triggers: oldest 10 survive, newest 2 disabled
        expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);
        expect(triggers.isEnabled("t1")).toBe(true);
        expect(triggers.isEnabled("t10")).toBe(true);
        expect(triggers.isEnabled("t11")).toBe(false);
        expect(triggers.isEnabled("t12")).toBe(false);
      });

      it("idempotent — second run is no-op", async () => {
        setTierState(db, "free", "canceled");
        const connectors = new MockConnectors();
        for (const n of ["a", "b", "c", "d", "e", "f", "g", "h"]) connectors.addInstance(n);
        const triggers = new MockTriggers();
        for (let i = 1; i <= 14; i++) triggers.addTrigger(`t${i}`, true);

        await enforceLicenseLimits(connectors, triggers);
        expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
        expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);

        const result2 = await enforceLicenseLimits(connectors, triggers);
        expect(result2.connectors.evicted).toHaveLength(0);
        expect(result2.triggers.disabled).toHaveLength(0);
      });

      it("combined enforcement (connectors + triggers)", async () => {
        setTierState(db, "free", "canceled");
        const connectors = new MockConnectors();
        for (const n of ["a", "b", "c", "d", "e", "f", "g", "h"]) connectors.addInstance(n);
        const triggers = new MockTriggers();
        for (let i = 1; i <= 15; i++) triggers.addTrigger(`t${i}`, true);

        const result = await enforceLicenseLimits(connectors, triggers);
        expect(result.connectors.evicted).toHaveLength(3);
        expect(result.triggers.disabled).toHaveLength(5);
        expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
        expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);
      });

      it("skips already-disabled triggers", async () => {
        setTierState(db, "free", "canceled");
        const connectors = new MockConnectors();
        const triggers = new MockTriggers();
        // 11 enabled + 1 disabled = 12 total, limit 10 → disable 1 newest
        for (let i = 1; i <= 10; i++) triggers.addTrigger(`t${i}`, true, `2024-0${Math.min(i, 9)}-01`);
        triggers.addTrigger("t-disabled", false, "2024-10-01"); // already disabled
        triggers.addTrigger("t11", true, "2024-11-01");
        // 11 enabled, limit 10 -> disable 1 newest
        const result = await enforceLicenseLimits(connectors, triggers);
        expect(result.triggers.disabled).toHaveLength(1);
        expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);
      });
    });
  });

  // =========================================================================
  // 9. Tier Transitions (Full Lifecycle)
  // =========================================================================

  describe("tier transitions", () => {
    it("free -> pro: limits expand", () => {
      setTierState(db, "free", "none");
      expect(getLicenseState().connectorLimit).toBe(TIER_LIMITS.free.connectors);
      expect(getLicenseState().triggerLimit).toBe(TIER_LIMITS.free.triggers);

      setTierState(db, "pro", "active");
      expect(getLicenseState().connectorLimit).toBe(UNLIMITED_TRIGGERS_STORED);
      expect(getLicenseState().triggerLimit).toBe(UNLIMITED_TRIGGERS_STORED);
    });

    it("pro -> free (canceled): limits shrink", () => {
      setTierState(db, "free", "canceled");
      const state = getLicenseState();
      expect(state.tier).toBe("free");
      expect(state.connectorLimit).toBe(TIER_LIMITS.free.connectors);
      expect(state.triggerLimit).toBe(TIER_LIMITS.free.triggers);
    });

    it("re-upgrade lifts gates", () => {
      setTierState(db, "free", "canceled");
      expect(canActivateConnector(TIER_LIMITS.free.connectors).allowed).toBe(false);
      expect(canAddTrigger(TIER_LIMITS.free.triggers).allowed).toBe(false);

      setTierState(db, "pro", "active");
      expect(canActivateConnector(TIER_LIMITS.free.connectors).allowed).toBe(true);
      expect(canActivateConnector(100).allowed).toBe(true);
      expect(canAddTrigger(TIER_LIMITS.free.triggers).allowed).toBe(true);
      expect(canAddTrigger(100).allowed).toBe(true);
    });

    it("full downgrade scenario: 12 connectors + 20 triggers enforced", async () => {
      setTierState(db, "pro", "active");
      const connectors = new MockConnectors();
      for (const n of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"]) connectors.addInstance(n);
      const triggers = new MockTriggers();
      const base = new Date("2025-01-01").getTime();
      for (let i = 1; i <= 20; i++) {
        triggers.addTrigger(`t${i}`, true, new Date(base + i * 86400000).toISOString());
      }

      // Downgrade
      setTierState(db, "free", "canceled");
      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.connectors.evicted).toHaveLength(12 - TIER_LIMITS.free.connectors);
      expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
      expect(result.triggers.disabled).toHaveLength(20 - TIER_LIMITS.free.triggers);
      expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);

      // Gates block new activations at limit
      expect(canActivateConnector(TIER_LIMITS.free.connectors).allowed).toBe(false);
      expect(canAddTrigger(TIER_LIMITS.free.triggers).allowed).toBe(false);
    });
  });

  // =========================================================================
  // 10. Config Loading
  // =========================================================================

  describe("config loading", () => {
    let envBackup: Record<string, string | undefined>;

    beforeEach(() => {
      envBackup = {};
      for (const val of Object.values(BILLING_ENV)) {
        envBackup[val] = process.env[val];
        delete process.env[val];
      }
    });

    afterEach(() => {
      for (const [key, val] of Object.entries(envBackup)) {
        if (val !== undefined) process.env[key] = val;
        else delete process.env[key];
      }
    });

    it("returns null when secret key is not set", () => {
      expect(loadBillingConfig()).toBeNull();
    });

    it("returns config when secret key is set", () => {
      process.env[BILLING_ENV.secretKey] = "sk_test";
      process.env[BILLING_ENV.webhookSecret] = "whsec_test";
      process.env[BILLING_ENV.priceId] = "price_test";
      const config = loadBillingConfig();
      expect(config).not.toBeNull();
      expect(config!.stripeSecretKey).toBe("sk_test");
      expect(config!.stripeWebhookSecret).toBe("whsec_test");
      expect(config!.stripePriceId).toBe("price_test");
      expect(config!.termsUrl).toContain("jeriko.ai");
      expect(config!.privacyUrl).toContain("jeriko.ai");
    });

    it("handles missing optional fields gracefully", () => {
      process.env[BILLING_ENV.secretKey] = "sk_test";
      const config = loadBillingConfig();
      expect(config!.stripeWebhookSecret).toBe("");
      expect(config!.stripePriceId).toBe("");
      expect(config!.stripePortalConfigId).toBeUndefined();
    });

    it("BILLING_ENV keys use STRIPE_BILLING_ prefix (no collision)", () => {
      for (const val of Object.values(BILLING_ENV)) {
        expect(val).toContain("BILLING");
      }
    });
  });

  // =========================================================================
  // 11. Database Schema Validation
  // =========================================================================

  describe("database schema", () => {
    it("billing_subscription table exists with correct columns", () => {
      const info = db.query<{ name: string }, []>(
        "PRAGMA table_info(billing_subscription)"
      ).all();
      const cols = info.map((r) => r.name);
      expect(cols).toContain("id");
      expect(cols).toContain("customer_id");
      expect(cols).toContain("email");
      expect(cols).toContain("tier");
      expect(cols).toContain("status");
      expect(cols).toContain("current_period_start");
      expect(cols).toContain("current_period_end");
      expect(cols).toContain("cancel_at_period_end");
      expect(cols).toContain("terms_accepted_at");
      expect(cols).toContain("created_at");
      expect(cols).toContain("updated_at");
    });

    it("billing_event table exists with indexes", () => {
      const indexes = db.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='billing_event'"
      ).all().map((r) => r.name);
      expect(indexes).toContain("idx_billing_event_type");
      expect(indexes).toContain("idx_billing_event_sub");
    });

    it("billing_license table uses singleton key pattern", () => {
      const info = db.query<{ name: string; dflt_value: string | null }, []>(
        "PRAGMA table_info(billing_license)"
      ).all();
      const keyCol = info.find((r) => r.name === "key");
      expect(keyCol).toBeTruthy();
      // Default value should be 'current'
      expect(keyCol!.dflt_value).toBe("'current'");
    });

    it("billing_consent table exists", () => {
      const tables = db.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='billing_consent'"
      ).all();
      expect(tables).toHaveLength(1);
    });
  });
});
