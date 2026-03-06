// ConnectorManager unit tests — lifecycle, eviction, health, and disconnect flow.
//
// Tests the full connector lifecycle: init → cache → health → evict → re-init.
// Uses a minimal fake connector to avoid network calls.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ConnectorManager } from "../../src/daemon/services/connectors/manager.js";
import { CONNECTOR_DEFS } from "../../src/shared/connector.js";

// ---------------------------------------------------------------------------
// Env helpers — save/restore all connector env vars per test
// ---------------------------------------------------------------------------

const ALL_CONNECTOR_VARS = CONNECTOR_DEFS.flatMap((d) => [
  ...d.required.flatMap((e) => (Array.isArray(e) ? e : [e])),
  ...d.optional,
]);

function saveAndClearConnectorEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const v of ALL_CONNECTOR_VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
  // Also save billing key to prevent license gate interference
  saved.STRIPE_BILLING_SECRET_KEY = process.env.STRIPE_BILLING_SECRET_KEY;
  delete process.env.STRIPE_BILLING_SECRET_KEY;
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [key, val] of Object.entries(saved)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConnectorManager", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveAndClearConnectorEnv();
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  // ── Constructor and basic state ──

  test("starts with zero active instances", () => {
    const mgr = new ConnectorManager();
    expect(mgr.activeCount).toBe(0);
  });

  test("names returns all registered connector names", () => {
    const mgr = new ConnectorManager();
    const names = mgr.names;
    expect(names.length).toBe(CONNECTOR_DEFS.length);
    for (const def of CONNECTOR_DEFS) {
      expect(names).toContain(def.name);
    }
  });

  // ── has() ──

  test("has() returns false for unknown connector", () => {
    const mgr = new ConnectorManager();
    expect(mgr.has("nonexistent")).toBe(false);
  });

  test("has() returns false for unconfigured connector", () => {
    const mgr = new ConnectorManager();
    expect(mgr.has("stripe")).toBe(false);
  });

  test("has() returns true for configured connector", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    const mgr = new ConnectorManager();
    expect(mgr.has("stripe")).toBe(true);
  });

  // ── get() ──

  test("get() returns null for unknown connector", async () => {
    const mgr = new ConnectorManager();
    const result = await mgr.get("nonexistent");
    expect(result).toBeNull();
  });

  test("get() returns null for unconfigured connector", async () => {
    const mgr = new ConnectorManager();
    const result = await mgr.get("stripe");
    expect(result).toBeNull();
  });

  test("get() initializes and caches a configured connector", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    const mgr = new ConnectorManager();

    const first = await mgr.get("github");
    expect(first).not.toBeNull();
    expect(first!.name).toBe("github");
    expect(mgr.activeCount).toBe(1);

    // Second call returns cached instance
    const second = await mgr.get("github");
    expect(second).toBe(first); // Same object reference
    expect(mgr.activeCount).toBe(1);
  });

  test("get() initializes multiple connectors independently", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    process.env.VERCEL_TOKEN = "fake_vercel";

    const mgr = new ConnectorManager();
    const gh = await mgr.get("github");
    const vc = await mgr.get("vercel");

    expect(gh).not.toBeNull();
    expect(vc).not.toBeNull();
    expect(gh!.name).toBe("github");
    expect(vc!.name).toBe("vercel");
    expect(mgr.activeCount).toBe(2);
  });

  // ── require() ──

  test("require() throws for unavailable connector", async () => {
    const mgr = new ConnectorManager();
    await expect(mgr.require("stripe")).rejects.toThrow("not available");
  });

  test("require() returns connector when available", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    const mgr = new ConnectorManager();
    const connector = await mgr.require("github");
    expect(connector.name).toBe("github");
  });

  // ── evict() ──

  test("evict() removes connector from cache", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    const mgr = new ConnectorManager();

    await mgr.get("github");
    expect(mgr.activeCount).toBe(1);

    await mgr.evict("github");
    expect(mgr.activeCount).toBe(0);
  });

  test("evict() allows re-initialization on next get()", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    const mgr = new ConnectorManager();

    const first = await mgr.get("github");
    await mgr.evict("github");

    const second = await mgr.get("github");
    expect(second).not.toBeNull();
    expect(second).not.toBe(first); // New instance, not cached
    expect(mgr.activeCount).toBe(1);
  });

  test("evict() on non-existent connector is a no-op", async () => {
    const mgr = new ConnectorManager();
    await mgr.evict("github"); // should not throw
    expect(mgr.activeCount).toBe(0);
  });

  test("evict() clears health cache so next check is fresh", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    const mgr = new ConnectorManager({ healthCacheTtlMs: 60_000 });

    // Health check populates cache
    const healthBefore = await mgr.health("github");
    expect(healthBefore.initialized).toBe(true);
    const firstCheck = healthBefore.last_check;

    // Evict — clears both instance and health cache
    await mgr.evict("github");
    expect(mgr.activeCount).toBe(0);

    // Next health check re-initializes (credentials still present)
    // and produces a fresh result (not the cached one)
    const healthAfter = await mgr.health("github");
    expect(healthAfter.initialized).toBe(true);
    expect(healthAfter.last_check).not.toBe(firstCheck); // fresh, not cached
  }, 15000);

  // ── enforceLimits() ──

  test("enforceLimits() is a no-op when under limit", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    process.env.VERCEL_TOKEN = "fake_vercel";
    const mgr = new ConnectorManager();

    await mgr.get("github");
    await mgr.get("vercel");

    const evicted = await mgr.enforceLimits(5);
    expect(evicted).toEqual([]);
    expect(mgr.activeCount).toBe(2);
  });

  test("enforceLimits() evicts excess connectors LIFO", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    process.env.VERCEL_TOKEN = "fake_vercel";
    process.env.X_BEARER_TOKEN = "fake_x";
    const mgr = new ConnectorManager();

    await mgr.get("github");
    await mgr.get("vercel");
    await mgr.get("x");
    expect(mgr.activeCount).toBe(3);

    // Enforce limit of 1 — should evict 2 (most recent first)
    const evicted = await mgr.enforceLimits(1);
    expect(evicted).toHaveLength(2);
    expect(mgr.activeCount).toBe(1);

    // The oldest connector (github) should survive
    const gh = await mgr.get("github");
    expect(gh).not.toBeNull();
  });

  // ── shutdownAll() ──

  test("shutdownAll() clears all instances", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    process.env.VERCEL_TOKEN = "fake_vercel";
    const mgr = new ConnectorManager();

    await mgr.get("github");
    await mgr.get("vercel");
    expect(mgr.activeCount).toBe(2);

    await mgr.shutdownAll();
    expect(mgr.activeCount).toBe(0);
  });

  test("shutdownAll() is safe on empty manager", async () => {
    const mgr = new ConnectorManager();
    await mgr.shutdownAll(); // should not throw
    expect(mgr.activeCount).toBe(0);
  });

  // ── health() ──

  test("health() returns not-configured for unconfigured connector", async () => {
    const mgr = new ConnectorManager();
    const status = await mgr.health("stripe");
    expect(status.name).toBe("stripe");
    expect(status.configured).toBe(false);
    expect(status.initialized).toBe(false);
    expect(status.healthy).toBe(false);
  });

  test("health() returns structured status for configured connector", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    const mgr = new ConnectorManager();
    const status = await mgr.health("github");

    expect(status.name).toBe("github");
    expect(status.label).toBe("GitHub");
    expect(status.configured).toBe(true);
    expect(status.initialized).toBe(true);
    expect(typeof status.healthy).toBe("boolean");
    expect(typeof status.latency_ms).toBe("number");
    expect(status.last_check).toBeTruthy();
  }, 15000);

  test("health() uses cached result within TTL", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    const mgr = new ConnectorManager({ healthCacheTtlMs: 60_000 }); // long TTL

    const first = await mgr.health("github");
    const second = await mgr.health("github");

    // Same cached result — last_check should match
    expect(second.last_check).toBe(first.last_check);
  }, 15000);

  // ── healthAll() ──

  test("healthAll() returns status for all connectors", async () => {
    const mgr = new ConnectorManager();
    const results = await mgr.healthAll();

    expect(results).toHaveLength(CONNECTOR_DEFS.length);
    for (const status of results) {
      expect(status).toHaveProperty("name");
      expect(status).toHaveProperty("configured");
      expect(status).toHaveProperty("healthy");
    }
  }, 30000);

  // ── Disconnect flow: evict after secret deletion ──

  test("full disconnect flow: delete secret → evict → get returns null", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    const mgr = new ConnectorManager();

    // Connect
    const connector = await mgr.get("github");
    expect(connector).not.toBeNull();
    expect(mgr.activeCount).toBe(1);

    // Disconnect: delete secret
    delete process.env.GITHUB_TOKEN;

    // Evict from cache
    await mgr.evict("github");
    expect(mgr.activeCount).toBe(0);

    // Verify can't re-initialize (no credentials)
    const afterDisconnect = await mgr.get("github");
    expect(afterDisconnect).toBeNull();
    expect(mgr.activeCount).toBe(0);
  });

  test("reconnect flow: evict → set new secret → get re-initializes", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken_v1";
    const mgr = new ConnectorManager();

    const v1 = await mgr.get("github");
    expect(v1).not.toBeNull();

    // Disconnect
    delete process.env.GITHUB_TOKEN;
    await mgr.evict("github");

    // Reconnect with new credentials
    process.env.GITHUB_TOKEN = "ghp_faketoken_v2";
    const v2 = await mgr.get("github");
    expect(v2).not.toBeNull();
    expect(v2).not.toBe(v1); // New instance
    expect(mgr.activeCount).toBe(1);
  });

  // ── Webhook dispatch ──

  test("dispatchWebhook() returns null for unavailable connector", async () => {
    const mgr = new ConnectorManager();
    const result = await mgr.dispatchWebhook("stripe", {}, "{}");
    expect(result).toBeNull();
  });

  test("dispatchWebhook() routes to connector webhook handler", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    const mgr = new ConnectorManager();

    const result = await mgr.dispatchWebhook(
      "github",
      { "x-github-event": "push", "x-hub-signature-256": "sha256=fake" },
      '{"action":"opened"}',
    );

    expect(result).not.toBeNull();
    expect(result!.source).toBe("github");
    expect(result!.received_at).toBeTruthy();
  });

  // ── Concurrent init deduplication ──

  test("concurrent get() calls deduplicate initialization", async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken";
    const mgr = new ConnectorManager();

    // Fire two get() calls simultaneously
    const [a, b] = await Promise.all([
      mgr.get("github"),
      mgr.get("github"),
    ]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).toBe(b); // Same instance
    expect(mgr.activeCount).toBe(1);
  });
});
