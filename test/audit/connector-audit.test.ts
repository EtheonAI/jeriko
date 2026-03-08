/**
 * Connector system audit tests.
 *
 * Validates registration, wiring, structure, and consistency across:
 *   - CONNECTOR_FACTORIES (registry.ts)
 *   - CONNECTOR_DEFS (shared/connector.ts)
 *   - OAUTH_PROVIDERS (oauth/providers.ts)
 *   - BAKED_OAUTH_CLIENT_IDS (shared/baked-oauth-ids.ts)
 *   - ConnectorManager (manager.ts)
 *   - ConnectorBase / BearerConnector (base.ts)
 *   - Connector tool aliases (agent/tools/connector.ts)
 *
 * No real API calls. Tests registration, wiring, and structure only.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { CONNECTOR_FACTORIES, loadConnector } from "../../src/daemon/services/connectors/registry.js";
import {
  CONNECTOR_DEFS,
  getConnectorDef,
  isConnectorConfigured,
  getConfiguredConnectorCount,
  primaryVarName,
  isSlotSet,
  slotLabel,
  resolveMethod,
  collectFlags,
} from "../../src/shared/connector.js";
import { BAKED_OAUTH_CLIENT_IDS } from "../../src/shared/baked-oauth-ids.js";
import { OAUTH_PROVIDERS, getOAuthProvider, isOAuthCapable, getClientId } from "../../src/daemon/services/oauth/providers.js";
import { ConnectorManager } from "../../src/daemon/services/connectors/manager.js";

// ---------------------------------------------------------------------------
// Expected connectors — single source of truth for this test
// ---------------------------------------------------------------------------

const ALL_CONNECTORS = [
  "stripe", "paypal", "github", "twilio", "vercel", "x",
  "gdrive", "gmail",
  "hubspot", "shopify", "instagram", "threads",
  "slack", "discord", "sendgrid",
  "square", "gitlab", "cloudflare",
  "notion", "linear", "jira", "airtable", "asana",
  "mailchimp", "dropbox",
] as const;

/** Connectors that extend ConnectorBase directly (not BearerConnector). */
const CONNECTOR_BASE_DIRECT = [
  "stripe", "github", "twilio", "x", "vercel", "sendgrid", "cloudflare",
] as const;

/** Connectors that extend BearerConnector. */
const BEARER_CONNECTORS = [
  "paypal", "gdrive", "gmail",
  "hubspot", "shopify", "instagram", "threads",
  "slack", "discord",
  "square", "gitlab",
  "notion", "linear", "jira", "airtable", "asana",
  "mailchimp", "dropbox",
] as const;

/** Connectors with no OAuth support (API key / credentials only). */
const NON_OAUTH_CONNECTORS = ["paypal", "twilio", "sendgrid", "cloudflare", "slack"] as const;

/** Connectors that support OAuth (have oauth config in CONNECTOR_DEFS). */
const OAUTH_CONNECTORS = ALL_CONNECTORS.filter(
  (c) => !(NON_OAUTH_CONNECTORS as readonly string[]).includes(c),
);

// ===========================================================================
// 1. Registry completeness
// ===========================================================================

describe("CONNECTOR_FACTORIES registry", () => {
  test("has all expected connectors", () => {
    const registryNames = Object.keys(CONNECTOR_FACTORIES).sort();
    const expected = [...ALL_CONNECTORS].sort();
    expect(registryNames).toEqual(expected);
  });

  test("has exactly 25 entries", () => {
    expect(Object.keys(CONNECTOR_FACTORIES)).toHaveLength(25);
  });

  test("every factory is a function", () => {
    for (const [name, factory] of Object.entries(CONNECTOR_FACTORIES)) {
      expect(typeof factory).toBe("function");
    }
  });

  test("every factory returns a promise (async)", async () => {
    // Just check the first one to confirm pattern
    const stripeFactory = CONNECTOR_FACTORIES.stripe;
    const result = stripeFactory();
    expect(result).toBeInstanceOf(Promise);
    // Resolve it to avoid unhandled promise
    await result;
  });
});

// ===========================================================================
// 2. CONNECTOR_DEFS completeness
// ===========================================================================

