// Integration test — channel connector commands (/connectors, /auth, /health).
//
// Tests the full pipeline: connector defs, secrets persistence, health checks,
// and the auth flow including message deletion behavior.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CONNECTOR_DEFS,
  getConnectorDef,
  isConnectorConfigured,
  primaryVarName,
  isSlotSet,
  slotLabel,
  resolveMethod,
  collectFlags,
} from "../../src/shared/connector.js";
import { loadSecrets, saveSecret, deleteSecret } from "../../src/shared/secrets.js";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SECRETS_PATH = join(homedir(), ".config", "jeriko", ".env");

// ---------------------------------------------------------------------------
// Connector Definitions
// ---------------------------------------------------------------------------

describe("CONNECTOR_DEFS", () => {
  test("has exactly 27 connectors", () => {
    expect(CONNECTOR_DEFS).toHaveLength(27);
  });

  test("all connectors have required fields", () => {
    for (const def of CONNECTOR_DEFS) {
      expect(def.name).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.required.length).toBeGreaterThan(0);
      expect(Array.isArray(def.optional)).toBe(true);
    }
  });

  test("connector names are unique", () => {
    const names = CONNECTOR_DEFS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("connector names match CLI command names", () => {
    const expected = [
      "stripe", "paypal", "github", "twilio", "vercel", "x", "gdrive", "onedrive", "gmail", "outlook",
      "hubspot", "shopify", "instagram", "threads", "slack", "discord", "sendgrid", "square", "gitlab", "cloudflare",
      "notion", "linear", "jira", "airtable", "asana", "mailchimp", "dropbox",
    ];
    const actual = CONNECTOR_DEFS.map((d) => d.name);
    expect(actual).toEqual(expected);
  });

  test("getConnectorDef returns correct def", () => {
    const stripe = getConnectorDef("stripe");
    expect(stripe).toBeDefined();
    expect(stripe!.label).toBe("Stripe");
    expect(stripe!.required).toEqual(["STRIPE_SECRET_KEY"]);
  });

  test("getConnectorDef returns undefined for unknown", () => {
    expect(getConnectorDef("unknown")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Alternative env var support
// ---------------------------------------------------------------------------

describe("alternative env vars", () => {
  test("github has alternatives", () => {
    const gh = getConnectorDef("github")!;
    expect(Array.isArray(gh.required[0])).toBe(true);
    expect(gh.required[0]).toEqual(["GITHUB_TOKEN", "GH_TOKEN"]);
  });

  test("x has alternatives", () => {
    const x = getConnectorDef("x")!;
    expect(Array.isArray(x.required[0])).toBe(true);
    expect(x.required[0]).toEqual(["X_BEARER_TOKEN", "TWITTER_BEARER_TOKEN"]);
  });

  test("primaryVarName returns first alternative", () => {
    expect(primaryVarName(["A", "B"])).toBe("A");
    expect(primaryVarName("C")).toBe("C");
  });

  test("slotLabel shows alternatives with 'or'", () => {
    expect(slotLabel(["A", "B"])).toBe("A or B");
    expect(slotLabel("C")).toBe("C");
  });

  test("isSlotSet checks any alternative", () => {
    // Save state
    const oldA = process.env.TEST_ALT_A;
    const oldB = process.env.TEST_ALT_B;

    delete process.env.TEST_ALT_A;
    delete process.env.TEST_ALT_B;
    expect(isSlotSet(["TEST_ALT_A", "TEST_ALT_B"])).toBe(false);

    process.env.TEST_ALT_B = "value";
    expect(isSlotSet(["TEST_ALT_A", "TEST_ALT_B"])).toBe(true);

    // Restore
    if (oldA) process.env.TEST_ALT_A = oldA; else delete process.env.TEST_ALT_A;
    if (oldB) process.env.TEST_ALT_B = oldB; else delete process.env.TEST_ALT_B;
  });

  test("isConnectorConfigured handles alternatives", () => {
    // X should be configured if either X_BEARER_TOKEN or TWITTER_BEARER_TOKEN is set
    const hasX = !!(process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN);
    expect(isConnectorConfigured("x")).toBe(hasX);
  });
});

// ---------------------------------------------------------------------------
// Secrets module
// ---------------------------------------------------------------------------

describe("secrets", () => {
  const TEST_KEY = "_JERIKO_TEST_SECRET_9182";
  const TEST_VAL = "test_value_abc123";

  afterAll(() => {
    // Cleanup
    deleteSecret(TEST_KEY);
  });

  test("saveSecret writes to file and sets env", () => {
    saveSecret(TEST_KEY, TEST_VAL);
    expect(process.env[TEST_KEY]).toBe(TEST_VAL);
    expect(existsSync(SECRETS_PATH)).toBe(true);

    const content = readFileSync(SECRETS_PATH, "utf-8");
    expect(content).toContain(`${TEST_KEY}=${TEST_VAL}`);
  });

  test("secrets file has 0o600 permissions", () => {
    const stats = statSync(SECRETS_PATH);
    expect((stats.mode & 0o777).toString(8)).toBe("600");
  });

  test("saveSecret replaces existing key", () => {
    saveSecret(TEST_KEY, "new_value");
    expect(process.env[TEST_KEY]).toBe("new_value");

    const content = readFileSync(SECRETS_PATH, "utf-8");
    // Only one occurrence of the key
    const matches = content.match(new RegExp(`^${TEST_KEY}=`, "gm"));
    expect(matches).toHaveLength(1);
    expect(content).toContain(`${TEST_KEY}=new_value`);
  });

  test("deleteSecret removes from file and env", () => {
    deleteSecret(TEST_KEY);
    expect(process.env[TEST_KEY]).toBeUndefined();

    const content = readFileSync(SECRETS_PATH, "utf-8");
    expect(content).not.toContain(TEST_KEY);
  });

  test("loadSecrets does not override existing env vars", () => {
    // Set a value via env, then save a different value to file
    process.env[TEST_KEY] = "from_env";
    saveSecret(TEST_KEY, "from_file");

    // Reset env to simulate a fresh process
    process.env[TEST_KEY] = "from_env";

    loadSecrets();

    // loadSecrets should NOT override because env already has the value
    expect(process.env[TEST_KEY]).toBe("from_env");

    // Cleanup
    deleteSecret(TEST_KEY);
    delete process.env[TEST_KEY];
  });

  test("loadSecrets handles quoted values", () => {
    // Manually write a quoted value
    saveSecret(TEST_KEY, '"quoted_value"');
    delete process.env[TEST_KEY]; // clear so loadSecrets can set it

    loadSecrets();
    expect(process.env[TEST_KEY]).toBe("quoted_value");

    // Cleanup
    deleteSecret(TEST_KEY);
  });
});

// ---------------------------------------------------------------------------
// Method resolution
// ---------------------------------------------------------------------------

describe("resolveMethod", () => {
  test("space-separated resource + action", () => {
    const r = resolveMethod(["customers", "list"]);
    expect(r.method).toBe("customers.list");
    expect(r.rest).toEqual([]);
  });

  test("resource + action + ID", () => {
    const r = resolveMethod(["customers", "get", "cus_123"]);
    expect(r.method).toBe("customers.get");
    expect(r.rest).toEqual(["cus_123"]);
  });

  test("dot-notation passthrough", () => {
    const r = resolveMethod(["customers.list"]);
    expect(r.method).toBe("customers.list");
    expect(r.rest).toEqual([]);
  });

  test("single-word method (alias)", () => {
    const r = resolveMethod(["balance"]);
    expect(r.method).toBe("balance");
    expect(r.rest).toEqual([]);
  });

  test("single word + non-action second arg", () => {
    const r = resolveMethod(["post", "Hello world"]);
    expect(r.method).toBe("post");
    expect(r.rest).toEqual(["Hello world"]);
  });

  test("empty positionals", () => {
    const r = resolveMethod([]);
    expect(r.method).toBe("");
    expect(r.rest).toEqual([]);
  });

  test("case-insensitive action detection", () => {
    const r = resolveMethod(["customers", "LIST"]);
    expect(r.method).toBe("customers.LIST");
  });
});

// ---------------------------------------------------------------------------
// Flag collection
// ---------------------------------------------------------------------------

describe("collectFlags", () => {
  test("converts kebab-case to snake_case", () => {
    const result = collectFlags({ "api-key": "abc", "max-results": "10" });
    expect(result).toEqual({ api_key: "abc", max_results: "10" });
  });

  test("strips help flag", () => {
    const result = collectFlags({ help: true, limit: "5" });
    expect(result).toEqual({ limit: "5" });
  });

  test("preserves boolean flags", () => {
    const result = collectFlags({ "no-verify": false, sandbox: true });
    expect(result).toEqual({ no_verify: false, sandbox: true });
  });
});

// ---------------------------------------------------------------------------
// Health checks — real connector init + health call
// ---------------------------------------------------------------------------

describe("connector health checks", () => {
  // Only test connectors that are actually configured
  const configuredConnectors = CONNECTOR_DEFS.filter((d) => isConnectorConfigured(d.name));

  if (configuredConnectors.length === 0) {
    test.skip("no connectors configured — skipping health checks", () => {});
  }

  for (const def of configuredConnectors) {
    test(`${def.name} connector class loads and constructs`, async () => {
      // Dynamic import matching what the router does
      const importMap: Record<string, string> = {
        stripe: "../../src/daemon/services/connectors/stripe/connector.js",
        paypal: "../../src/daemon/services/connectors/paypal/connector.js",
        github: "../../src/daemon/services/connectors/github/connector.js",
        twilio: "../../src/daemon/services/connectors/twilio/connector.js",
        vercel: "../../src/daemon/services/connectors/vercel/connector.js",
        x: "../../src/daemon/services/connectors/x/connector.js",
        gdrive: "../../src/daemon/services/connectors/gdrive/connector.js",
        onedrive: "../../src/daemon/services/connectors/onedrive/connector.js",
      };

      const classMap: Record<string, string> = {
        stripe: "StripeConnector",
        paypal: "PayPalConnector",
        github: "GitHubConnector",
        twilio: "TwilioConnector",
        vercel: "VercelConnector",
        x: "XConnector",
        gdrive: "GDriveConnector",
        onedrive: "OneDriveConnector",
      };

      const mod = await import(importMap[def.name]!);
      const ConnectorClass = mod[classMap[def.name]!];
      expect(ConnectorClass).toBeDefined();

      const connector = new ConnectorClass();
      expect(connector.name).toBe(def.name);
      expect(typeof connector.init).toBe("function");
      expect(typeof connector.health).toBe("function");
      expect(typeof connector.call).toBe("function");
      expect(typeof connector.webhook).toBe("function");
      expect(typeof connector.shutdown).toBe("function");
    });
  }

  // Test init+health only on connectors that won't throw on init (stateless HTTP ones).
  // PayPal requires OAuth exchange on init, so it may fail with invalid creds.
  const statelessConnectors = configuredConnectors.filter(
    (d) => !["paypal"].includes(d.name),
  );

  for (const def of statelessConnectors) {
    test(`${def.name} connector init + health returns well-formed result`, async () => {
      const importMap: Record<string, string> = {
        stripe: "../../src/daemon/services/connectors/stripe/connector.js",
        github: "../../src/daemon/services/connectors/github/connector.js",
        twilio: "../../src/daemon/services/connectors/twilio/connector.js",
        vercel: "../../src/daemon/services/connectors/vercel/connector.js",
        x: "../../src/daemon/services/connectors/x/connector.js",
        gdrive: "../../src/daemon/services/connectors/gdrive/connector.js",
        onedrive: "../../src/daemon/services/connectors/onedrive/connector.js",
      };

      const classMap: Record<string, string> = {
        stripe: "StripeConnector",
        github: "GitHubConnector",
        twilio: "TwilioConnector",
        vercel: "VercelConnector",
        x: "XConnector",
        gdrive: "GDriveConnector",
        onedrive: "OneDriveConnector",
      };

      const mod = await import(importMap[def.name]!);
      const ConnectorClass = mod[classMap[def.name]!];
      const connector = new ConnectorClass();
      await connector.init();

      const health = await connector.health();
      expect(health).toHaveProperty("healthy");
      expect(health).toHaveProperty("latency_ms");
      expect(typeof health.healthy).toBe("boolean");
      expect(typeof health.latency_ms).toBe("number");
    }, 15000);
  }
});

// ---------------------------------------------------------------------------
// Channel interface
// ---------------------------------------------------------------------------

describe("channel interface", () => {
  test("MessageMetadata includes message_id", async () => {
    const { type } = await import("../../src/daemon/services/channels/index.js");
    // We can't check TypeScript types at runtime, but we can verify the file content
    const src = readFileSync(
      join(process.cwd(), "src/daemon/services/channels/index.ts"),
      "utf-8",
    );
    expect(src).toContain("message_id");
  });

  test("ChannelAdapter includes deleteMessage", () => {
    const src = readFileSync(
      join(process.cwd(), "src/daemon/services/channels/index.ts"),
      "utf-8",
    );
    expect(src).toContain("deleteMessage?(target: string, messageId: string | number): Promise<void>;");
  });
});
