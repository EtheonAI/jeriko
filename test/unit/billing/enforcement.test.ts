// Enforcement tests — license downgrade enforcement on connectors and triggers.
//
// Tests the full lifecycle:
//   - User upgrades → gets Pro limits
//   - User downgrades → excess connectors evicted, excess triggers disabled
//   - Grace period → enforcement deferred during grace
//   - Re-upgrade → gating lifted, items can be re-enabled
//   - Enforcement only runs when billing is configured (STRIPE_BILLING_SECRET_KEY)

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase } from "../../../src/daemon/storage/db.js";
import {
  getLicense,
  updateLicense,
  upsertSubscription,
  getSubscription,
} from "../../../src/daemon/billing/store.js";
import {
  getLicenseState,
  canActivateConnector,
  canAddTrigger,
  enforceLicenseLimits,
  effectiveTier,
} from "../../../src/daemon/billing/license.js";
import { TIER_LIMITS, UNLIMITED_TRIGGERS_STORED } from "../../../src/daemon/billing/config.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import type { Database } from "bun:sqlite";

const TEST_DB = join(tmpdir(), `jeriko-enforcement-test-${Date.now()}.db`);

// ---------------------------------------------------------------------------
// Mock ConnectorManager and TriggerEngine for enforcement tests
// ---------------------------------------------------------------------------

class MockConnectorManager {
  private instances = new Map<string, { name: string; shutdownCalled: boolean }>();

  addInstance(name: string): void {
    this.instances.set(name, { name, shutdownCalled: false });
  }

  get activeCount(): number {
    return this.instances.size;
  }

  async enforceLimits(max: number): Promise<string[]> {
    const entries = [...this.instances.entries()].reverse();
    const evicted: string[] = [];
    const excess = this.instances.size - max;

    if (excess <= 0) return [];

    for (const [name, instance] of entries) {
      if (evicted.length >= excess) break;
      instance.shutdownCalled = true;
      this.instances.delete(name);
      evicted.push(name);
    }

    return evicted;
  }

  wasShutdown(name: string): boolean {
    // If it was evicted, it's no longer in the map — check if it existed
    return !this.instances.has(name);
  }

  getActiveNames(): string[] {
    return [...this.instances.keys()];
  }
}

class MockTriggerEngine {
  private triggers = new Map<string, { id: string; enabled: boolean; created_at: string }>();

  addTrigger(id: string, enabled: boolean, created_at?: string): void {
    this.triggers.set(id, {
      id,
      enabled,
      created_at: created_at ?? new Date().toISOString(),
    });
  }

  get enabledCount(): number {
    return [...this.triggers.values()].filter((t) => t.enabled).length;
  }

  enforceLimits(max: number): string[] {
    const enabled = [...this.triggers.values()]
      .filter((t) => t.enabled)
      .sort((a, b) => {
        // Sort ascending (oldest first) so slice(max) yields newest as excess
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return aTime - bTime;
      });

    if (enabled.length <= max) return [];

    const excess = enabled.slice(max);
    const disabled: string[] = [];

    for (const trigger of excess) {
      trigger.enabled = false;
      this.triggers.set(trigger.id, trigger);
      disabled.push(trigger.id);
    }

    return disabled;
  }