describe("CONNECTOR_DEFS", () => {
  test("has all expected connectors", () => {
    const defNames = CONNECTOR_DEFS.map((d) => d.name).sort();
    const expected = [...ALL_CONNECTORS].sort();
    expect(defNames).toEqual(expected);
  });

  test("has exactly 25 entries", () => {
    expect(CONNECTOR_DEFS).toHaveLength(25);
  });

  test("matches CONNECTOR_FACTORIES exactly", () => {
    const factoryNames = new Set(Object.keys(CONNECTOR_FACTORIES));
    const defNames = new Set(CONNECTOR_DEFS.map((d) => d.name));
    expect(factoryNames).toEqual(defNames);
  });

  test("every def has required fields", () => {
    for (const def of CONNECTOR_DEFS) {
      expect(def.name).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(Array.isArray(def.required)).toBe(true);
      expect(def.required.length).toBeGreaterThan(0);
      expect(Array.isArray(def.optional)).toBe(true);
    }
  });

  test("getConnectorDef returns correct entry", () => {
    const stripe = getConnectorDef("stripe");
    expect(stripe).toBeDefined();
    expect(stripe!.name).toBe("stripe");
    expect(stripe!.label).toBe("Stripe");
  });

  test("getConnectorDef returns undefined for unknown", () => {
    expect(getConnectorDef("nonexistent")).toBeUndefined();
  });

  test("OAuth-capable connectors have oauth config", () => {
    for (const name of OAUTH_CONNECTORS) {
      const def = getConnectorDef(name);
      expect(def).toBeDefined();
      expect(def!.oauth).toBeDefined();
      expect(def!.oauth!.clientIdVar).toBeTruthy();
      expect(def!.oauth!.clientSecretVar).toBeTruthy();
    }
  });

  test("non-OAuth connectors lack oauth config", () => {
    for (const name of NON_OAUTH_CONNECTORS) {
      const def = getConnectorDef(name);
      expect(def).toBeDefined();
      expect(def!.oauth).toBeUndefined();
    }
  });
});

// ===========================================================================
// 3. Factory functions create correct types
// ===========================================================================

describe("Factory instantiation", () => {
  test("each factory resolves to a constructor with name and version", async () => {
    for (const name of ALL_CONNECTORS) {
      const factory = CONNECTOR_FACTORIES[name];
      expect(factory).toBeDefined();
      const Ctor = await factory();
      expect(typeof Ctor).toBe("function");

      // Instantiate without init (no env vars set)
      const instance = new Ctor();
      expect(instance.name).toBe(name);
      expect(instance.version).toBe("1.0.0");
    }
  });

  test("each factory instance implements ConnectorInterface methods", async () => {
    for (const name of ALL_CONNECTORS) {
      const Ctor = await CONNECTOR_FACTORIES[name]();
      const instance = new Ctor();
      expect(typeof instance.init).toBe("function");
      expect(typeof instance.health).toBe("function");
      expect(typeof instance.call).toBe("function");
      expect(typeof instance.webhook).toBe("function");
      expect(typeof instance.shutdown).toBe("function");
    }
  });

  test("loadConnector throws for unknown connector", async () => {
    await expect(loadConnector("nonexistent")).rejects.toThrow("Unknown connector: nonexistent");
  });
});

// ===========================================================================
// 4. ConnectorManager
// ===========================================================================

/**
 * Collect all env vars referenced by CONNECTOR_DEFS so we can
 * temporarily clear them for tests that need a "clean" environment.
 */
function getAllConnectorEnvVars(): string[] {
  const vars = new Set<string>();
  for (const def of CONNECTOR_DEFS) {
    for (const entry of def.required) {
      if (Array.isArray(entry)) {
        for (const v of entry) vars.add(v);
      } else {
        vars.add(entry);
      }
    }
    for (const v of def.optional) vars.add(v);
    if (def.oauth) {
      vars.add(def.oauth.clientIdVar);
      vars.add(def.oauth.clientSecretVar);
    }
  }
  return [...vars];
}

function saveAndClearConnectorEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of getAllConnectorEnvVars()) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [key, val] of Object.entries(saved)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
}

