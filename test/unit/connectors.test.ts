// Comprehensive connector tests — all 10 connectors tested through the unified factory.
//
// Tests: factory loading, init, call dispatch (known + unknown methods),
// ConnectorDef registration, CONNECTOR_FACTORIES coverage, unified CLI dispatch.
//
// Note: PayPal's init() makes a real HTTP call (OAuth2 client_credentials) so
// tests that require init() use direct class instantiation with manual field
// setup instead of loadConnector(). All other 9 connectors just read env vars.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type { ConnectorInterface } from "../../src/daemon/services/connectors/interface.js";
import {
  CONNECTOR_DEFS,
  getConnectorDef,
  isConnectorConfigured,
  getConfiguredConnectorCount,
} from "../../src/shared/connector.js";
import {
  CONNECTOR_FACTORIES,
  loadConnector,
} from "../../src/cli/commands/integrations/connectors.js";

// ---------------------------------------------------------------------------
// Env var setup per connector — minimum required vars for init()
// ---------------------------------------------------------------------------

interface EnvFixture {
  name: string;
  vars: Record<string, string>;
  /** One known method from the connector's call() handler. */
  knownMethod: string;
  /** Params for the known method. */
  knownParams: Record<string, unknown>;
  /** Expected error message substring for unknown methods. */
  unknownMethodError: string;
  /** If true, init() makes a network call — skip loadConnector tests. */
  networkInit?: boolean;
}

const FIXTURES: EnvFixture[] = [
  {
    name: "stripe",
    vars: { STRIPE_SECRET_KEY: "sk_test_fake123" },
    knownMethod: "balance.retrieve",
    knownParams: {},
    unknownMethodError: "Unknown Stripe method",
  },
  {
    name: "paypal",
    vars: { PAYPAL_ACCESS_TOKEN: "fake-access-token" },
    knownMethod: "webhooks.list",
    knownParams: {},
    unknownMethodError: "Unknown PayPal method",
    networkInit: false,
  },
  {
    name: "github",
    vars: { GITHUB_TOKEN: "ghp_faketoken123456" },
    knownMethod: "repos.list",
    knownParams: {},
    unknownMethodError: "Unknown GitHub method",
  },
  {
    name: "twilio",
    vars: { TWILIO_ACCOUNT_SID: "ACfakeaccountsid123", TWILIO_AUTH_TOKEN: "fakeauthtoken456" },
    knownMethod: "account.get",
    knownParams: {},
    unknownMethodError: "Unknown Twilio method",
  },
  {
    name: "vercel",
    vars: { VERCEL_TOKEN: "fake-vercel-token-123" },
    knownMethod: "projects.list",
    knownParams: {},
    unknownMethodError: "Unknown Vercel method",
  },
  {
    name: "x",
    vars: { X_BEARER_TOKEN: "fake-x-bearer-token" },
    knownMethod: "tweets.search",
    knownParams: { query: "test" },
    unknownMethodError: "Unknown X method",
  },
  {
    name: "gdrive",
    vars: { GDRIVE_ACCESS_TOKEN: "fake-gdrive-token" },
    knownMethod: "files.list",
    knownParams: {},
    unknownMethodError: "Unknown Google Drive method",
  },
  {
    name: "gmail",
    vars: { GMAIL_ACCESS_TOKEN: "fake-gmail-token" },
    knownMethod: "messages.list",
    knownParams: {},
    unknownMethodError: "Unknown Gmail method",
  },
];

// ---------------------------------------------------------------------------
// Helper: save/restore env
// ---------------------------------------------------------------------------

