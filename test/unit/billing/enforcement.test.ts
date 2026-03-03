// Enforcement tests — license downgrade enforcement on connectors and triggers.
//
// Tests the full lifecycle:
//   - User upgrades → gets Pro limits
//   - User downgrades → excess connectors evicted, excess triggers disabled
//   - Grace period → enforcement deferred during grace
//   - Re-upgrade → gating lifted, items can be re-enabled
//   - Enforcement only runs when billing is configured (STRIPE_BILLING_SECRET_KEY)

import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";
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
import { TIER_LIMITS } from "../../../src/daemon/billing/config.js";
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
      connector_limit: limits.connectors,
      trigger_limit: limits.triggers === Infinity ? 999999 : limits.triggers,
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
      // Simulate: user had Pro (10 connectors), now free (2)
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      connectors.addInstance("vercel");
      connectors.addInstance("paypal");
      connectors.addInstance("twilio");

      const triggers = new MockTriggerEngine();
      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.connectors.evicted).toHaveLength(3);
      expect(connectors.activeCount).toBe(2);
      expect(result.connectors.limit).toBe(2);
    });

    it("evicts newest connectors first (LIFO)", async () => {
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      // Add in order — github is oldest, twilio is newest
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      connectors.addInstance("vercel");
      connectors.addInstance("paypal");
      connectors.addInstance("twilio");

      const triggers = new MockTriggerEngine();
      const result = await enforceLicenseLimits(connectors, triggers);

      // Newest should be evicted: twilio, paypal, vercel
      expect(result.connectors.evicted).toContain("twilio");
      expect(result.connectors.evicted).toContain("paypal");
      expect(result.connectors.evicted).toContain("vercel");

      // Oldest should survive: github, stripe
      const surviving = connectors.getActiveNames();
      expect(surviving).toContain("github");
      expect(surviving).toContain("stripe");
    });

    it("handles exact limit (no evictions needed)", async () => {
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      // Free tier limit is 2 — at exact limit, no evictions

      const triggers = new MockTriggerEngine();
      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.connectors.evicted).toHaveLength(0);
      expect(connectors.activeCount).toBe(2);
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

      // 7 enabled triggers — free tier allows 3
      for (let i = 1; i <= 7; i++) {
        triggers.addTrigger(`t${i}`, true, new Date(Date.now() + i * 1000).toISOString());
      }

      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.triggers.disabled).toHaveLength(4);
      expect(triggers.enabledCount).toBe(3);
      expect(result.triggers.limit).toBe(3);
    });

    it("disables newest triggers first", async () => {
      setTier("free", "canceled");
      // Free tier trigger limit = 3

      const connectors = new MockConnectorManager();
      const triggers = new MockTriggerEngine();

      // Add 5 triggers with explicit timestamps — oldest first
      triggers.addTrigger("old-1", true, "2024-01-01T00:00:00Z");
      triggers.addTrigger("old-2", true, "2024-02-01T00:00:00Z");
      triggers.addTrigger("old-3", true, "2024-03-01T00:00:00Z");
      triggers.addTrigger("new-1", true, "2025-06-01T00:00:00Z");
      triggers.addTrigger("new-2", true, "2025-12-01T00:00:00Z");

      const result = await enforceLicenseLimits(connectors, triggers);

      // 5 enabled, limit 3 → disable 2 newest
      expect(result.triggers.disabled).toContain("new-2");
      expect(result.triggers.disabled).toContain("new-1");
      expect(result.triggers.disabled).toHaveLength(2);

      // Oldest 3 survive
      expect(triggers.isEnabled("old-1")).toBe(true);
      expect(triggers.isEnabled("old-2")).toBe(true);
      expect(triggers.isEnabled("old-3")).toBe(true);
      expect(triggers.isEnabled("new-1")).toBe(false);
      expect(triggers.isEnabled("new-2")).toBe(false);
    });

    it("skips already-disabled triggers", async () => {
      setTier("free", "canceled");
      // Free tier trigger limit = 3

      const connectors = new MockConnectorManager();
      const triggers = new MockTriggerEngine();

      triggers.addTrigger("t1", true, "2024-01-01T00:00:00Z");
      triggers.addTrigger("t2", true, "2024-02-01T00:00:00Z");
      triggers.addTrigger("t3", false, "2024-03-01T00:00:00Z"); // Already disabled — not counted
      triggers.addTrigger("t4", true, "2024-04-01T00:00:00Z");
      triggers.addTrigger("t5", true, "2024-05-01T00:00:00Z");

      // 4 enabled, limit 3 → should disable 1 (newest enabled)
      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.triggers.disabled).toHaveLength(1);
      expect(triggers.enabledCount).toBe(3);
      // t3 stays disabled (was already), t5 gets disabled (newest)
      expect(triggers.isEnabled("t5")).toBe(false);
      expect(triggers.isEnabled("t3")).toBe(false);
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
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      connectors.addInstance("vercel");
      connectors.addInstance("paypal");

      const triggers = new MockTriggerEngine();
      for (let i = 1; i <= 6; i++) {
        triggers.addTrigger(`t${i}`, true);
      }

      const result = await enforceLicenseLimits(connectors, triggers);

      expect(result.connectors.evicted).toHaveLength(2);
      expect(result.triggers.disabled).toHaveLength(3);
      expect(connectors.activeCount).toBe(2);
      expect(triggers.enabledCount).toBe(3);
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

      // At the limit (free = 2 connectors)
      const result = canActivateConnector(2);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Connector limit reached");
      expect(result.reason).toContain("2/2");
    });

    it("canActivateConnector allows when under limit", () => {
      setTier("free", "canceled");

      const result = canActivateConnector(1);
      expect(result.allowed).toBe(true);
    });

    it("canAddTrigger blocks new triggers after downgrade", () => {
      setTier("free", "canceled");

      // Free = 3 triggers
      const result = canAddTrigger(3);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Trigger limit reached");
      expect(result.reason).toContain("3/3");
    });

    it("canAddTrigger allows when under limit", () => {
      setTier("free", "canceled");

      const result = canAddTrigger(2);
      expect(result.allowed).toBe(true);
    });

    it("Pro tier allows up to 10 connectors", () => {
      setTier("pro");

      expect(canActivateConnector(9).allowed).toBe(true);
      expect(canActivateConnector(10).allowed).toBe(false);
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
      expect(state.connectorLimit).toBe(2);
      expect(state.triggerLimit).toBe(3);

      // Upgrade
      setTier("pro");

      state = getLicenseState();
      expect(state.tier).toBe("pro");
      expect(state.connectorLimit).toBe(10);
      // Stored as 999999, TIER_LIMITS.pro.triggers = Infinity → stored value used
      expect(state.triggerLimit).toBe(999999);
    });

    it("pro → free (canceled): limits shrink", () => {
      setTier("free", "canceled");

      const state = getLicenseState();
      expect(state.tier).toBe("free");
      expect(state.connectorLimit).toBe(2);
      expect(state.triggerLimit).toBe(3);
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
        connector_limit: 10,
        trigger_limit: 999999,
        valid_until: Math.floor(Date.now() / 1000) + 86400, // 1 day
      });

      const state = getLicenseState();
      expect(state.tier).toBe("pro");
      expect(state.pastDue).toBe(true);
      expect(state.gracePeriod).toBe(true);
      expect(state.connectorLimit).toBe(10);
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
    it("user with 8 connectors + 10 triggers downgrades: enforcement preserves oldest", async () => {
      // Setup: Pro tier with lots of connectors and triggers
      setTier("pro");

      const connectors = new MockConnectorManager();
      const connectorNames = ["github", "stripe", "vercel", "paypal", "twilio", "gmail", "gdrive", "outlook"];
      for (const name of connectorNames) {
        connectors.addInstance(name);
      }

      const triggers = new MockTriggerEngine();
      const baseTime = new Date("2025-01-01T00:00:00Z").getTime();
      for (let i = 1; i <= 10; i++) {
        triggers.addTrigger(`trigger-${i}`, true, new Date(baseTime + i * 86400000).toISOString());
      }

      // Verify Pro state
      expect(connectors.activeCount).toBe(8);
      expect(triggers.enabledCount).toBe(10);

      // Downgrade to free
      setTier("free", "canceled");

      // Enforce
      const result = await enforceLicenseLimits(connectors, triggers);

      // Connectors: 8 → 2 (evict 6 newest)
      expect(result.connectors.evicted).toHaveLength(6);
      expect(connectors.activeCount).toBe(2);
      expect(connectors.getActiveNames()).toContain("github");
      expect(connectors.getActiveNames()).toContain("stripe");

      // Triggers: 10 → 3 (disable 7 newest)
      expect(result.triggers.disabled).toHaveLength(7);
      expect(triggers.enabledCount).toBe(3);
      // Oldest triggers survive
      expect(triggers.isEnabled("trigger-1")).toBe(true);
      expect(triggers.isEnabled("trigger-2")).toBe(true);
      expect(triggers.isEnabled("trigger-3")).toBe(true);
      // Newest triggers disabled
      expect(triggers.isEnabled("trigger-10")).toBe(false);
      expect(triggers.isEnabled("trigger-9")).toBe(false);

      // Verify gates block new activations
      expect(canActivateConnector(2).allowed).toBe(false);
      expect(canAddTrigger(3).allowed).toBe(false);
    });

    it("re-upgrade lifts gates", async () => {
      // Start as free
      setTier("free", "canceled");

      expect(canActivateConnector(2).allowed).toBe(false);
      expect(canAddTrigger(3).allowed).toBe(false);

      // Re-upgrade to Pro
      setTier("pro");

      expect(canActivateConnector(2).allowed).toBe(true);
      expect(canActivateConnector(9).allowed).toBe(true);
      expect(canAddTrigger(3).allowed).toBe(true);
      expect(canAddTrigger(100).allowed).toBe(true);
    });

    it("enforcement is idempotent — running twice does not over-evict", async () => {
      setTier("free", "canceled");

      const connectors = new MockConnectorManager();
      connectors.addInstance("github");
      connectors.addInstance("stripe");
      connectors.addInstance("vercel");
      connectors.addInstance("paypal");

      const triggers = new MockTriggerEngine();
      for (let i = 1; i <= 5; i++) {
        triggers.addTrigger(`t${i}`, true);
      }

      // First enforcement
      await enforceLicenseLimits(connectors, triggers);
      expect(connectors.activeCount).toBe(2);
      expect(triggers.enabledCount).toBe(3);

      // Second enforcement — should be a no-op
      const result = await enforceLicenseLimits(connectors, triggers);
      expect(result.connectors.evicted).toHaveLength(0);
      expect(result.triggers.disabled).toHaveLength(0);
      expect(connectors.activeCount).toBe(2);
      expect(triggers.enabledCount).toBe(3);
    });
  });

  // ── TIER_LIMITS consistency ──────────────────────────────────

  describe("TIER_LIMITS consistency", () => {
    it("free tier has correct limits", () => {
      expect(TIER_LIMITS.free.connectors).toBe(2);
      expect(TIER_LIMITS.free.triggers).toBe(3);
      expect(TIER_LIMITS.free.label).toBe("Community");
    });

    it("pro tier has correct limits", () => {
      expect(TIER_LIMITS.pro.connectors).toBe(10);
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