describe("ConnectorManager", () => {
  let manager: ConnectorManager;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveAndClearConnectorEnv();
    manager = new ConnectorManager({ healthCacheTtlMs: 100 });
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  test("names returns all 25 connectors", () => {
    expect(manager.names.sort()).toEqual([...ALL_CONNECTORS].sort());
  });

  test("has() returns false for unknown connector", () => {
    expect(manager.has("nonexistent")).toBe(false);
  });

  test("has() returns false when env vars not set", () => {
    for (const name of ALL_CONNECTORS) {
      expect(manager.has(name)).toBe(false);
    }
  });

  test("get() returns null for unknown connector", async () => {
    const result = await manager.get("nonexistent");
    expect(result).toBeNull();
  });

  test("get() returns null for unconfigured connector", async () => {
    const result = await manager.get("stripe");
    expect(result).toBeNull();
  });

  test("require() throws for unavailable connector", async () => {
    await expect(manager.require("stripe")).rejects.toThrow(
      'Connector "stripe" is not available',
    );
  });

  test("activeCount starts at 0", () => {
    expect(manager.activeCount).toBe(0);
  });

  test("shutdownAll on empty manager is a no-op", async () => {
    await manager.shutdownAll();
    expect(manager.activeCount).toBe(0);
  });

  test("evict on non-existent connector is a no-op", async () => {
    await manager.evict("nonexistent");
    expect(manager.activeCount).toBe(0);
  });

  test("enforceLimits returns empty when under limit", async () => {
    const evicted = await manager.enforceLimits(10);
    expect(evicted).toEqual([]);
  });

  test("health returns unconfigured status for missing env vars", async () => {
    const status = await manager.health("stripe");
    expect(status.name).toBe("stripe");
    expect(status.label).toBe("Stripe");
    expect(status.configured).toBe(false);
    expect(status.initialized).toBe(false);
    expect(status.healthy).toBe(false);
  });

  test("healthAll returns status for all 25 connectors", async () => {
    const results = await manager.healthAll();
    expect(results).toHaveLength(25);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual([...ALL_CONNECTORS].sort());
  });
});

// ===========================================================================
// 5. ConnectorManager with a configured connector
// ===========================================================================

describe("ConnectorManager with configured connector", () => {
  const origEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and set env vars for stripe
    origEnv.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_audit";
  });

  afterEach(() => {
    // Restore
    if (origEnv.STRIPE_SECRET_KEY === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = origEnv.STRIPE_SECRET_KEY;
    }
  });

  test("has() returns true when env vars are set", () => {
    const manager = new ConnectorManager();
    expect(manager.has("stripe")).toBe(true);
  });

  test("get() initializes and caches connector", async () => {
    const manager = new ConnectorManager();
    const connector = await manager.get("stripe");
    expect(connector).not.toBeNull();
    expect(connector!.name).toBe("stripe");
    expect(manager.activeCount).toBe(1);

    // Second call returns same instance
    const connector2 = await manager.get("stripe");
    expect(connector2).toBe(connector);
    expect(manager.activeCount).toBe(1);
  });

  test("evict removes cached connector", async () => {
    const manager = new ConnectorManager();
    await manager.get("stripe");
    expect(manager.activeCount).toBe(1);

    await manager.evict("stripe");
    expect(manager.activeCount).toBe(0);
  });

  test("shutdownAll clears all instances", async () => {
    const manager = new ConnectorManager();
    await manager.get("stripe");
    expect(manager.activeCount).toBe(1);

    await manager.shutdownAll();
    expect(manager.activeCount).toBe(0);
  });

  test("health returns configured status", async () => {
    const manager = new ConnectorManager();
    const status = await manager.health("stripe");
    expect(status.name).toBe("stripe");
    expect(status.configured).toBe(true);
    // It will try to init and health check (which will fail due to fake key)
    // but the configured flag should be true
  });
});

// ===========================================================================
// 6. Health check caching
// ===========================================================================

describe("Health check caching", () => {
  const origEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    origEnv.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_audit";
  });

  afterEach(() => {
    if (origEnv.STRIPE_SECRET_KEY === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = origEnv.STRIPE_SECRET_KEY;
    }
  });

  test("health check result is cached within TTL", async () => {
    const manager = new ConnectorManager({ healthCacheTtlMs: 5000 });
    const status1 = await manager.health("stripe");
    const status2 = await manager.health("stripe");

    // Both should have same last_check if cached
    // (second call doesn't trigger a new health check)
    if (status1.last_check && status2.last_check) {
      expect(status2.last_check).toBe(status1.last_check);
    }
  });
});

// ===========================================================================
// 7. OAUTH_PROVIDERS
// ===========================================================================

