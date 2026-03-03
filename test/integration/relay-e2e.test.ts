// Relay end-to-end integration tests.
//
// Starts a REAL relay server on a random port, connects REAL WebSocket clients,
// sends REAL HTTP requests, and verifies the full pipeline:
//
//   External Service → HTTP → Relay → WebSocket → Daemon
//   Provider → HTTP → Relay → WebSocket → Daemon → WebSocket → Relay → HTTP → Browser
//
// These are NOT unit tests with mocks. They prove the relay infrastructure works.

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
const AUTH_SECRET = "test-e2e-secret-" + Date.now();

beforeAll(() => {
  process.env.RELAY_AUTH_SECRET = AUTH_SECRET;
  relay = createRelayServer({ port: 0, hostname: "127.0.0.1" });
});

afterAll(() => {
  relay.stop();
  delete process.env.RELAY_AUTH_SECRET;
});

// ---------------------------------------------------------------------------
// WebSocket client helper — simulates a daemon connecting to the relay
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

      // Resolve any waiters for this message type
      const idx = waiters.findIndex((w) => w.type === msg.type);
      if (idx >= 0) {
        const waiter = waiters.splice(idx, 1)[0]!;
        waiter.resolve(msg);
      }
    };

    ws.onopen = () => {
      const client: DaemonClient = {
        ws,
        userId,
        messages,
        waitForMessage(type: string, timeout = 5000): Promise<RelayInboundMessage> {
          // Check if we already have this message
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

      // Send auth immediately
      client.send({ type: "auth", userId, token });
      resolve(client);
    };

    ws.onerror = (err) => reject(err);

    // Timeout for connection
    setTimeout(() => reject(new Error("WebSocket connection timeout")), 5000);
  });
}