  isEnabled(id: string): boolean {
    return this.triggers.get(id)?.enabled ?? false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("billing/enforcement", () => {
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
    // Clean billing tables
    db.prepare("DELETE FROM billing_subscription").run();
    db.prepare("DELETE FROM billing_license").run();
  });

  // ── Helper: set up subscription + license in sync ────────────

  /**
   * Set the license + subscription to a specific tier and status.
   * Uses a stable subscription ID so upserts overwrite correctly.
   */
  function setTier(tier: "free" | "pro", status: string = tier === "pro" ? "active" : "none"): void {
    const limits = TIER_LIMITS[tier];

    // Clean existing subscriptions to avoid stale ordering issues
    db.prepare("DELETE FROM billing_subscription").run();

    if (status !== "none") {
      upsertSubscription({
        id: "sub_enforcement_test",
        customer_id: "cus_test",
        email: "test@test.com",
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
      connector_limit: limits.connectors === Infinity ? UNLIMITED_TRIGGERS_STORED : limits.connectors,
      trigger_limit: limits.triggers === Infinity ? UNLIMITED_TRIGGERS_STORED : limits.triggers,
    });
  }

  // ── Connector enforcement ────────────────────────────────────

  describe("connector enforcement", () => {
    it("does nothing when within limits", async () => {
      setTier("pro");

      const connectors = new MockConnectorManager();
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      connectors.addInstance("vercel");

      const triggers = new MockTriggerEngine();
      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.connectors.evicted).toHaveLength(0);
      expect(connectors.activeCount).toBe(3);
    });

    it("evicts excess connectors on downgrade to free", async () => {
      // Simulate: user had Pro (unlimited connectors), now free (5)
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      connectors.addInstance("vercel");
      connectors.addInstance("paypal");
      connectors.addInstance("twilio");
      connectors.addInstance("gmail");
      connectors.addInstance("gdrive");
      connectors.addInstance("outlook");

      const triggers = new MockTriggerEngine();
      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.connectors.evicted).toHaveLength(3);
      expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
      expect(result.connectors.limit).toBe(TIER_LIMITS.free.connectors);
    });

    it("evicts newest connectors first (LIFO)", async () => {
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      // Add in order — github is oldest, outlook is newest
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      connectors.addInstance("vercel");
      connectors.addInstance("paypal");
      connectors.addInstance("twilio");
      connectors.addInstance("gmail");
      connectors.addInstance("gdrive");
      connectors.addInstance("outlook");

      const triggers = new MockTriggerEngine();
      const result = await enforceLicenseLimits(connectors, triggers);

      // 8 connectors, limit 5 → evict 3 newest: outlook, gdrive, gmail
      expect(result.connectors.evicted).toContain("outlook");
      expect(result.connectors.evicted).toContain("gdrive");
      expect(result.connectors.evicted).toContain("gmail");
      expect(result.connectors.evicted).toHaveLength(3);

      // Oldest 5 should survive
      const surviving = connectors.getActiveNames();
      expect(surviving).toContain("github");
      expect(surviving).toContain("stripe");
      expect(surviving).toContain("vercel");
      expect(surviving).toContain("paypal");
      expect(surviving).toContain("twilio");
    });

    it("handles exact limit (no evictions needed)", async () => {
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      connectors.addInstance("vercel");
      connectors.addInstance("paypal");
      connectors.addInstance("twilio");
      // Free tier limit is 5 — at exact limit, no evictions

      const triggers = new MockTriggerEngine();
      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.connectors.evicted).toHaveLength(0);
      expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
    });

    it("handles zero active connectors", async () => {
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      const triggers = new MockTriggerEngine();
      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.connectors.evicted).toHaveLength(0);
      expect(connectors.activeCount).toBe(0);
    });
  });

  // ── Trigger enforcement ──────────────────────────────────────

  describe("trigger enforcement", () => {
    it("does nothing when within limits", async () => {
      setTier("pro");

      const connectors = new MockConnectorManager();
      const triggers = new MockTriggerEngine();
      triggers.addTrigger("t1", true);
      triggers.addTrigger("t2", true);
      triggers.addTrigger("t3", true);

      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.triggers.disabled).toHaveLength(0);
      expect(triggers.enabledCount).toBe(3);
    });

    it("disables excess triggers on downgrade to free", async () => {
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      const triggers = new MockTriggerEngine();

      // 15 enabled triggers — free tier allows 10
      for (let i = 1; i <= 15; i++) {
        triggers.addTrigger(`t${i}`, true, new Date(Date.now() + i * 1000).toISOString());
      }

      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.triggers.disabled).toHaveLength(5);
      expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);
      expect(result.triggers.limit).toBe(TIER_LIMITS.free.triggers);
    });

    it("disables newest triggers first", async () => {
      setTier("free", "canceled");
      // Free tier trigger limit = 10

      const connectors = new MockConnectorManager();
      const triggers = new MockTriggerEngine();

      // Add 13 triggers with explicit timestamps — oldest first
      for (let i = 1; i <= 10; i++) {
        triggers.addTrigger(`old-${i}`, true, `2024-${String(i).padStart(2, "0")}-01T00:00:00Z`);
      }
      triggers.addTrigger("new-1", true, "2025-06-01T00:00:00Z");
      triggers.addTrigger("new-2", true, "2025-09-01T00:00:00Z");
      triggers.addTrigger("new-3", true, "2025-12-01T00:00:00Z");

      const result = await enforceLicenseLimits(connectors, triggers);

      // 13 enabled, limit 10 → disable 3 newest
      expect(result.triggers.disabled).toContain("new-3");
      expect(result.triggers.disabled).toContain("new-2");
      expect(result.triggers.disabled).toContain("new-1");
      expect(result.triggers.disabled).toHaveLength(3);

      // Oldest 10 survive
      for (let i = 1; i <= 10; i++) {
        expect(triggers.isEnabled(`old-${i}`)).toBe(true);
      }
      expect(triggers.isEnabled("new-1")).toBe(false);
      expect(triggers.isEnabled("new-2")).toBe(false);
      expect(triggers.isEnabled("new-3")).toBe(false);
    });

    it("skips already-disabled triggers", async () => {
      setTier("free", "canceled");
      // Free tier trigger limit = 10

      const connectors = new MockConnectorManager();
      const triggers = new MockTriggerEngine();

      // Add 10 enabled + 1 disabled + 2 more enabled = 12 enabled total
      for (let i = 1; i <= 10; i++) {
        triggers.addTrigger(`t${i}`, true, `2024-${String(i).padStart(2, "0")}-01T00:00:00Z`);
      }
      triggers.addTrigger("t-disabled", false, "2024-11-01T00:00:00Z"); // Already disabled — not counted
      triggers.addTrigger("t11", true, "2024-12-01T00:00:00Z");
      triggers.addTrigger("t12", true, "2025-01-01T00:00:00Z");

      // 12 enabled, limit 10 → should disable 2 (newest enabled)
      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.triggers.disabled).toHaveLength(2);
      expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);
      // t-disabled stays disabled (was already), t12 and t11 get disabled (newest)
      expect(triggers.isEnabled("t12")).toBe(false);
      expect(triggers.isEnabled("t11")).toBe(false);
      expect(triggers.isEnabled("t-disabled")).toBe(false);
    });

    it("handles zero enabled triggers", async () => {
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      const triggers = new MockTriggerEngine();
      triggers.addTrigger("t1", false);
      triggers.addTrigger("t2", false);

      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.triggers.disabled).toHaveLength(0);
    });
  });

  // ── Combined enforcement ─────────────────────────────────────

  describe("combined enforcement", () => {
    it("enforces both connectors and triggers simultaneously", async () => {
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      // 8 connectors, free limit = 5 → evict 3
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      connectors.addInstance("vercel");
      connectors.addInstance("paypal");
      connectors.addInstance("twilio");
      connectors.addInstance("gmail");
      connectors.addInstance("gdrive");
      connectors.addInstance("outlook");

      const triggers = new MockTriggerEngine();
      // 14 triggers, free limit = 10 → disable 4
      for (let i = 1; i <= 14; i++) {
        triggers.addTrigger(`t${i}`, true);
      }

      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.connectors.evicted).toHaveLength(3);
      expect(result.triggers.disabled).toHaveLength(4);
      expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
      expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);
    });

    it("Pro tier does not enforce (unlimited triggers)", async () => {
      setTier("pro");

      const connectors = new MockConnectorManager();
      for (let i = 0; i < 8; i++) {
        connectors.addInstance(`connector-${i}`);
      }

      const triggers = new MockTriggerEngine();
      for (let i = 0; i < 50; i++) {
        triggers.addTrigger(`t${i}`, true);
      }

      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.connectors.evicted).toHaveLength(0);
      expect(result.triggers.disabled).toHaveLength(0);
    });
  });

  // ── Gate checks after enforcement ────────────────────────────

  describe("gating after downgrade", () => {
    it("canActivateConnector blocks new connectors after downgrade", () => {
      setTier("free", "canceled");

      // At the limit (free = 5 connectors)
      const result = canActivateConnector(TIER_LIMITS.free.connectors);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Connector limit reached");
      expect(result.reason).toContain(`${TIER_LIMITS.free.connectors}/${TIER_LIMITS.free.connectors}`);
    });

    it("canActivateConnector allows when under limit", () => {
      setTier("free", "canceled");

      const result = canActivateConnector(TIER_LIMITS.free.connectors - 1);
      expect(result.allowed).toBe(true);
    });

    it("canAddTrigger blocks new triggers after downgrade", () => {
      setTier("free", "canceled");

      // Free = 10 triggers
      const result = canAddTrigger(TIER_LIMITS.free.triggers);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Trigger limit reached");
      expect(result.reason).toContain(`${TIER_LIMITS.free.triggers}/${TIER_LIMITS.free.triggers}`);
    });

    it("canAddTrigger allows when under limit", () => {
      setTier("free", "canceled");

      const result = canAddTrigger(TIER_LIMITS.free.triggers - 1);
      expect(result.allowed).toBe(true);
    });

    it("Pro tier allows unlimited connectors", () => {
      setTier("pro");

      expect(canActivateConnector(9).allowed).toBe(true);
      expect(canActivateConnector(100).allowed).toBe(true);
      expect(canActivateConnector(999998).allowed).toBe(true);
    });

    it("Pro tier allows unlimited triggers", () => {
      setTier("pro");

      // Stored as 999999, effective limit = 999999
      expect(canAddTrigger(100).allowed).toBe(true);
      expect(canAddTrigger(999998).allowed).toBe(true);
    });
  });

  // ── Tier transitions ─────────────────────────────────────────

  describe("tier transitions", () => {
    it("free → pro: limits expand", () => {
      setTier("free", "canceled");

      let state = getLicenseState();
      expect(state.connectorLimit).toBe(TIER_LIMITS.free.connectors);
      expect(state.triggerLimit).toBe(TIER_LIMITS.free.triggers);

      // Upgrade
      setTier("pro");

      state = getLicenseState();
      expect(state.tier).toBe("pro");
      // Stored as UNLIMITED_TRIGGERS_STORED since Infinity can't go in SQLite
      expect(state.connectorLimit).toBe(UNLIMITED_TRIGGERS_STORED);
      expect(state.triggerLimit).toBe(UNLIMITED_TRIGGERS_STORED);
    });

    it("pro → free (canceled): limits shrink", () => {
      setTier("free", "canceled");

      const state = getLicenseState();
      expect(state.tier).toBe("free");
      expect(state.connectorLimit).toBe(TIER_LIMITS.free.connectors);
      expect(state.triggerLimit).toBe(TIER_LIMITS.free.triggers);
    });

    it("pro → past_due: keeps tier during grace", () => {
      upsertSubscription({
        id: "sub_pastdue",
        customer_id: "cus_1",
        email: "test@test.com",
        tier: "pro",
        status: "past_due",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        terms_accepted_at: null,
      });
      updateLicense({
        tier: "pro",
        connector_limit: UNLIMITED_TRIGGERS_STORED,
        trigger_limit: UNLIMITED_TRIGGERS_STORED,
        valid_until: Math.floor(Date.now() / 1000) + 86400, // 1 day
      });

      const state = getLicenseState();
      expect(state.tier).toBe("pro");
      expect(state.pastDue).toBe(true);
      expect(state.gracePeriod).toBe(true);
      expect(state.connectorLimit).toBe(UNLIMITED_TRIGGERS_STORED);
    });

    it("effectiveTier: active → subscribed tier", () => {
      expect(effectiveTier("active", "pro")).toBe("pro");
      expect(effectiveTier("active", "team")).toBe("team");
      expect(effectiveTier("active", "free")).toBe("free");
    });

    it("effectiveTier: trialing → subscribed tier", () => {
      expect(effectiveTier("trialing", "pro")).toBe("pro");
    });

    it("effectiveTier: past_due → keeps current tier", () => {
      expect(effectiveTier("past_due", "pro")).toBe("pro");
    });

    it("effectiveTier: canceled → free", () => {
      expect(effectiveTier("canceled", "pro")).toBe("free");
    });

    it("effectiveTier: unpaid → free", () => {
      expect(effectiveTier("unpaid", "pro")).toBe("free");
    });

    it("effectiveTier: paused → free", () => {
      expect(effectiveTier("paused", "pro")).toBe("free");
    });

    it("effectiveTier: none → free", () => {
      expect(effectiveTier("none", "pro")).toBe("free");
    });

    it("effectiveTier: invalid tier string → free", () => {
      expect(effectiveTier("active", "invalid_tier")).toBe("free");
    });
  });

  // ── Full downgrade scenario ──────────────────────────────────

  describe("full downgrade scenario", () => {
    it("user with 8 connectors + 15 triggers downgrades: enforcement preserves oldest", async () => {
      // Setup: Pro tier with lots of connectors and triggers
      setTier("pro");

      const connectors = new MockConnectorManager();
      const connectorNames = ["github", "stripe", "vercel", "paypal", "twilio", "gmail", "gdrive", "outlook"];
      for (const name of connectorNames) {
        connectors.addInstance(name);
      }

      const triggers = new MockTriggerEngine();
      const baseTime = new Date("2025-01-01T00:00:00Z").getTime();
      for (let i = 1; i <= 15; i++) {
        triggers.addTrigger(`trigger-${i}`, true, new Date(baseTime + i * 86400000).toISOString());
      }

      // Verify Pro state
      expect(connectors.activeCount).toBe(8);
      expect(triggers.enabledCount).toBe(15);

      // Downgrade to free
      setTier("free", "canceled");

      // Enforce
      const result = await enforceLicenseLimits(connectors, triggers);

      // Connectors: 8 → 5 (evict 3 newest)
      expect(result.connectors.evicted).toHaveLength(3);
      expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
      expect(connectors.getActiveNames()).toContain("github");
      expect(connectors.getActiveNames()).toContain("stripe");
      expect(connectors.getActiveNames()).toContain("vercel");
      expect(connectors.getActiveNames()).toContain("paypal");
      expect(connectors.getActiveNames()).toContain("twilio");

      // Triggers: 15 → 10 (disable 5 newest)
      expect(result.triggers.disabled).toHaveLength(5);
      expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);
      // Oldest triggers survive
      for (let i = 1; i <= 10; i++) {
        expect(triggers.isEnabled(`trigger-${i}`)).toBe(true);
      }
      // Newest triggers disabled
      expect(triggers.isEnabled("trigger-15")).toBe(false);
      expect(triggers.isEnabled("trigger-14")).toBe(false);

      // Verify gates block new activations
      expect(canActivateConnector(TIER_LIMITS.free.connectors).allowed).toBe(false);
      expect(canAddTrigger(TIER_LIMITS.free.triggers).allowed).toBe(false);
    });

    it("re-upgrade lifts gates", async () => {
      // Start as free
      setTier("free", "canceled");

      expect(canActivateConnector(TIER_LIMITS.free.connectors).allowed).toBe(false);
      expect(canAddTrigger(TIER_LIMITS.free.triggers).allowed).toBe(false);

      // Re-upgrade to Pro
      setTier("pro");

      expect(canActivateConnector(TIER_LIMITS.free.connectors).allowed).toBe(true);
      expect(canActivateConnector(100).allowed).toBe(true);
      expect(canAddTrigger(TIER_LIMITS.free.triggers).allowed).toBe(true);
      expect(canAddTrigger(100).allowed).toBe(true);
    });

    it("enforcement is idempotent — running twice does not over-evict", async () => {
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      // 8 connectors > free limit of 5
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      connectors.addInstance("vercel");
      connectors.addInstance("paypal");
      connectors.addInstance("twilio");
      connectors.addInstance("gmail");
      connectors.addInstance("gdrive");
      connectors.addInstance("outlook");

      const triggers = new MockTriggerEngine();
      // 14 triggers > free limit of 10
      for (let i = 1; i <= 14; i++) {
        triggers.addTrigger(`t${i}`, true);
      }

      // First enforcement
      await enforceLicenseLimits(connectors, triggers);
      expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
      expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);

      // Second enforcement — should be a no-op
      const result = await enforceLicenseLimits(connectors, triggers);
      expect(result.connectors.evicted).toHaveLength(0);
      expect(result.triggers.disabled).toHaveLength(0);
      expect(connectors.activeCount).toBe(TIER_LIMITS.free.connectors);
      expect(triggers.enabledCount).toBe(TIER_LIMITS.free.triggers);
    });
  });

  // ── canActivateConnector default count (configured connectors) ──

  describe("canActivateConnector with configured count", () => {
    // Save and clear ALL connector env vars for isolation
    const { CONNECTOR_DEFS } = require("../../../src/shared/connector.js") as typeof import("../../../src/shared/connector.js");
    const allConnectorVars = CONNECTOR_DEFS.flatMap((d) => [
      ...d.required.flatMap((e: string | string[]) => (Array.isArray(e) ? e : [e])),
      ...d.optional,
    ]);
    const savedConnectorEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      for (const v of allConnectorVars) {
        savedConnectorEnv[v] = process.env[v];
        delete process.env[v];
      }
    });

    afterEach(() => {
      for (const [key, val] of Object.entries(savedConnectorEnv)) {
        if (val === undefined) delete process.env[key];
        else process.env[key] = val;
      }
    });

    it("uses getConfiguredConnectorCount when no currentCount provided", () => {
      setTier("free", "canceled");

      // All connector env vars cleared → configured count is 0 → under limit (5)
      const result = canActivateConnector();
      expect(result.allowed).toBe(true);
    });

    it("explicit currentCount overrides configured count", () => {
      setTier("free", "canceled");

      // Explicitly pass 7 — should be over the free limit of 5
      const result = canActivateConnector(7);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(`7/${TIER_LIMITS.free.connectors}`);
    });

    it("explicit currentCount of 0 always allows", () => {
      setTier("free", "canceled");

      const result = canActivateConnector(0);
      expect(result.allowed).toBe(true);
    });

    it("with env vars set, configured count reflects reality", () => {
      setTier("free", "canceled");

      // Set 6 connectors (> free limit of 5)
      process.env.STRIPE_SECRET_KEY = "sk_test_fake";           // stripe
      process.env.PAYPAL_CLIENT_ID = "fake_id";                 // paypal (requires both)
      process.env.PAYPAL_CLIENT_SECRET = "fake_secret";
      process.env.GITHUB_TOKEN = "ghp_fake";                    // github
      process.env.TWILIO_ACCOUNT_SID = "AC_fake";               // twilio (requires both)
      process.env.TWILIO_AUTH_TOKEN = "fake_auth";
      process.env.VERCEL_TOKEN = "fake_vercel";                 // vercel
      process.env.GMAIL_ACCESS_TOKEN = "fake_gmail";            // gmail

      // 6 configured > free limit of 5 → blocked
      const result = canActivateConnector();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(`/${TIER_LIMITS.free.connectors}`);
    });

    it("Pro tier allows unlimited configured connectors", () => {
      setTier("pro");

      // Set several connectors
      process.env.STRIPE_SECRET_KEY = "sk_test_fake";
      process.env.PAYPAL_CLIENT_ID = "fake_id";
      process.env.PAYPAL_CLIENT_SECRET = "fake_secret";
      process.env.GITHUB_TOKEN = "ghp_fake";
      process.env.TWILIO_ACCOUNT_SID = "AC_fake";
      process.env.TWILIO_AUTH_TOKEN = "fake_auth";

      // Pro tier is unlimited → always allowed
      const result = canActivateConnector();
      expect(result.allowed).toBe(true);
    });
  });

  // ── TIER_LIMITS consistency ──────────────────────────────────

  describe("TIER_LIMITS consistency", () => {
    it("free tier has correct limits", () => {
      expect(TIER_LIMITS.free.connectors).toBe(5);
      expect(TIER_LIMITS.free.triggers).toBe(10);
      expect(TIER_LIMITS.free.label).toBe("Community");
    });

    it("pro tier has correct limits", () => {
      expect(TIER_LIMITS.pro.connectors).toBe(Infinity);
      expect(TIER_LIMITS.pro.triggers).toBe(Infinity);
      expect(TIER_LIMITS.pro.label).toBe("Pro");
    });

    it("all tiers have required fields", () => {
      for (const [tier, limits] of Object.entries(TIER_LIMITS)) {
        expect(typeof limits.connectors).toBe("number");
        expect(typeof limits.triggers).toBe("number");
        expect(typeof limits.label).toBe("string");
        expect(limits.connectors).toBeGreaterThanOrEqual(0);
        expect(limits.triggers).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