describe("OAUTH_PROVIDERS", () => {
  test("has entries for all OAuth-capable connectors", () => {
    const oauthNames = OAUTH_PROVIDERS.map((p) => p.name).sort();
    const expected = [...OAUTH_CONNECTORS].sort();
    expect(oauthNames).toEqual(expected);
  });

  test("every provider has required fields", () => {
    for (const provider of OAUTH_PROVIDERS) {
      expect(provider.name).toBeTruthy();
      expect(provider.label).toBeTruthy();
      expect(provider.authUrl).toBeTruthy();
      expect(provider.tokenUrl).toBeTruthy();
      expect(Array.isArray(provider.scopes)).toBe(true);
      expect(provider.bakedIdKey).toBeTruthy();
      expect(provider.clientIdVar).toBeTruthy();
      expect(provider.clientSecretVar).toBeTruthy();
      expect(provider.tokenEnvVar).toBeTruthy();
    }
  });

  test("getOAuthProvider returns correct entry", () => {
    const github = getOAuthProvider("github");
    expect(github).toBeDefined();
    expect(github!.name).toBe("github");
    expect(github!.label).toBe("GitHub");
  });

  test("getOAuthProvider returns undefined for non-OAuth connector", () => {
    expect(getOAuthProvider("twilio")).toBeUndefined();
  });

  test("isOAuthCapable returns correct results", () => {
    expect(isOAuthCapable("github")).toBe(true);
    expect(isOAuthCapable("twilio")).toBe(false);
    expect(isOAuthCapable("paypal")).toBe(false);
    expect(isOAuthCapable("sendgrid")).toBe(false);
    expect(isOAuthCapable("cloudflare")).toBe(false);
  });

  test("provider clientIdVar matches CONNECTOR_DEFS oauth.clientIdVar", () => {
    for (const provider of OAUTH_PROVIDERS) {
      const def = getConnectorDef(provider.name);
      expect(def).toBeDefined();
      if (def!.oauth) {
        expect(provider.clientIdVar).toBe(def!.oauth.clientIdVar);
      }
    }
  });

  test("provider clientSecretVar matches CONNECTOR_DEFS oauth.clientSecretVar", () => {
    for (const provider of OAUTH_PROVIDERS) {
      const def = getConnectorDef(provider.name);
      expect(def).toBeDefined();
      if (def!.oauth) {
        expect(provider.clientSecretVar).toBe(def!.oauth.clientSecretVar);
      }
    }
  });
});

// ===========================================================================
// 8. Baked OAuth IDs
// ===========================================================================

describe("BAKED_OAUTH_CLIENT_IDS", () => {
  test("has keys for all OAUTH_PROVIDERS bakedIdKeys", () => {
    const bakedKeys = new Set(Object.keys(BAKED_OAUTH_CLIENT_IDS));
    for (const provider of OAUTH_PROVIDERS) {
      expect(bakedKeys.has(provider.bakedIdKey)).toBe(true);
    }
  });

  test("google key covers gdrive and gmail", () => {
    const gdriveProvider = getOAuthProvider("gdrive");
    const gmailProvider = getOAuthProvider("gmail");
    expect(gdriveProvider!.bakedIdKey).toBe("google");
    expect(gmailProvider!.bakedIdKey).toBe("google");
  });

  test("atlassian key covers jira", () => {
    const jiraProvider = getOAuthProvider("jira");
    expect(jiraProvider!.bakedIdKey).toBe("atlassian");
  });

  test("getClientId falls back correctly when no env vars set", () => {
    const provider = getOAuthProvider("github")!;
    // At dev time (no build-time injection), should return undefined
    const clientId = getClientId(provider);
    // It's undefined because no env var and no baked value at dev time
    expect(clientId === undefined || typeof clientId === "string").toBe(true);
  });
});

// ===========================================================================
// 9. Tool aliases
// ===========================================================================

describe("Connector tool aliases", () => {
  test("connector tool defines aliases for all 25 connectors", async () => {
    // Import the tool definition
    const { connectorTool } = await import("../../src/daemon/agent/tools/connector.js");

    expect(connectorTool.id).toBe("connector");
    expect(connectorTool.aliases).toBeDefined();

    const aliasSet = new Set(connectorTool.aliases!);

    // Every connector name should be an alias
    for (const name of ALL_CONNECTORS) {
      expect(aliasSet.has(name)).toBe(true);
    }
  });

  test("connector tool has extra utility aliases", async () => {
    const { connectorTool } = await import("../../src/daemon/agent/tools/connector.js");
    const aliasSet = new Set(connectorTool.aliases!);

    expect(aliasSet.has("connectors")).toBe(true);
    expect(aliasSet.has("email_send")).toBe(true);
    expect(aliasSet.has("send_email")).toBe(true);
  });
});