/** Helper: make an HTTP request to the relay. */
async function relayFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`${relay.url}${path}`, opts);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("relay end-to-end", () => {

  // ── Health endpoints ──────────────────────────────────────────

  describe("health", () => {
    it("GET /health returns healthy status", async () => {
      const res = await relayFetch("/health");
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body.ok).toBe(true);
      expect(body.data.service).toBe("jeriko-relay");
      expect(body.data.status).toBe("healthy");
      expect(typeof body.data.uptime_seconds).toBe("number");
    });

    it("GET /health/status requires auth", async () => {
      const res = await relayFetch("/health/status");
      expect(res.status).toBe(401);
    });

    it("GET /health/status works with valid auth", async () => {
      const res = await relayFetch("/health/status", {
        headers: { authorization: `Bearer ${AUTH_SECRET}` },
      });
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body.ok).toBe(true);
      expect(typeof body.data.connections).toBe("number");
      expect(Array.isArray(body.data.users)).toBe(true);
    });
  });

  // ── WebSocket authentication ──────────────────────────────────

  describe("websocket auth", () => {
    it("authenticates a daemon and receives auth_ok", async () => {
      const client = await connectDaemon("user-auth-ok");
      const msg = await client.waitForMessage("auth_ok");
      expect(msg.type).toBe("auth_ok");
      client.close();
    });

    it("rejects invalid credentials with auth_fail", async () => {
      const ws = new WebSocket(relay.wsUrl);
      const messages: any[] = [];

      await new Promise<void>((resolve) => {
        ws.onopen = () => {
          ws.send(JSON.stringify({
            type: "auth",
            userId: "user-bad-auth",
            token: "wrong-secret",
          }));
        };
        ws.onmessage = (event) => {
          messages.push(JSON.parse(event.data as string));
          resolve();
        };
      });

      expect(messages[0].type).toBe("auth_fail");
      ws.close();
    });
  });

  // ── Webhook forwarding ────────────────────────────────────────

  describe("webhook forwarding", () => {
    it("forwards webhook to connected daemon", async () => {
      const client = await connectDaemon("user-wh-1");
      await client.waitForMessage("auth_ok");

      // Register a trigger
      client.send({ type: "register_triggers", triggerIds: ["trigger-wh-1"] });
      // Small delay for registration to propagate
      await Bun.sleep(50);

      // External service sends a webhook
      const webhookPayload = { event: "payment.completed", amount: 100 };
      const res = await relayFetch("/hooks/user-wh-1/trigger-wh-1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-signature": "sig_abc123",
        },
        body: JSON.stringify(webhookPayload),
      });

      expect(res.status).toBe(200);
      const resBody = await res.json() as any;
      expect(resBody.ok).toBe(true);
      expect(resBody.data.trigger_id).toBe("trigger-wh-1");

      // Daemon should receive the forwarded webhook
      const msg = await client.waitForMessage("webhook") as any;
      expect(msg.type).toBe("webhook");
      expect(msg.triggerId).toBe("trigger-wh-1");
      expect(msg.headers["x-webhook-signature"]).toBe("sig_abc123");
      expect(JSON.parse(msg.body)).toEqual(webhookPayload);
      expect(msg.requestId).toBeDefined();
      expect(msg.requestId.length).toBe(36); // Full UUID

      client.close();
    });

    it("returns 503 when daemon is not connected", async () => {
      const res = await relayFetch("/hooks/nonexistent-user/trigger-xyz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });

      expect(res.status).toBe(503);
      const body = await res.json() as any;
      expect(body.ok).toBe(false);
      expect(body.error).toContain("not connected");
    });

    it("returns 404 for unregistered trigger", async () => {
      const client = await connectDaemon("user-wh-unreg");
      await client.waitForMessage("auth_ok");

      // Don't register any triggers — try to send a webhook
      const res = await relayFetch("/hooks/user-wh-unreg/fake-trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });

      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.ok).toBe(false);
      expect(body.error).toContain("not registered");

      client.close();
    });

    it("legacy route forwards webhook via trigger lookup", async () => {
      const client = await connectDaemon("user-wh-legacy");
      await client.waitForMessage("auth_ok");

      client.send({ type: "register_triggers", triggerIds: ["legacy-trigger-1"] });
      await Bun.sleep(50);

      const res = await relayFetch("/hooks/legacy-trigger-1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"test": true}',
      });

      expect(res.status).toBe(200);

      const msg = await client.waitForMessage("webhook") as any;
      expect(msg.triggerId).toBe("legacy-trigger-1");

      client.close();
    });
  });

  // ── OAuth callback proxying ───────────────────────────────────

  describe("oauth callback proxying", () => {
    it("forwards OAuth callback to daemon and returns HTML", async () => {
      const client = await connectDaemon("user-oauth-1");
      await client.waitForMessage("auth_ok");

      // Simulate: OAuth provider redirects browser to relay
      const oauthPromise = relayFetch(
        "/oauth/user-oauth-1/github/callback?code=abc123&state=xyz789",
      );

      // Daemon receives the OAuth callback
      const msg = await client.waitForMessage("oauth_callback") as any;
      expect(msg.type).toBe("oauth_callback");
      expect(msg.provider).toBe("github");
      expect(msg.params.code).toBe("abc123");
      expect(msg.params.state).toBe("xyz789");
      expect(msg.requestId).toBeDefined();

      // Daemon responds with success HTML
      client.send({
        type: "oauth_result",
        requestId: msg.requestId,
        statusCode: 200,
        html: "<html><body>Connected!</body></html>",
      });

      // Relay returns the daemon's HTML to the browser
      const res = await oauthPromise;
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Connected!");

      client.close();
    });

    it("returns 503 when daemon is not connected for OAuth", async () => {
      const res = await relayFetch(
        "/oauth/nonexistent-user/github/callback?code=abc&state=xyz",
      );
      expect(res.status).toBe(503);
      const html = await res.text();
      expect(html).toContain("not connected");
    });
  });

  // ── Multi-user isolation ──────────────────────────────────────

  describe("multi-user isolation", () => {
    it("routes webhooks to the correct user — not to other users", async () => {
      const clientA = await connectDaemon("user-iso-a");
      const clientB = await connectDaemon("user-iso-b");
      await clientA.waitForMessage("auth_ok");
      await clientB.waitForMessage("auth_ok");

      clientA.send({ type: "register_triggers", triggerIds: ["trigger-a"] });
      clientB.send({ type: "register_triggers", triggerIds: ["trigger-b"] });
      await Bun.sleep(50);

      // Send webhook to user A
      await relayFetch("/hooks/user-iso-a/trigger-a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"for": "user-a"}',
      });

      // User A receives the webhook
      const msgA = await clientA.waitForMessage("webhook") as any;
      expect(msgA.triggerId).toBe("trigger-a");
      expect(JSON.parse(msgA.body).for).toBe("user-a");

      // User B should NOT have received anything (beyond auth_ok)
      const bMessages = clientB.messages.filter((m) => m.type === "webhook");
      expect(bMessages).toHaveLength(0);

      // Now send webhook to user B
      await relayFetch("/hooks/user-iso-b/trigger-b", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"for": "user-b"}',
      });

      const msgB = await clientB.waitForMessage("webhook") as any;
      expect(msgB.triggerId).toBe("trigger-b");
      expect(JSON.parse(msgB.body).for).toBe("user-b");

      clientA.close();
      clientB.close();
    });

    it("user A cannot receive webhooks for user B's triggers", async () => {
      const clientA = await connectDaemon("user-cross-a");
      await clientA.waitForMessage("auth_ok");

      clientA.send({ type: "register_triggers", triggerIds: ["cross-trigger-a"] });
      await Bun.sleep(50);

      // Try to send a webhook to user-cross-a but with a trigger ID they don't own
      const res = await relayFetch("/hooks/user-cross-a/cross-trigger-b", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });

      // Should be rejected — trigger not registered
      expect(res.status).toBe(404);

      clientA.close();
    });
  });

  // ── Trigger registration ──────────────────────────────────────

  describe("trigger registration", () => {
    it("registers and unregisters triggers dynamically", async () => {
      const client = await connectDaemon("user-dyn-triggers");
      await client.waitForMessage("auth_ok");

      // Register
      client.send({ type: "register_triggers", triggerIds: ["dyn-t1", "dyn-t2"] });
      await Bun.sleep(50);

      // dyn-t1 should work
      let res = await relayFetch("/hooks/user-dyn-triggers/dyn-t1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);
      await client.waitForMessage("webhook");

      // Unregister dyn-t1
      client.send({ type: "unregister_triggers", triggerIds: ["dyn-t1"] });
      await Bun.sleep(50);

      // dyn-t1 should now fail
      res = await relayFetch("/hooks/user-dyn-triggers/dyn-t1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(404);

      // dyn-t2 should still work
      res = await relayFetch("/hooks/user-dyn-triggers/dyn-t2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);

      client.close();
    });
  });

  // ── Connection superseding ────────────────────────────────────

  describe("connection superseding", () => {
    it("new connection evicts old connection for same userId", async () => {
      const client1 = await connectDaemon("user-supersede");
      await client1.waitForMessage("auth_ok");

      client1.send({ type: "register_triggers", triggerIds: ["sup-trigger"] });
      await Bun.sleep(50);

      // Second connection with same userId
      const client2 = await connectDaemon("user-supersede");
      await client2.waitForMessage("auth_ok");

      client2.send({ type: "register_triggers", triggerIds: ["sup-trigger"] });
      await Bun.sleep(50);

      // Send webhook — should go to client2, not client1
      await relayFetch("/hooks/user-supersede/sup-trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"version": 2}',
      });

      const msg = await client2.waitForMessage("webhook") as any;
      expect(JSON.parse(msg.body).version).toBe(2);

      client1.close();
      client2.close();
    });
  });

  // ── Heartbeat (ping/pong) ────────────────────────────────────

  describe("heartbeat", () => {
    it("relay responds to ping with pong", async () => {
      const client = await connectDaemon("user-ping");
      await client.waitForMessage("auth_ok");

      client.send({ type: "ping" });
      const msg = await client.waitForMessage("pong");
      expect(msg.type).toBe("pong");

      client.close();
    });
  });

  // ── Billing license API ───────────────────────────────────────

  describe("billing license API", () => {
    it("GET /billing/license/:userId requires auth", async () => {
      const res = await relayFetch("/billing/license/some-user");
      expect(res.status).toBe(401);
    });

    it("returns free tier for unknown user with valid auth", async () => {
      const res = await relayFetch("/billing/license/unknown-user-xyz", {
        headers: { authorization: `Bearer ${AUTH_SECRET}` },
      });
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body.ok).toBe(true);
      expect(body.data.tier).toBe("free");
      expect(body.data.status).toBe("none");
    });
  });

  // ── 404 handling ──────────────────────────────────────────────

  describe("404 handling", () => {
    it("returns 404 for unknown routes", async () => {
      const res = await relayFetch("/nonexistent/path");
      expect(res.status).toBe(404);

      const body = await res.json() as any;
      expect(body.ok).toBe(false);
    });
  });

  // ── Status in /health/status reflects connected daemons ───────

  describe("status reflects connections", () => {
    it("connected daemon appears in /health/status", async () => {
      const client = await connectDaemon("user-in-status");
      await client.waitForMessage("auth_ok");
      await Bun.sleep(50);

      const res = await relayFetch("/health/status", {
        headers: { authorization: `Bearer ${AUTH_SECRET}` },
      });
      const body = await res.json() as any;

      const user = body.data.users.find((u: any) => u.userId === "user-in-status");
      expect(user).toBeDefined();

      client.close();
    });
  });
});
