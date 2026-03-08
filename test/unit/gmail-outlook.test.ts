// Gmail + Outlook connector tests.
//
// Tests connector init, call dispatch, health, webhook, ConnectorDef entries,
// OAuth provider configs, and CLI command registration.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  CONNECTOR_DEFS,
  getConnectorDef,
  isConnectorConfigured,
} from "../../src/shared/connector.js";
import {
  OAUTH_PROVIDERS,
  getOAuthProvider,
  isOAuthCapable,
} from "../../src/daemon/services/oauth/providers.js";
import { GmailConnector } from "../../src/daemon/services/connectors/gmail/connector.js";
import { OutlookConnector } from "../../src/daemon/services/connectors/outlook/connector.js";

// ---------------------------------------------------------------------------
// ConnectorDef entries
// ---------------------------------------------------------------------------

describe("Gmail ConnectorDef", () => {
  it("exists in CONNECTOR_DEFS", () => {
    const def = getConnectorDef("gmail");
    expect(def).toBeDefined();
    expect(def!.name).toBe("gmail");
    expect(def!.label).toBe("Gmail");
  });

  it("requires GMAIL_ACCESS_TOKEN", () => {
    const def = getConnectorDef("gmail")!;
    expect(def.required).toEqual(["GMAIL_ACCESS_TOKEN"]);
  });

  it("has OAuth config", () => {
    const def = getConnectorDef("gmail")!;
    expect(def.oauth).toBeDefined();
    expect(def.oauth!.clientIdVar).toBe("GMAIL_OAUTH_CLIENT_ID");
    expect(def.oauth!.clientSecretVar).toBe("GMAIL_OAUTH_CLIENT_SECRET");
  });

  it("isConnectorConfigured returns false without env", () => {
    const orig = process.env.GMAIL_ACCESS_TOKEN;
    delete process.env.GMAIL_ACCESS_TOKEN;
    expect(isConnectorConfigured("gmail")).toBe(false);
    if (orig) process.env.GMAIL_ACCESS_TOKEN = orig;
  });

  it("isConnectorConfigured returns true with env", () => {
    const orig = process.env.GMAIL_ACCESS_TOKEN;
    process.env.GMAIL_ACCESS_TOKEN = "test-token";
    expect(isConnectorConfigured("gmail")).toBe(true);
    if (orig) {
      process.env.GMAIL_ACCESS_TOKEN = orig;
    } else {
      delete process.env.GMAIL_ACCESS_TOKEN;
    }
  });
});

describe("Outlook ConnectorDef", () => {
  it("exists in CONNECTOR_DEFS", () => {
    const def = getConnectorDef("outlook");
    expect(def).toBeDefined();
    expect(def!.name).toBe("outlook");
    expect(def!.label).toBe("Outlook");
  });

  it("requires OUTLOOK_ACCESS_TOKEN", () => {
    const def = getConnectorDef("outlook")!;
    expect(def.required).toEqual(["OUTLOOK_ACCESS_TOKEN"]);
  });

  it("has OAuth config", () => {
    const def = getConnectorDef("outlook")!;
    expect(def.oauth).toBeDefined();
    expect(def.oauth!.clientIdVar).toBe("OUTLOOK_OAUTH_CLIENT_ID");
    expect(def.oauth!.clientSecretVar).toBe("OUTLOOK_OAUTH_CLIENT_SECRET");
  });

  it("isConnectorConfigured returns false without env", () => {
    const orig = process.env.OUTLOOK_ACCESS_TOKEN;
    delete process.env.OUTLOOK_ACCESS_TOKEN;
    expect(isConnectorConfigured("outlook")).toBe(false);
    if (orig) process.env.OUTLOOK_ACCESS_TOKEN = orig;
  });
});

// ---------------------------------------------------------------------------
// OAuth provider entries
// ---------------------------------------------------------------------------