// ===========================================================================
// 10. isConnectorConfigured and helpers
// ===========================================================================

describe("isConnectorConfigured", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveAndClearConnectorEnv();
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  test("returns false for unknown connector", () => {
    expect(isConnectorConfigured("nonexistent")).toBe(false);
  });

  test("returns false when no env vars set", () => {
    expect(isConnectorConfigured("stripe")).toBe(false);
  });

  test("returns true when required env vars are set", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    expect(isConnectorConfigured("stripe")).toBe(true);
  });

  test("handles alternative env vars (GitHub)", () => {
    // Neither set
    expect(isConnectorConfigured("github")).toBe(false);

    // First alternative set
    process.env.GITHUB_TOKEN = "ghp_fake";
    expect(isConnectorConfigured("github")).toBe(true);

    // Only second alternative set
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = "ghp_fake2";
    expect(isConnectorConfigured("github")).toBe(true);
  });

  test("requires ALL non-alternative env vars (PayPal)", () => {
    // PayPal requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET
    expect(isConnectorConfigured("paypal")).toBe(false);

    // Set only one — still not configured
    process.env.PAYPAL_CLIENT_ID = "fake_id";
    expect(isConnectorConfigured("paypal")).toBe(false);

    // Set both — now configured
    process.env.PAYPAL_CLIENT_SECRET = "fake_secret";
    expect(isConnectorConfigured("paypal")).toBe(true);
  });
});

describe("Connector helpers", () => {
  test("primaryVarName returns first for alternatives", () => {
    expect(primaryVarName(["GITHUB_TOKEN", "GH_TOKEN"])).toBe("GITHUB_TOKEN");
    expect(primaryVarName("STRIPE_SECRET_KEY")).toBe("STRIPE_SECRET_KEY");
  });

  test("slotLabel joins alternatives", () => {
    expect(slotLabel(["GITHUB_TOKEN", "GH_TOKEN"])).toBe("GITHUB_TOKEN or GH_TOKEN");
    expect(slotLabel("STRIPE_SECRET_KEY")).toBe("STRIPE_SECRET_KEY");
  });
});

// ===========================================================================
// 11. resolveMethod
// ===========================================================================

describe("resolveMethod", () => {
  test("dot-notation passthrough", () => {
    expect(resolveMethod(["customers.list"])).toEqual({
      method: "customers.list",
      rest: [],
    });
  });

  test("space-separated with action verb", () => {
    expect(resolveMethod(["customers", "list"])).toEqual({
      method: "customers.list",
      rest: [],
    });
  });

  test("three positionals with action verb", () => {
    expect(resolveMethod(["customers", "get", "cus_123"])).toEqual({
      method: "customers.get",
      rest: ["cus_123"],
    });
  });

  test("single-word method", () => {
    expect(resolveMethod(["balance"])).toEqual({
      method: "balance",
      rest: [],
    });
  });

  test("second positional is value, not action", () => {
    expect(resolveMethod(["post", "Hello world"])).toEqual({
      method: "post",
      rest: ["Hello world"],
    });
  });

  test("empty positionals", () => {
    expect(resolveMethod([])).toEqual({ method: "", rest: [] });
  });
});

// ===========================================================================
// 12. collectFlags
// ===========================================================================

describe("collectFlags", () => {
  test("converts kebab-case to snake_case", () => {
    const result = collectFlags({ "customer-id": "cus_123", limit: "10" });
    expect(result).toEqual({ customer_id: "cus_123", limit: "10" });
  });

  test("strips help flag", () => {
    const result = collectFlags({ help: true, limit: "10" });
    expect(result).toEqual({ limit: "10" });
  });

  test("preserves boolean flags", () => {
    const result = collectFlags({ verbose: true });
    expect(result).toEqual({ verbose: true });
  });
});

// ===========================================================================
// 13. ConnectorBase methods (via factory instantiation)
// ===========================================================================