function saveEnv(keys: string[]): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) {
    saved[key] = process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// CONNECTOR_FACTORIES coverage
// ---------------------------------------------------------------------------

describe("CONNECTOR_FACTORIES", () => {
  it("has entries for all 10 connectors", () => {
    const factoryNames = Object.keys(CONNECTOR_FACTORIES).sort();
    const defNames = CONNECTOR_DEFS.map((d) => d.name).sort();
    expect(factoryNames).toEqual(defNames);
  });

  it("every factory is an async function", () => {
    for (const [, factory] of Object.entries(CONNECTOR_FACTORIES)) {
      expect(typeof factory).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// Per-connector tests via fixtures
// ---------------------------------------------------------------------------

for (const fixture of FIXTURES) {
  describe(`${fixture.name} connector`, () => {
    let saved: Record<string, string | undefined>;

    beforeEach(() => {
      saved = saveEnv(Object.keys(fixture.vars));
      for (const [key, value] of Object.entries(fixture.vars)) {
        process.env[key] = value;
      }
    });

    afterEach(() => {
      restoreEnv(saved);
    });

    it("factory loads the connector class", async () => {
      const factory = CONNECTOR_FACTORIES[fixture.name];
      expect(factory).toBeDefined();
      const Ctor = await factory!();
      expect(typeof Ctor).toBe("function");
      const instance = new Ctor();
      expect(instance.name).toBe(fixture.name);
    });

    if (!fixture.networkInit) {
      it("loadConnector initializes successfully", async () => {
        const connector = await loadConnector(fixture.name);
        expect(connector.name).toBe(fixture.name);
      });

      it("call returns error for unknown method", async () => {
        const connector = await loadConnector(fixture.name);
        const result = await connector.call("definitely.unknown.method.xyz", {});
        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
      });

      it(`call dispatches known method: ${fixture.knownMethod}`, async () => {
        const connector = await loadConnector(fixture.name);
        const result = await connector.call(fixture.knownMethod, fixture.knownParams);
        // Known methods will fail because tokens are fake, but dispatch works —
        // the key assertion is that it didn't return "Unknown method" error
        if (!result.ok) {
          expect(result.error).not.toContain(fixture.unknownMethodError);
        }
      });

      it("shutdown does not throw", async () => {
        const connector = await loadConnector(fixture.name);
        await expect(connector.shutdown()).resolves.toBeUndefined();
      });
    }

    if (fixture.networkInit) {
      it("factory instantiation works (without init)", async () => {
        const factory = CONNECTOR_FACTORIES[fixture.name]!;
        const Ctor = await factory();
        const instance = new Ctor();
        expect(instance.name).toBe(fixture.name);
        expect(instance.version).toBeTruthy();
      });

      it("init throws without required vars", async () => {
        for (const key of Object.keys(fixture.vars)) {
          delete process.env[key];
        }
        const factory = CONNECTOR_FACTORIES[fixture.name]!;
        const Ctor = await factory();
        const instance = new Ctor();
        await expect(instance.init()).rejects.toThrow();
      });
    }

    it("init throws without required env vars", async () => {
      for (const key of Object.keys(fixture.vars)) {
        delete process.env[key];
      }
      if (fixture.networkInit) {
        // PayPal: test direct instantiation
        const factory = CONNECTOR_FACTORIES[fixture.name]!;
        const Ctor = await factory();
        const instance = new Ctor();
        await expect(instance.init()).rejects.toThrow();
      } else {
        await expect(loadConnector(fixture.name)).rejects.toThrow();
      }
    });

    it("has matching ConnectorDef", () => {
      const def = getConnectorDef(fixture.name);
      expect(def).toBeDefined();
      expect(def!.name).toBe(fixture.name);
    });

    it("isConnectorConfigured returns true with vars set", () => {
      expect(isConnectorConfigured(fixture.name)).toBe(true);
    });

    it("isConnectorConfigured returns false with vars cleared", () => {
      for (const key of Object.keys(fixture.vars)) {
        delete process.env[key];
      }
      expect(isConnectorConfigured(fixture.name)).toBe(false);
    });
  });
}

// ---------------------------------------------------------------------------
// loadConnector edge cases
// ---------------------------------------------------------------------------

describe("loadConnector", () => {
  it("throws for unknown connector name", async () => {
    await expect(loadConnector("nonexistent")).rejects.toThrow("Unknown connector");
  });

  it("throws for empty string", async () => {
    await expect(loadConnector("")).rejects.toThrow("Unknown connector");
  });
});

// ---------------------------------------------------------------------------
// All connector call() dispatch — verify every handler key resolves
// 9 connectors (excluding PayPal which needs network for init)
// ---------------------------------------------------------------------------

describe("Gmail call dispatch (all 21 methods)", () => {
  let connector: ConnectorInterface;

  beforeEach(async () => {
    process.env.GMAIL_ACCESS_TOKEN = "fake-gmail-token";
    connector = await loadConnector("gmail");
  });

  afterEach(() => {
    delete process.env.GMAIL_ACCESS_TOKEN;
  });

  const methods = [
    "messages.list", "messages.get", "messages.send", "messages.delete",
    "messages.trash", "messages.untrash", "messages.modify",
    "labels.list", "labels.get", "labels.create", "labels.delete",
    "drafts.list", "drafts.get", "drafts.create", "drafts.send", "drafts.delete",
    "threads.list", "threads.get", "threads.trash",
    "profile", "history.list",
  ];

  for (const method of methods) {
    it(`dispatches ${method}`, async () => {
      const result = await connector.call(method, { id: "test-id", message_id: "test-id", label_id: "test-id", draft_id: "test-id", thread_id: "test-id", raw: "dGVzdA==" });
      if (!result.ok) {
        expect(result.error).not.toContain("Unknown Gmail method");
      }
    });
  }
});

describe("GDrive call dispatch (all 11 methods)", () => {
  let connector: ConnectorInterface;

  beforeEach(async () => {
    process.env.GDRIVE_ACCESS_TOKEN = "fake-gdrive-token";
    connector = await loadConnector("gdrive");
  });

  afterEach(() => {
    delete process.env.GDRIVE_ACCESS_TOKEN;
  });

  const methods = [
    "files.list", "files.get", "files.create", "files.update", "files.delete",
    "files.copy", "files.export",
    "permissions.list", "permissions.create", "permissions.delete",
    "changes.watch",
  ];

  for (const method of methods) {
    it(`dispatches ${method}`, async () => {
      const result = await connector.call(method, { file_id: "test-id", permission_id: "test-id", mimeType: "text/plain", webhook_url: "https://example.com" });
      if (!result.ok) {
        expect(result.error).not.toContain("Unknown Google Drive method");
      }
    });
  }
});

describe("Stripe call dispatch (all 40 methods)", () => {
  let connector: ConnectorInterface;

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake123";
    connector = await loadConnector("stripe");
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  const methods = [
    "charges.create", "charges.retrieve", "charges.list",
    "customers.create", "customers.retrieve", "customers.list",
    "subscriptions.create", "subscriptions.retrieve", "subscriptions.cancel", "subscriptions.list",
    "payment_intents.create", "payment_intents.retrieve", "payment_intents.confirm",
    "invoices.create", "invoices.retrieve", "invoices.list", "invoices.finalize", "invoices.send", "invoices.void",
    "refunds.create", "refunds.list", "refunds.get",
    "balance.retrieve",
    "products.create", "products.list", "products.get", "products.update", "products.delete",
    "prices.create", "prices.list", "prices.get",
    "payouts.create", "payouts.list", "payouts.get",
    "events.list", "events.get",
    "webhooks.list", "webhooks.create", "webhooks.delete",
    "checkout.create", "checkout.list", "checkout.get",
    "payment_links.create", "payment_links.list", "payment_links.get",
  ];

  for (const method of methods) {
    it(`dispatches ${method}`, async () => {
      const result = await connector.call(method, { id: "test_id", amount: 100, currency: "usd", customer: "cus_test", email: "test@test.com", name: "test", url: "https://example.com" });
      if (!result.ok) {
        expect(result.error).not.toContain("Unknown Stripe method");
      }
    });
  }
});

describe("GitHub call dispatch (all 21 methods)", () => {
  let connector: ConnectorInterface;

  beforeEach(async () => {
    process.env.GITHUB_TOKEN = "ghp_faketoken123456";
    connector = await loadConnector("github");
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  const methods = [
    "repos.get", "repos.list", "repos.create",
    "issues.list", "issues.create", "issues.get", "issues.update",
    "pulls.list", "pulls.create", "pulls.get", "pulls.merge",
    "actions.list_runs", "actions.trigger",
    "releases.list", "releases.create",
    "search.repos", "search.issues", "search.code",
    "gists.list", "gists.create", "gists.get",
  ];

  for (const method of methods) {
    it(`dispatches ${method}`, async () => {
      const result = await connector.call(method, { owner: "test", repo: "test", title: "test", body: "test", query: "test", tag_name: "v1.0.0", head: "main", base: "dev", number: 1, run_id: "1", gist_id: "test" });
      if (!result.ok) {
        expect(result.error).not.toContain("Unknown GitHub method");
      }
    });
  }
});

describe("X call dispatch (all 10 read methods)", () => {
  let connector: ConnectorInterface;

  beforeEach(async () => {
    process.env.X_BEARER_TOKEN = "fake-x-bearer-token";
    connector = await loadConnector("x");
  });

  afterEach(() => {
    delete process.env.X_BEARER_TOKEN;
  });

  const methods = [
    "tweets.get", "tweets.search",
    "users.get", "users.by_username", "users.followers", "users.following", "users.timeline",
    "bookmarks.list",
    "lists.list", "lists.get",
  ];

  for (const method of methods) {
    it(`dispatches ${method}`, async () => {
      const result = await connector.call(method, { id: "test-id", user_id: "test-id", username: "test", query: "test", list_id: "test-id" });
      if (!result.ok) {
        expect(result.error).not.toContain("Unknown X method");
      }
    });
  }
});

describe("Twilio call dispatch (all 8 read methods)", () => {
  let connector: ConnectorInterface;

  beforeEach(async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACfakeaccountsid123";
    process.env.TWILIO_AUTH_TOKEN = "fakeauthtoken456";
    connector = await loadConnector("twilio");
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  const methods = [
    "messages.list", "messages.get",
    "calls.list", "calls.get",
    "recordings.list", "recordings.get",
    "account.get",
    "numbers.list",
  ];

  for (const method of methods) {
    it(`dispatches ${method}`, async () => {
      const result = await connector.call(method, { sid: "SM_fake_sid", to: "+1234567890", body: "test", from: "+0987654321", phone_number: "+1234567890" });
      if (!result.ok) {
        expect(result.error).not.toContain("Unknown Twilio method");
      }
    });
  }
});

describe("Vercel call dispatch (all 16 methods)", () => {
  let connector: ConnectorInterface;

  beforeEach(async () => {
    process.env.VERCEL_TOKEN = "fake-vercel-token";
    connector = await loadConnector("vercel");
  });

  afterEach(() => {
    delete process.env.VERCEL_TOKEN;
  });

  const methods = [
    "deployments.list", "deployments.get", "deployments.create", "deployments.cancel", "deployments.delete",
    "projects.list", "projects.get", "projects.create", "projects.delete",
    "domains.list", "domains.add", "domains.remove",
    "env.list", "env.create", "env.delete",
    "team.get",
    "logs.list",
  ];

  for (const method of methods) {
    it(`dispatches ${method}`, async () => {
      const result = await connector.call(method, { id: "test-id", name: "test", domain: "test.com", project_id: "test", key: "VAR", value: "val", target: ["production"] });
      if (!result.ok) {
        expect(result.error).not.toContain("Unknown Vercel method");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// PayPal — test call dispatch with direct instantiation (bypassing init's network call)
// ---------------------------------------------------------------------------

describe("PayPal connector (direct instantiation)", () => {
  it("has correct name and version", async () => {
    const { PayPalConnector } = await import("../../src/daemon/services/connectors/paypal/connector.js");
    const connector = new PayPalConnector();
    expect(connector.name).toBe("paypal");
    expect(connector.version).toBeTruthy();
  });

  it("init throws without env vars", async () => {
    const origToken = process.env.PAYPAL_ACCESS_TOKEN;
    delete process.env.PAYPAL_ACCESS_TOKEN;

    const { PayPalConnector } = await import("../../src/daemon/services/connectors/paypal/connector.js");
    const connector = new PayPalConnector();
    await expect(connector.init()).rejects.toThrow("PAYPAL_ACCESS_TOKEN");

    if (origToken) process.env.PAYPAL_ACCESS_TOKEN = origToken;
  });

  it("call returns error for unknown method (without init — proves dispatch)", async () => {
    const { PayPalConnector } = await import("../../src/daemon/services/connectors/paypal/connector.js");
    const connector = new PayPalConnector();
    // Calling without init — the method dispatch still works but will fail
    // because there's no access token. The important thing is it doesn't crash.
    const result = await connector.call("nonexistent.method", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown PayPal method");
  });
});

// ---------------------------------------------------------------------------
// getConfiguredConnectorCount — unified connector usage count
// ---------------------------------------------------------------------------

describe("getConfiguredConnectorCount", () => {
  const savedEnv: Record<string, string | undefined> = {};

  // Save and clear all connector env vars before each test
  beforeEach(() => {
    const allVars = CONNECTOR_DEFS.flatMap((d) => [
      ...d.required.flatMap((e) => (Array.isArray(e) ? e : [e])),
      ...d.optional,
    ]);
    for (const v of allVars) {
      savedEnv[v] = process.env[v];
      delete process.env[v];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("returns 0 when no connectors are configured", () => {
    expect(getConfiguredConnectorCount()).toBe(0);
  });

  it("counts single configured connector", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    expect(getConfiguredConnectorCount()).toBe(1);
  });

  it("counts multiple configured connectors", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.GITHUB_TOKEN = "ghp_fake";
    process.env.TWILIO_ACCOUNT_SID = "AC_fake";
    process.env.TWILIO_AUTH_TOKEN = "fake_auth";
    expect(getConfiguredConnectorCount()).toBe(3);
  });

  it("does not count partially configured connectors", () => {
    // PayPal needs BOTH client_id and client_secret
    process.env.PAYPAL_CLIENT_ID = "fake_id";
    // Missing PAYPAL_CLIENT_SECRET
    expect(getConfiguredConnectorCount()).toBe(0);
  });

  it("counts connector with alternative env vars", () => {
    // GitHub accepts GITHUB_TOKEN or GH_TOKEN
    process.env.GH_TOKEN = "ghp_fake";
    expect(getConfiguredConnectorCount()).toBe(1);
  });

  it("is consistent with isConnectorConfigured", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.GITHUB_TOKEN = "ghp_fake";

    const manualCount = CONNECTOR_DEFS.filter((d) => isConnectorConfigured(d.name)).length;
    expect(getConfiguredConnectorCount()).toBe(manualCount);
  });
});