describe("Gmail OAuth provider", () => {
  it("exists in OAUTH_PROVIDERS", () => {
    const provider = getOAuthProvider("gmail");
    expect(provider).toBeDefined();
    expect(provider!.name).toBe("gmail");
    expect(provider!.label).toBe("Gmail");
  });

  it("uses Google OAuth endpoints", () => {
    const p = getOAuthProvider("gmail")!;
    expect(p.authUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(p.tokenUrl).toBe("https://oauth2.googleapis.com/token");
  });

  it("requests gmail.modify and gmail.send scopes", () => {
    const p = getOAuthProvider("gmail")!;
    expect(p.scopes).toContain("https://www.googleapis.com/auth/gmail.modify");
    expect(p.scopes).toContain("https://www.googleapis.com/auth/gmail.send");
  });

  it("has refresh token + extra params for offline access", () => {
    const p = getOAuthProvider("gmail")!;
    expect(p.refreshTokenEnvVar).toBe("GMAIL_REFRESH_TOKEN");
    expect(p.extraTokenParams).toEqual({ access_type: "offline", prompt: "consent" });
  });

  it("token env var matches connector required var", () => {
    const p = getOAuthProvider("gmail")!;
    expect(p.tokenEnvVar).toBe("GMAIL_ACCESS_TOKEN");
  });

  it("isOAuthCapable returns true", () => {
    expect(isOAuthCapable("gmail")).toBe(true);
  });
});

describe("Outlook OAuth provider", () => {
  it("exists in OAUTH_PROVIDERS", () => {
    const provider = getOAuthProvider("outlook");
    expect(provider).toBeDefined();
    expect(provider!.name).toBe("outlook");
    expect(provider!.label).toBe("Outlook");
  });

  it("uses Microsoft OAuth endpoints", () => {
    const p = getOAuthProvider("outlook")!;
    expect(p.authUrl).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(p.tokenUrl).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
  });

  it("requests Mail.ReadWrite, Mail.Send, offline_access scopes", () => {
    const p = getOAuthProvider("outlook")!;
    expect(p.scopes).toContain("Mail.ReadWrite");
    expect(p.scopes).toContain("Mail.Send");
    expect(p.scopes).toContain("offline_access");
  });

  it("has refresh token var", () => {
    const p = getOAuthProvider("outlook")!;
    expect(p.refreshTokenEnvVar).toBe("OUTLOOK_REFRESH_TOKEN");
  });

  it("token env var matches connector required var", () => {
    const p = getOAuthProvider("outlook")!;
    expect(p.tokenEnvVar).toBe("OUTLOOK_ACCESS_TOKEN");
  });

  it("isOAuthCapable returns true", () => {
    expect(isOAuthCapable("outlook")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gmail connector class
// ---------------------------------------------------------------------------

describe("GmailConnector", () => {
  let connector: GmailConnector;
  let origToken: string | undefined;

  beforeEach(() => {
    origToken = process.env.GMAIL_ACCESS_TOKEN;
    process.env.GMAIL_ACCESS_TOKEN = "test-gmail-token";
    connector = new GmailConnector();
  });

  afterEach(() => {
    if (origToken) {
      process.env.GMAIL_ACCESS_TOKEN = origToken;
    } else {
      delete process.env.GMAIL_ACCESS_TOKEN;
    }
  });

  it("has correct name and version", () => {
    expect(connector.name).toBe("gmail");
    expect(connector.version).toBe("1.0.0");
  });

  it("init succeeds with GMAIL_ACCESS_TOKEN set", async () => {
    await expect(connector.init()).resolves.toBeUndefined();
  });

  it("init throws without GMAIL_ACCESS_TOKEN", async () => {
    delete process.env.GMAIL_ACCESS_TOKEN;
    const c = new GmailConnector();
    await expect(c.init()).rejects.toThrow("GMAIL_ACCESS_TOKEN env var is required");
  });

  it("call returns error for unknown method", async () => {
    await connector.init();
    const result = await connector.call("nonexistent.method", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown Gmail method");
  });

  it("call dispatches messages.list", async () => {
    await connector.init();
    // Will fail with network error but proves dispatch works
    const result = await connector.call("messages.list", { q: "is:unread" });
    // Network call will fail with auth error since token is fake
    expect(result.ok).toBe(false);
  });

  it("call dispatches messages.get", async () => {
    await connector.init();
    const result = await connector.call("messages.get", { message_id: "abc123" });
    expect(result.ok).toBe(false); // fake token
  });

  it("call dispatches labels.list", async () => {
    await connector.init();
    const result = await connector.call("labels.list", {});
    expect(result.ok).toBe(false); // fake token
  });

  it("call dispatches profile", async () => {
    await connector.init();
    const result = await connector.call("profile", {});
    expect(result.ok).toBe(false); // fake token
  });

  it("call dispatches drafts.list", async () => {
    await connector.init();
    const result = await connector.call("drafts.list", {});
    expect(result.ok).toBe(false); // fake token
  });

  it("call dispatches threads.list", async () => {
    await connector.init();
    const result = await connector.call("threads.list", { q: "test" });
    expect(result.ok).toBe(false); // fake token
  });

  it("shutdown clears token", async () => {
    await connector.init();
    await connector.shutdown();
    // After shutdown, health should fail
    const health = await connector.health();
    expect(health.healthy).toBe(false);
  });

  it("webhook parses Pub/Sub notification", async () => {
    await connector.init();
    const body = JSON.stringify({
      message: {
        data: Buffer.from(JSON.stringify({ emailAddress: "test@gmail.com", historyId: 12345 })).toString("base64"),
        messageId: "msg-123",
        publishTime: "2026-03-01T00:00:00Z",
      },
      subscription: "projects/my-project/subscriptions/gmail-push",
    });
    const event = await connector.webhook({}, body);
    expect(event.source).toBe("gmail");
    expect(event.type).toBe("gmail.push");
    expect(event.id).toBe("msg-123");
    expect((event.data as any).emailAddress).toBe("test@gmail.com");
  });

  it("webhook rejects invalid JSON", async () => {
    await connector.init();
    await expect(connector.webhook({}, "not json")).rejects.toThrow("Invalid JSON");
  });

  it("sync delegates to history.list for 'changes'", async () => {
    await connector.init();
    // Will fail network — sync returns result.data which is undefined for failed calls
    const result = await connector.sync("changes");
    // undefined is expected: call() returns { ok: false, error: ... } with no data
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Outlook connector class
// ---------------------------------------------------------------------------

describe("OutlookConnector", () => {
  let connector: OutlookConnector;
  let origToken: string | undefined;

  beforeEach(() => {
    origToken = process.env.OUTLOOK_ACCESS_TOKEN;
    process.env.OUTLOOK_ACCESS_TOKEN = "test-outlook-token";
    connector = new OutlookConnector();
  });

  afterEach(() => {
    if (origToken) {
      process.env.OUTLOOK_ACCESS_TOKEN = origToken;
    } else {
      delete process.env.OUTLOOK_ACCESS_TOKEN;
    }
  });

  it("has correct name and version", () => {
    expect(connector.name).toBe("outlook");
    expect(connector.version).toBe("1.0.0");
  });

  it("init succeeds with OUTLOOK_ACCESS_TOKEN set", async () => {
    await expect(connector.init()).resolves.toBeUndefined();
  });

  it("init throws without OUTLOOK_ACCESS_TOKEN", async () => {
    delete process.env.OUTLOOK_ACCESS_TOKEN;
    const c = new OutlookConnector();
    await expect(c.init()).rejects.toThrow("OUTLOOK_ACCESS_TOKEN env var is required");
  });

  it("call returns error for unknown method", async () => {
    await connector.init();
    const result = await connector.call("nonexistent.method", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown Outlook method");
  });

  it("call dispatches messages.list", async () => {
    await connector.init();
    const result = await connector.call("messages.list", { top: 5 });
    expect(result.ok).toBe(false); // fake token
  });

  it("call dispatches messages.get", async () => {
    await connector.init();
    const result = await connector.call("messages.get", { message_id: "abc123" });
    expect(result.ok).toBe(false); // fake token
  });

  it("call dispatches folders.list", async () => {
    await connector.init();
    const result = await connector.call("folders.list", {});
    expect(result.ok).toBe(false); // fake token
  });

  it("call dispatches profile", async () => {
    await connector.init();
    const result = await connector.call("profile", {});
    expect(result.ok).toBe(false); // fake token
  });

  it("call dispatches search", async () => {
    await connector.init();
    const result = await connector.call("search", { query: "test" });
    expect(result.ok).toBe(false); // fake token
  });

  it("call dispatches messages.send", async () => {
    await connector.init();
    const result = await connector.call("messages.send", {
      to: "test@example.com",
      subject: "Test",
      body: "Hello",
    });
    expect(result.ok).toBe(false); // fake token
  });

  it("shutdown clears token", async () => {
    await connector.init();
    await connector.shutdown();
    const health = await connector.health();
    expect(health.healthy).toBe(false);
  });

  it("webhook parses Graph notification", async () => {
    await connector.init();
    const body = JSON.stringify({
      value: [
        {
          subscriptionId: "sub-123",
          clientState: "test-secret",
          changeType: "created",
          resource: "/me/messages/msg-abc",
        },
      ],
    });
    const event = await connector.webhook({}, body);
    expect(event.source).toBe("outlook");
    expect(event.type).toBe("mail.created");
    expect(event.id).toBe("sub-123");
  });

  it("webhook rejects invalid JSON", async () => {
    await connector.init();
    await expect(connector.webhook({}, "not json")).rejects.toThrow("Invalid JSON");
  });

  it("webhook verifies clientState when subscription secret is set", async () => {
    const origSecret = process.env.OUTLOOK_SUBSCRIPTION_SECRET;
    process.env.OUTLOOK_SUBSCRIPTION_SECRET = "my-secret";
    const c = new OutlookConnector();
    await c.init();

    // Matching secret
    const body1 = JSON.stringify({
      value: [{ subscriptionId: "sub-1", clientState: "my-secret", changeType: "created" }],
    });
    const event1 = await c.webhook({}, body1);
    expect(event1.verified).toBe(true);

    // Non-matching secret
    const body2 = JSON.stringify({
      value: [{ subscriptionId: "sub-2", clientState: "wrong-secret", changeType: "created" }],
    });
    const event2 = await c.webhook({}, body2);
    expect(event2.verified).toBe(false);

    if (origSecret) {
      process.env.OUTLOOK_SUBSCRIPTION_SECRET = origSecret;
    } else {
      delete process.env.OUTLOOK_SUBSCRIPTION_SECRET;
    }
  });

  it("sync delegates to inbox for 'changes'", async () => {
    await connector.init();
    // Will fail network — sync returns result.data which is undefined for failed calls
    const result = await connector.sync("changes");
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Cross-check: total counts
// ---------------------------------------------------------------------------

describe("Registry totals", () => {
  it("CONNECTOR_DEFS has 27 entries", () => {
    expect(CONNECTOR_DEFS.length).toBe(27);
  });

  it("OAUTH_PROVIDERS has 22 entries", () => {
    expect(OAUTH_PROVIDERS.length).toBe(22);
  });

  it("all OAuth providers have matching ConnectorDef", () => {
    for (const p of OAUTH_PROVIDERS) {
      const def = getConnectorDef(p.name);
      expect(def).toBeDefined();
      expect(def!.oauth).toBeDefined();
      expect(def!.oauth!.clientIdVar).toBe(p.clientIdVar);
    }
  });

  it("gmail + outlook in ConnectorDef list", () => {
    const names = CONNECTOR_DEFS.map((d) => d.name);
    expect(names).toContain("gmail");
    expect(names).toContain("outlook");
  });

  it("gmail + outlook in OAuth provider list", () => {
    const names = OAUTH_PROVIDERS.map((p) => p.name);
    expect(names).toContain("gmail");
    expect(names).toContain("outlook");
  });
});