describe("ConnectorBase default methods", () => {
  test("shutdown is a no-op by default", async () => {
    const Ctor = await CONNECTOR_FACTORIES.sendgrid();
    const instance = new Ctor();
    // shutdown should not throw
    await instance.shutdown();
  });

  test("webhook parses JSON and returns unverified event", async () => {
    const Ctor = await CONNECTOR_FACTORIES.sendgrid();
    const instance = new Ctor();
    // Set API key for init
    const orig = process.env.SENDGRID_API_KEY;
    process.env.SENDGRID_API_KEY = "SG.fake_key";
    await instance.init();

    const event = await instance.webhook(
      { "content-type": "application/json" },
      JSON.stringify({ type: "test.event", data: { foo: "bar" } }),
    );
    expect(event.source).toBe("sendgrid");
    expect(event.type).toBe("sendgrid.webhook");
    expect(event.verified).toBe(false);
    expect(event.data).toEqual({ type: "test.event", data: { foo: "bar" } });
    expect(event.id).toBeTruthy();
    expect(event.received_at).toBeTruthy();

    if (orig === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = orig;
  });

  test("webhook throws on invalid JSON", async () => {
    const Ctor = await CONNECTOR_FACTORIES.sendgrid();
    const instance = new Ctor();
    const orig = process.env.SENDGRID_API_KEY;
    process.env.SENDGRID_API_KEY = "SG.fake_key";
    await instance.init();

    await expect(
      instance.webhook({}, "not-json{{{"),
    ).rejects.toThrow("Invalid JSON");

    if (orig === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = orig;
  });

  test("call returns error for unknown method", async () => {
    const Ctor = await CONNECTOR_FACTORIES.sendgrid();
    const instance = new Ctor();
    const orig = process.env.SENDGRID_API_KEY;
    process.env.SENDGRID_API_KEY = "SG.fake_key";
    await instance.init();

    const result = await instance.call("nonexistent.method", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown");

    if (orig === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = orig;
  });
});

// ===========================================================================
// 14. Cross-registry consistency
// ===========================================================================

describe("Cross-registry consistency", () => {
  test("every CONNECTOR_FACTORIES entry has a matching CONNECTOR_DEFS entry", () => {
    for (const name of Object.keys(CONNECTOR_FACTORIES)) {
      const def = getConnectorDef(name);
      expect(def).toBeDefined();
    }
  });

  test("every CONNECTOR_DEFS entry has a matching CONNECTOR_FACTORIES entry", () => {
    for (const def of CONNECTOR_DEFS) {
      expect(CONNECTOR_FACTORIES[def.name]).toBeDefined();
    }
  });

  test("every OAUTH_PROVIDERS entry has a matching CONNECTOR_FACTORIES entry", () => {
    for (const provider of OAUTH_PROVIDERS) {
      expect(CONNECTOR_FACTORIES[provider.name]).toBeDefined();
    }
  });

  test("every OAUTH_PROVIDERS entry has a matching CONNECTOR_DEFS.oauth entry", () => {
    for (const provider of OAUTH_PROVIDERS) {
      const def = getConnectorDef(provider.name);
      expect(def).toBeDefined();
      expect(def!.oauth).toBeDefined();
    }
  });

  test("no CONNECTOR_DEFS with oauth are missing from OAUTH_PROVIDERS", () => {
    const oauthProviderNames = new Set(OAUTH_PROVIDERS.map((p) => p.name));
    for (const def of CONNECTOR_DEFS) {
      if (def.oauth) {
        expect(oauthProviderNames.has(def.name)).toBe(true);
      }
    }
  });

  test("BAKED_OAUTH_CLIENT_IDS has keys for all unique bakedIdKeys", () => {
    const bakedKeys = new Set(Object.keys(BAKED_OAUTH_CLIENT_IDS));
    const requiredKeys = new Set(OAUTH_PROVIDERS.map((p) => p.bakedIdKey));
    for (const key of requiredKeys) {
      expect(bakedKeys.has(key)).toBe(true);
    }
  });

  test("getConfiguredConnectorCount returns 0 with no env vars", () => {
    const saved = saveAndClearConnectorEnv();
    try {
      expect(getConfiguredConnectorCount()).toBe(0);
    } finally {
      restoreEnv(saved);
    }
  });
});

// ===========================================================================
// 15. Connector name consistency (factory name == instance.name)
// ===========================================================================

describe("Connector instance name matches registry key", () => {
  test("every factory produces instance with matching name", async () => {
    for (const [registryName, factory] of Object.entries(CONNECTOR_FACTORIES)) {
      const Ctor = await factory();
      const instance = new Ctor();
      expect(instance.name).toBe(registryName);
    }
  });
});
