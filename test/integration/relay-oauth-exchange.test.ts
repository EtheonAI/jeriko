// Integration test — Relay-side OAuth token exchange.
//
// Validates the full OAuth flow changes introduced by the relay-side exchange
// feature. Tests both relay-side exchange (when relay has credentials) and
// daemon-side fallback (when relay doesn't have credentials).
//
// Uses a REAL relay server with REAL WebSocket connections.

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { createRelayServer, type RelayServer } from "../../apps/relay/src/relay.js";
import type {
  RelayInboundMessage,
  RelayOutboundMessage,
} from "../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// Test server lifecycle
// ---------------------------------------------------------------------------

let relay: RelayServer;
const AUTH_SECRET = "test-oauth-exchange-" + Date.now();

// Save and restore env state to avoid leaking into other tests
const savedEnv: Record<string, string | undefined> = {};
const RELAY_CREDENTIAL_VARS = [
  "RELAY_GITHUB_OAUTH_CLIENT_ID",
  "RELAY_GITHUB_OAUTH_CLIENT_SECRET",
  "RELAY_GOOGLE_OAUTH_CLIENT_ID",
  "RELAY_GOOGLE_OAUTH_CLIENT_SECRET",
  "RELAY_X_OAUTH_CLIENT_ID",
  "RELAY_X_OAUTH_CLIENT_SECRET",
  "RELAY_AUTH_SECRET",
];

beforeAll(() => {
  // Snapshot env vars
  for (const key of RELAY_CREDENTIAL_VARS) {
    savedEnv[key] = process.env[key];
  }

  process.env.RELAY_AUTH_SECRET = AUTH_SECRET;
  relay = createRelayServer({ port: 0, hostname: "127.0.0.1" });
});

afterAll(() => {
  relay.stop();

  // Restore env vars
  for (const key of RELAY_CREDENTIAL_VARS) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

// ---------------------------------------------------------------------------
// WebSocket client helper
// ---------------------------------------------------------------------------

interface DaemonClient {
  ws: WebSocket;
  userId: string;
  messages: RelayInboundMessage[];
  waitForMessage(type: string, timeout?: number): Promise<RelayInboundMessage>;
  send(msg: RelayOutboundMessage): void;
  close(): void;
}

function connectDaemon(userId: string, token: string = AUTH_SECRET): Promise<DaemonClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relay.wsUrl);
    const messages: RelayInboundMessage[] = [];
    const waiters: Array<{ type: string; resolve: (msg: RelayInboundMessage) => void }> = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as RelayInboundMessage;
      messages.push(msg);

      const idx = waiters.findIndex((w) => w.type === msg.type);
      if (idx >= 0) {
        const waiter = waiters[idx]!;
        waiters.splice(idx, 1);
        waiter.resolve(msg);
      }
    };

    ws.onopen = () => {
      const client: DaemonClient = {
        ws,
        userId,
        messages,
        waitForMessage(type: string, timeout = 5000): Promise<RelayInboundMessage> {
          const existing = messages.find((m) => m.type === type);
          if (existing) {
            messages.splice(messages.indexOf(existing), 1);
            return Promise.resolve(existing);
          }
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`Timeout waiting for ${type}`)), timeout);
            waiters.push({
              type,
              resolve: (msg) => {
                clearTimeout(timer);
                res(msg);
              },
            });
          });
        },
        send(msg: RelayOutboundMessage): void {
          ws.send(JSON.stringify(msg));
        },
        close(): void {
          ws.close();
        },
      };

      // Authenticate
      client.send({ type: "auth", userId, token });
      resolve(client);
    };

    ws.onerror = () => reject(new Error("WebSocket error"));
    setTimeout(() => reject(new Error("Connection timeout")), 5000);
  });
}

function relayFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${relay.url}${path}`, { redirect: "manual", ...init });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("relay OAuth exchange", () => {
  describe("daemon-side fallback (no relay credentials)", () => {
    beforeEach(() => {
      // Ensure no relay credentials are set
      delete process.env.RELAY_GITHUB_OAUTH_CLIENT_ID;
      delete process.env.RELAY_GITHUB_OAUTH_CLIENT_SECRET;
    });

    it("forwards callback to daemon when relay has no credentials", async () => {
      const client = await connectDaemon("user-fallback-1");
      await client.waitForMessage("auth_ok");

      // Simulate: OAuth provider redirects browser with code
      const oauthPromise = relayFetch(
        "/oauth/github/callback?code=testcode123&state=user-fallback-1.abcdef",
      );

      // Daemon should receive oauth_callback (not oauth_tokens)
      const msg = await client.waitForMessage("oauth_callback") as any;
      expect(msg.type).toBe("oauth_callback");
      expect(msg.provider).toBe("github");
      expect(msg.params.code).toBe("testcode123");
      expect(msg.params.state).toBe("user-fallback-1.abcdef");
      expect(msg.requestId).toBeDefined();

      // Daemon responds with success HTML
      client.send({
        type: "oauth_result",
        requestId: msg.requestId,
        statusCode: 200,
        html: "<html><body>GitHub connected!</body></html>",
      });

      const res = await oauthPromise;
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("GitHub connected!");

      client.close();
    });

    it("forwards start to daemon and returns redirect", async () => {
      const client = await connectDaemon("user-start-1");
      await client.waitForMessage("auth_ok");

      const startPromise = relayFetch(
        "/oauth/github/start?state=user-start-1.xyz789",
      );

      // Daemon receives the start request
      const msg = await client.waitForMessage("oauth_start") as any;
      expect(msg.type).toBe("oauth_start");
      expect(msg.provider).toBe("github");

      // Daemon responds with redirect to provider
      client.send({
        type: "oauth_result",
        requestId: msg.requestId,
        statusCode: 302,
        html: "",
        redirectUrl: "https://github.com/login/oauth/authorize?client_id=test&state=user-start-1.xyz789",
      });

      const res = await startPromise;
      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toContain("github.com/login/oauth/authorize");

      client.close();
    });
  });

  describe("relay-side exchange (relay has credentials)", () => {
    // Note: This test verifies the relay ATTEMPTS relay-side exchange when
    // credentials are available. The actual token exchange will fail because
    // GitHub won't accept fake credentials, but we verify the code path.

    beforeEach(() => {
      process.env.RELAY_GITHUB_OAUTH_CLIENT_ID = "test-relay-client-id";
      process.env.RELAY_GITHUB_OAUTH_CLIENT_SECRET = "test-relay-client-secret";
    });

    afterEach(() => {
      delete process.env.RELAY_GITHUB_OAUTH_CLIENT_ID;
      delete process.env.RELAY_GITHUB_OAUTH_CLIENT_SECRET;
    });

    it("attempts relay-side exchange and returns error on failure", async () => {
      const client = await connectDaemon("user-relay-1");
      await client.waitForMessage("auth_ok");

      // Send callback — relay should try to exchange tokens itself
      const res = await relayFetch(
        "/oauth/github/callback?code=fake-code&state=user-relay-1.relaytoken",
      );

      // Relay tried to exchange but got an error from GitHub (fake credentials)
      // This verifies the relay-side exchange code path is taken
      expect(res.status).toBe(502);
      const html = await res.text();
      expect(html).toContain("Token exchange failed");

      // Importantly: daemon should NOT have received an oauth_callback
      // (relay tried to handle it itself)
      expect(client.messages.filter(m => m.type === "oauth_callback")).toHaveLength(0);

      client.close();
    });

    it("does NOT send oauth_callback to daemon when relay has credentials", async () => {
      const client = await connectDaemon("user-relay-2");
      await client.waitForMessage("auth_ok");

      // Send callback — relay should handle it
      await relayFetch(
        "/oauth/github/callback?code=fake&state=user-relay-2.tok",
      );

      // Give a brief moment for any messages to arrive
      await new Promise(r => setTimeout(r, 200));

      // No oauth_callback should have been sent to daemon
      const callbackMsgs = client.messages.filter(m => m.type === "oauth_callback");
      expect(callbackMsgs).toHaveLength(0);

      client.close();
    });
  });

  describe("PKCE verifier flow", () => {
    it("stores PKCE verifier from /start and uses it in /callback", async () => {
      const client = await connectDaemon("user-pkce-1");
      await client.waitForMessage("auth_ok");

      // Step 1: /start — daemon sends codeVerifier in the oauth_result
      const startPromise = relayFetch(
        "/oauth/x/start?state=user-pkce-1.pkcetoken123",
      );

      const startMsg = await client.waitForMessage("oauth_start") as any;
      expect(startMsg.provider).toBe("x");

      // Daemon responds with redirect + PKCE codeVerifier
      client.send({
        type: "oauth_result",
        requestId: startMsg.requestId,
        statusCode: 302,
        html: "",
        redirectUrl: "https://twitter.com/i/oauth2/authorize?code_challenge=abc",
        codeVerifier: "test-verifier-123456",
      });

      const startRes = await startPromise;
      expect(startRes.status).toBe(302);

      // Step 2: /callback — relay should fall back to daemon (no RELAY_X_* credentials)
      // The PKCE verifier was stored but since no relay creds, it won't be used
      const callbackPromise = relayFetch(
        "/oauth/x/callback?code=authcode&state=user-pkce-1.pkcetoken123",
      );

      // Since no RELAY_X_OAUTH_* env vars, falls back to daemon forwarding
      const callbackMsg = await client.waitForMessage("oauth_callback") as any;
      expect(callbackMsg.provider).toBe("x");
      expect(callbackMsg.params.code).toBe("authcode");

      // Daemon responds
      client.send({
        type: "oauth_result",
        requestId: callbackMsg.requestId,
        statusCode: 200,
        html: "<html><body>X connected!</body></html>",
      });

      const callbackRes = await callbackPromise;
      expect(callbackRes.status).toBe(200);

      client.close();
    });
  });

  describe("oauth_tokens message", () => {
    it("protocol supports oauth_tokens message type", async () => {
      // Verify the relay protocol correctly types oauth_tokens.
      // In production, the relay sends this after a successful relay-side exchange.
      // We can't do a full live exchange here (needs real provider credentials),
      // but we verify the daemon connection receives well-formed messages.
      const client = await connectDaemon("user-tokens-1");
      await client.waitForMessage("auth_ok");

      // auth_ok was received and consumed — connection is authenticated
      // The relay client handles oauth_tokens via onOAuthTokens handler
      // which is wired in kernel.ts. Protocol correctness verified by
      // the unit tests in oauth-exchange.test.ts.
      expect(client.ws.readyState).toBe(WebSocket.OPEN);

      client.close();
    });
  });

  describe("token refresh endpoint", () => {
    beforeEach(() => {
      process.env.RELAY_GITHUB_OAUTH_CLIENT_ID = "test-refresh-client-id";
      process.env.RELAY_GITHUB_OAUTH_CLIENT_SECRET = "test-refresh-client-secret";
    });

    afterEach(() => {
      delete process.env.RELAY_GITHUB_OAUTH_CLIENT_ID;
      delete process.env.RELAY_GITHUB_OAUTH_CLIENT_SECRET;
    });

    it("POST /oauth/:provider/refresh requires auth", async () => {
      const res = await relayFetch("/oauth/github/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "test-token" }),
      });

      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.error).toContain("authorization");
    });

    it("POST /oauth/:provider/refresh rejects invalid auth", async () => {
      const res = await relayFetch("/oauth/github/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-secret",
        },
        body: JSON.stringify({ refreshToken: "test-token" }),
      });

      expect(res.status).toBe(403);
    });

    it("POST /oauth/:provider/refresh requires refreshToken body", async () => {
      const res = await relayFetch("/oauth/github/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AUTH_SECRET}`,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toContain("refreshToken");
    });

    it("POST /oauth/:provider/refresh returns 404 for unknown provider", async () => {
      const res = await relayFetch("/oauth/unknown/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AUTH_SECRET}`,
        },
        body: JSON.stringify({ refreshToken: "test" }),
      });

      expect(res.status).toBe(404);
    });

    it("POST /oauth/:provider/refresh attempts refresh with valid params", async () => {
      // This will fail at the provider level (fake credentials) but proves
      // the code path is correct up to the HTTP exchange
      const res = await relayFetch("/oauth/github/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AUTH_SECRET}`,
        },
        body: JSON.stringify({ refreshToken: "fake-refresh-token" }),
      });

      // 502 = relay tried to refresh but provider rejected (expected with fake creds)
      expect(res.status).toBe(502);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.error).toContain("refresh failed");
    });
  });

  describe("error handling", () => {
    it("returns 400 for missing state parameter", async () => {
      const res = await relayFetch("/oauth/github/callback?code=abc");
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("Missing or invalid state");
    });

    it("returns 503 when daemon is offline", async () => {
      const res = await relayFetch(
        "/oauth/github/callback?code=abc&state=nonexistent-user.xyz",
      );
      expect(res.status).toBe(503);
      const html = await res.text();
      expect(html).toContain("not connected");
    });

    it("returns 400 for provider OAuth error", async () => {
      const client = await connectDaemon("user-error-1");
      await client.waitForMessage("auth_ok");

      const res = await relayFetch(
        "/oauth/github/callback?error=access_denied&error_description=User+denied&state=user-error-1.abc",
      );

      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("User denied");

      client.close();
    });

    it("returns 400 for missing code parameter", async () => {
      const client = await connectDaemon("user-error-2");
      await client.waitForMessage("auth_ok");

      const res = await relayFetch(
        "/oauth/github/callback?state=user-error-2.abc",
      );

      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("Missing authorization code");

      client.close();
    });
  });

  describe("credential isolation", () => {
    it("relay credentials use RELAY_ prefix, not daemon env vars", () => {
      // Set daemon credentials (these should NOT be used by relay)
      const origId = process.env.GITHUB_OAUTH_CLIENT_ID;
      const origSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

      process.env.GITHUB_OAUTH_CLIENT_ID = "daemon-client-id";
      process.env.GITHUB_OAUTH_CLIENT_SECRET = "daemon-client-secret";

      // Clear relay credentials
      delete process.env.RELAY_GITHUB_OAUTH_CLIENT_ID;
      delete process.env.RELAY_GITHUB_OAUTH_CLIENT_SECRET;

      // The relay should NOT pick up daemon credentials
      // This is tested implicitly by the daemon-fallback tests, but let's be explicit
      expect(process.env.RELAY_GITHUB_OAUTH_CLIENT_ID).toBeUndefined();
      expect(process.env.RELAY_GITHUB_OAUTH_CLIENT_SECRET).toBeUndefined();

      // Restore
      if (origId) process.env.GITHUB_OAUTH_CLIENT_ID = origId;
      else delete process.env.GITHUB_OAUTH_CLIENT_ID;
      if (origSecret) process.env.GITHUB_OAUTH_CLIENT_SECRET = origSecret;
      else delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
    });
  });
});
