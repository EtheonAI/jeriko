// API Routes Audit Test Suite
//
// Tests every HTTP route in the daemon API for:
//   - Auth enforcement (valid/invalid/missing token)
//   - Request validation (required fields, bad input)
//   - Response format consistency ({ ok, data } / { ok, error })
//   - Error responses (401, 403, 404, 400, 500)
//   - Public routes (health, webhooks, OAuth, shares, billing webhook)
//
// Uses Hono's built-in app.request() — no real server needed.

import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { Hono } from "hono";
import { createApp, type AppContext } from "../../src/daemon/api/app.js";
import { resetRateLimits } from "../../src/daemon/api/middleware/rate-limit.js";
import type { ChannelRegistry } from "../../src/daemon/services/channels/index.js";
import type { TriggerEngine, TriggerConfig, TriggerAction } from "../../src/daemon/services/triggers/engine.js";
import type { ConnectorManager } from "../../src/daemon/services/connectors/manager.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_SECRET = "test-audit-secret-token-abc123";
let app: Hono;

// Mock channel registry
function mockChannelRegistry(): ChannelRegistry {
  return {
    status: () => [
      { name: "telegram", connected: false, error: null },
    ],
    statusOf: (name: string) => ({ name, connected: false, error: null }),
    get: (name: string) => (name === "telegram" ? {} as any : undefined),
    connect: async () => {},
    disconnect: async () => {},
    send: async () => {},
    sendTracked: async () => ({ messageId: 1 }),
    editMessage: async () => {},
    deleteMessage: async () => {},
    sendTyping: async () => {},
    bus: { emit: () => {}, on: () => () => {} } as any,
    names: ["telegram"],
  } as any;
}

// In-memory trigger store for the mock engine
const triggerStore = new Map<string, TriggerConfig>();

// Mock trigger engine
function mockTriggerEngine(): TriggerEngine {
  return {
    listAll: () => [...triggerStore.values()],
    listActive: () => [...triggerStore.values()].filter(t => t.enabled),
    get: (id: string) => triggerStore.get(id) ?? null,
    add: (opts: any) => {
      const trigger: TriggerConfig = {
        id: `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: opts.type,
        enabled: opts.enabled ?? true,
        config: opts.config,
        action: opts.action,
        label: opts.label ?? "",
        run_count: 0,
        error_count: 0,
        max_runs: opts.max_runs ?? 0,
        created_at: new Date().toISOString(),
      };
      triggerStore.set(trigger.id, trigger);
      return trigger;
    },
    update: (id: string, updates: any) => {
      const existing = triggerStore.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      triggerStore.set(id, updated);
      return updated;
    },
    remove: (id: string) => {
      return triggerStore.delete(id);
    },
    enable: (id: string) => {
      const t = triggerStore.get(id);
      if (t) t.enabled = true;
    },
    disable: (id: string) => {
      const t = triggerStore.get(id);
      if (t) t.enabled = false;
    },
    fire: async () => {},
    handleWebhook: async (triggerId: string) => {
      return triggerStore.has(triggerId);
    },
    enabledCount: 0,
  } as any;
}

// Mock connector manager
function mockConnectorManager(): ConnectorManager {
  return {
    names: ["stripe", "github"],
    healthAll: async () => [
      { name: "stripe", status: "unconfigured" },
      { name: "github", status: "unconfigured" },
    ],
    health: async (name: string) => ({ name, status: "unconfigured" }),
    get: async (name: string) => {
      if (name === "stripe") {
        return {
          call: async (method: string, params: any) => ({
            ok: true,
            data: { method, params },
          }),
        };
      }
      return null;
    },
  } as any;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${TEST_SECRET}` };
}

function jsonHeaders(withAuth = true): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withAuth) {
    headers.Authorization = `Bearer ${TEST_SECRET}`;
  }
  return headers;
}

async function jsonBody(res: Response): Promise<any> {
  return res.json();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Set auth secret
  process.env.NODE_AUTH_SECRET = TEST_SECRET;

  // Initialize in-memory DB
  const { initDatabase } = await import("../../src/daemon/storage/db.js");
  initDatabase(":memory:");

  // Create the app with mock context
  const ctx: AppContext = {
    channels: mockChannelRegistry(),
    triggers: mockTriggerEngine(),
    connectors: mockConnectorManager(),
  };
  app = createApp(ctx);
});

afterAll(async () => {
  const { closeDatabase } = await import("../../src/daemon/storage/db.js");
  closeDatabase();
  delete process.env.NODE_AUTH_SECRET;
});

beforeEach(() => {
  resetRateLimits();
  triggerStore.clear();
});

// ===========================================================================
// AUTH MIDDLEWARE
// ===========================================================================

describe("Auth middleware", () => {
  it("rejects requests with no Authorization header (401)", async () => {
    const res = await app.request("/agent/list");
    expect(res.status).toBe(401);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Missing Authorization");
  });

  it("rejects requests with invalid token (403)", async () => {
    const res = await app.request("/agent/list", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(403);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Invalid authorization");
  });

  it("accepts requests with valid Bearer token", async () => {
    const res = await app.request("/agent/list", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
  });

  it("accepts raw token (without Bearer prefix)", async () => {
    const res = await app.request("/agent/list", {
      headers: { Authorization: TEST_SECRET },
    });
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
  });

  it("rejects 'Bearer ' with trailing space as invalid token (403)", async () => {
    // Hono trims trailing whitespace from header values, so "Bearer " becomes
    // "Bearer" which doesn't match the startsWith("Bearer ") check. The raw
    // string "Bearer" is then compared as a token against NODE_AUTH_SECRET.
    const res = await app.request("/agent/list", {
      headers: { Authorization: "Bearer " },
    });
    expect(res.status).toBe(403);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Invalid authorization");
  });

  it("returns 503 when NODE_AUTH_SECRET is not set", async () => {
    const saved = process.env.NODE_AUTH_SECRET;
    delete process.env.NODE_AUTH_SECRET;

    const res = await app.request("/agent/list", {
      headers: { Authorization: "Bearer anything" },
    });
    expect(res.status).toBe(503);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("not configured");

    process.env.NODE_AUTH_SECRET = saved;
  });
});

// ===========================================================================
// HEALTH ENDPOINT (public, no auth)
// ===========================================================================

describe("GET /health", () => {
  it("returns 200 without auth", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("healthy");
  });

  it("includes required fields", async () => {
    const res = await app.request("/health");
    const body = await jsonBody(res);
    expect(body.data.version).toBeDefined();
    expect(body.data.runtime).toBeDefined();
    expect(body.data.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(body.data.uptime_human).toBeDefined();
    expect(body.data.memory).toBeDefined();
    expect(body.data.memory.rss_mb).toBeGreaterThanOrEqual(0);
    expect(body.data.timestamp).toBeDefined();
  });

  it("does not expose PID", async () => {
    const res = await app.request("/health");
    const body = await jsonBody(res);
    expect(body.data.pid).toBeUndefined();
  });
});

// ===========================================================================
// SECURITY HEADERS
// ===========================================================================

describe("Security headers", () => {
  it("sets X-Frame-Options DENY", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Content-Type-Options nosniff", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets Referrer-Policy no-referrer", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});

// ===========================================================================
// RATE LIMITING
// ===========================================================================

describe("Rate limiting", () => {
  it("includes rate limit headers", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("X-RateLimit-Limit")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });
});

// ===========================================================================
// 404 FALLBACK
// ===========================================================================

describe("404 fallback", () => {
  it("returns proper { ok: false } JSON for unknown routes", async () => {
    const res = await app.request("/nonexistent/path", {
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    const body = await jsonBody(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Not found");
  });
});

// ===========================================================================
// AGENT ROUTES
// ===========================================================================

describe("Agent routes", () => {
  describe("GET /agent/list", () => {
    it("returns empty list initially", async () => {
      const res = await app.request("/agent/list", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("requires auth", async () => {
      const res = await app.request("/agent/list");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /agent/chat", () => {
    it("requires auth", async () => {
      const res = await app.request("/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });
      expect(res.status).toBe(401);
    });

    it("validates message field (400)", async () => {
      const res = await app.request("/agent/chat", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "" }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("message is required");
    });

    it("validates message when missing (400)", async () => {
      const res = await app.request("/agent/chat", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });

    it("validates whitespace-only message (400)", async () => {
      const res = await app.request("/agent/chat", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "   " }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /agent/stream", () => {
    it("requires auth", async () => {
      const res = await app.request("/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });
      expect(res.status).toBe(401);
    });

    it("validates message field (400)", async () => {
      const res = await app.request("/agent/stream", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "" }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });
  });

  describe("POST /agent/spawn", () => {
    it("requires auth", async () => {
      const res = await app.request("/agent/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "test" }),
      });
      expect(res.status).toBe(401);
    });

    it("validates prompt field (400)", async () => {
      const res = await app.request("/agent/spawn", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ prompt: "" }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("prompt is required");
    });

    it("creates session with valid prompt", async () => {
      const res = await app.request("/agent/spawn", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ prompt: "Test agent prompt" }),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(body.data.session_id).toBeDefined();
      expect(typeof body.data.session_id).toBe("string");
    });
  });
});

// ===========================================================================
// SESSION ROUTES
// ===========================================================================

describe("Session routes", () => {
  describe("GET /session", () => {
    it("requires auth", async () => {
      const res = await app.request("/session");
      expect(res.status).toBe(401);
    });

    it("returns list of sessions", async () => {
      const res = await app.request("/session", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("GET /session/:id", () => {
    it("returns 404 for non-existent session", async () => {
      const res = await app.request("/session/nonexistent-id", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("not found");
    });

    it("requires auth", async () => {
      const res = await app.request("/session/any-id");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /session/:id/resume", () => {
    it("returns 404 for non-existent session", async () => {
      const res = await app.request("/session/nonexistent-id/resume", {
        method: "POST",
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });
  });

  describe("DELETE /session/:id", () => {
    it("returns 404 for non-existent session", async () => {
      const res = await app.request("/session/nonexistent-id", {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });
  });
});

// ===========================================================================
// TRIGGER ROUTES
// ===========================================================================

describe("Trigger routes", () => {
  describe("GET /triggers", () => {
    it("requires auth", async () => {
      const res = await app.request("/triggers");
      expect(res.status).toBe(401);
    });

    it("returns empty list initially", async () => {
      const res = await app.request("/triggers", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });
  });

  describe("POST /triggers (create)", () => {
    it("requires auth", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "cron",
          config: { expression: "* * * * *" },
          action: { type: "shell", command: "echo test" },
        }),
      });
      expect(res.status).toBe(401);
    });

    it("validates trigger type (400)", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "invalid",
          config: {},
          action: { type: "shell", command: "echo test" },
        }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Invalid trigger type");
    });

    it("validates cron config (400)", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "cron",
          config: {},
          action: { type: "shell", command: "echo test" },
        }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("expression");
    });

    it("validates action type (400)", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "cron",
          config: { expression: "* * * * *" },
          action: { type: "invalid" },
        }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("action.type");
    });

    it("validates shell action requires command (400)", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "cron",
          config: { expression: "* * * * *" },
          action: { type: "shell" },
        }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("command");
    });

    it("validates agent action requires prompt (400)", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "cron",
          config: { expression: "* * * * *" },
          action: { type: "agent" },
        }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("prompt");
    });

    it("validates file trigger requires paths (400)", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "file",
          config: {},
          action: { type: "shell", command: "echo test" },
        }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("paths");
    });

    it("validates http trigger requires url (400)", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "http",
          config: {},
          action: { type: "shell", command: "echo test" },
        }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("url");
    });

    it("validates once trigger requires at (400)", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "once",
          config: {},
          action: { type: "shell", command: "echo test" },
        }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("at");
    });

    it("creates a valid cron trigger (201)", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "cron",
          config: { expression: "*/5 * * * *" },
          action: { type: "shell", command: "echo hello" },
          label: "Test cron",
        }),
      });
      expect(res.status).toBe(201);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.type).toBe("cron");
      expect(body.data.label).toBe("Test cron");
      expect(body.data.enabled).toBe(true);
    });

    it("creates a valid webhook trigger with webhook_url (201)", async () => {
      const res = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "webhook",
          config: {},
          action: { type: "agent", prompt: "Handle webhook" },
        }),
      });
      expect(res.status).toBe(201);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("webhook");
      expect(body.data.webhook_url).toBeDefined();
    });
  });

  describe("GET /triggers/:id", () => {
    it("returns 404 for non-existent trigger", async () => {
      const res = await app.request("/triggers/nonexistent", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });

    it("returns trigger by ID", async () => {
      // Create a trigger first
      const createRes = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "cron",
          config: { expression: "* * * * *" },
          action: { type: "shell", command: "echo hi" },
        }),
      });
      const created = await createRes.json() as any;
      const id = created.data.id;

      const res = await app.request(`/triggers/${id}`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe(id);
    });
  });

  describe("PUT /triggers/:id", () => {
    it("returns 404 for non-existent trigger", async () => {
      const res = await app.request("/triggers/nonexistent", {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ label: "updated" }),
      });
      expect(res.status).toBe(404);
    });

    it("updates an existing trigger", async () => {
      // Create first
      const createRes = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "cron",
          config: { expression: "* * * * *" },
          action: { type: "shell", command: "echo original" },
          label: "original",
        }),
      });
      const created = await createRes.json() as any;
      const id = created.data.id;

      // Update
      const res = await app.request(`/triggers/${id}`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ label: "updated" }),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(body.data.label).toBe("updated");
    });
  });

  describe("DELETE /triggers/:id", () => {
    it("returns 404 for non-existent trigger", async () => {
      const res = await app.request("/triggers/nonexistent", {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
    });

    it("deletes an existing trigger", async () => {
      // Create first
      const createRes = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "cron",
          config: { expression: "* * * * *" },
          action: { type: "shell", command: "echo test" },
        }),
      });
      const created = await createRes.json() as any;
      const id = created.data.id;

      // Delete
      const res = await app.request(`/triggers/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("deleted");

      // Verify gone
      const getRes = await app.request(`/triggers/${id}`, {
        headers: authHeaders(),
      });
      expect(getRes.status).toBe(404);
    });
  });

  describe("POST /triggers/:id/toggle", () => {
    it("returns 404 for non-existent trigger", async () => {
      const res = await app.request("/triggers/nonexistent/toggle", {
        method: "POST",
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
    });

    it("toggles trigger enabled state", async () => {
      // Create enabled trigger
      const createRes = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "cron",
          config: { expression: "* * * * *" },
          action: { type: "shell", command: "echo test" },
          enabled: true,
        }),
      });
      const created = await createRes.json() as any;
      const id = created.data.id;
      expect(created.data.enabled).toBe(true);

      // Toggle off
      const res = await app.request(`/triggers/${id}/toggle`, {
        method: "POST",
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(body.data.enabled).toBe(false);

      // Toggle back on
      const res2 = await app.request(`/triggers/${id}/toggle`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body2 = await res2.json() as any;
      expect(body2.data.enabled).toBe(true);
    });
  });

  describe("POST /triggers/:id/fire", () => {
    it("returns 404 for non-existent trigger", async () => {
      const res = await app.request("/triggers/nonexistent/fire", {
        method: "POST",
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
    });
  });
});

// ===========================================================================
// CONNECTOR ROUTES
// ===========================================================================

describe("Connector routes", () => {
  describe("GET /connector", () => {
    it("requires auth", async () => {
      const res = await app.request("/connector");
      expect(res.status).toBe(401);
    });

    it("returns connector list", async () => {
      const res = await app.request("/connector", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("GET /connector/:name", () => {
    it("returns 404 for unknown connector", async () => {
      const res = await app.request("/connector/nonexistent", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });

    it("returns status for known connector", async () => {
      const res = await app.request("/connector/stripe", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
    });
  });

  describe("POST /connector/:name/call", () => {
    it("requires auth", async () => {
      const res = await app.request("/connector/stripe/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "charges.list" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 404 for unavailable connector", async () => {
      const res = await app.request("/connector/github/call", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ method: "repos.list" }),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });

    it("validates method field (400)", async () => {
      const res = await app.request("/connector/stripe/call", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("method is required");
    });

    it("calls connector with valid method", async () => {
      const res = await app.request("/connector/stripe/call", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ method: "charges.list", params: { limit: 10 } }),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
    });
  });
});

// ===========================================================================
// CHANNEL ROUTES
// ===========================================================================

describe("Channel routes", () => {
  describe("GET /channel", () => {
    it("requires auth", async () => {
      const res = await app.request("/channel");
      expect(res.status).toBe(401);
    });

    it("returns channel list", async () => {
      const res = await app.request("/channel", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
    });
  });

  describe("POST /channel/:name/connect", () => {
    it("requires auth", async () => {
      const res = await app.request("/channel/telegram/connect", {
        method: "POST",
      });
      expect(res.status).toBe(401);
    });

    it("returns 404 for unregistered channel", async () => {
      const res = await app.request("/channel/nonexistent/connect", {
        method: "POST",
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("not registered");
    });
  });

  describe("POST /channel/:name/disconnect", () => {
    it("returns 404 for unregistered channel", async () => {
      const res = await app.request("/channel/nonexistent/disconnect", {
        method: "POST",
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });
  });
});

// ===========================================================================
// WEBHOOK ROUTES (public, no auth)
// ===========================================================================

describe("Webhook routes", () => {
  describe("POST /hooks/:triggerId", () => {
    it("does not require auth", async () => {
      const res = await app.request("/hooks/some-trigger-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "test" }),
      });
      // Should not be 401 — webhooks are unauthenticated
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it("returns 404 for unknown trigger", async () => {
      const res = await app.request("/hooks/unknown-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "test" }),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });

    it("dispatches to known trigger", async () => {
      // Create a webhook trigger
      const createRes = await app.request("/triggers", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          type: "webhook",
          config: {},
          action: { type: "shell", command: "echo webhook" },
        }),
      });
      const created = await createRes.json() as any;
      const triggerId = created.data.id;

      // Send webhook
      const res = await app.request(`/hooks/${triggerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "test.event" }),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(body.data.trigger_id).toBe(triggerId);
    });
  });
});

// ===========================================================================
// OAUTH ROUTES (public, no auth -- browser redirect flow)
// ===========================================================================

describe("OAuth routes", () => {
  describe("GET /oauth/:provider/start", () => {
    it("does not require auth (no 401)", async () => {
      const res = await app.request("/oauth/github/start?state=test");
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it("returns error for unknown provider", async () => {
      const res = await app.request("/oauth/unknown-provider/start?state=abc");
      expect(res.status).toBe(404);
    });

    it("returns error for missing state", async () => {
      const res = await app.request("/oauth/github/start");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /oauth/:provider/callback", () => {
    it("does not require auth (no 401)", async () => {
      const res = await app.request("/oauth/github/callback?code=abc&state=invalid");
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it("returns error for invalid state", async () => {
      const res = await app.request("/oauth/github/callback?code=abc&state=invalid-state");
      // Should be 400 (invalid state)
      expect(res.status).toBe(400);
    });

    it("returns error for provider error", async () => {
      const res = await app.request("/oauth/github/callback?error=access_denied&error_description=User+denied");
      expect(res.status).toBe(400);
    });
  });
});

// ===========================================================================
// SHARE ROUTES
// ===========================================================================

describe("Share routes", () => {
  describe("GET /share (authenticated)", () => {
    it("requires auth", async () => {
      const res = await app.request("/share");
      expect(res.status).toBe(401);
    });

    it("returns list of shares", async () => {
      const res = await app.request("/share", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("POST /share (create)", () => {
    it("requires auth", async () => {
      const res = await app.request("/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: "test" }),
      });
      expect(res.status).toBe(401);
    });

    it("validates session_id (400)", async () => {
      const res = await app.request("/share", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("session_id is required");
    });

    it("returns 404 for non-existent session", async () => {
      const res = await app.request("/share", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ session_id: "nonexistent-session" }),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });
  });

  describe("GET /share/:id (authenticated metadata)", () => {
    it("returns 404 for non-existent share", async () => {
      const res = await app.request("/share/nonexistent", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });
  });

  describe("DELETE /share/:id", () => {
    it("returns 404 for non-existent share", async () => {
      const res = await app.request("/share/nonexistent", {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
    });
  });

  describe("GET /s/:id (public share page)", () => {
    it("does not require auth", async () => {
      const res = await app.request("/s/test-share-id");
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it("returns 404 HTML for non-existent share", async () => {
      const res = await app.request("/s/nonexistent");
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain("Share not found");
    });

    it("sets Content-Security-Policy header", async () => {
      const res = await app.request("/s/any-id");
      expect(res.headers.get("Content-Security-Policy")).toBeDefined();
    });
  });
});

// ===========================================================================
// BILLING ROUTES
// ===========================================================================

describe("Billing routes", () => {
  describe("GET /billing/plan", () => {
    it("requires auth", async () => {
      const res = await app.request("/billing/plan");
      expect(res.status).toBe(401);
    });

    it("returns plan info with auth", async () => {
      const res = await app.request("/billing/plan", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(body.data.tier).toBeDefined();
      expect(body.data.connectors).toBeDefined();
      expect(body.data.triggers).toBeDefined();
    });
  });

  describe("POST /billing/checkout", () => {
    it("requires auth", async () => {
      const res = await app.request("/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });
      expect(res.status).toBe(401);
    });

    it("validates email field (400)", async () => {
      const res = await app.request("/billing/checkout", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("email is required");
    });
  });

  describe("POST /billing/portal", () => {
    it("requires auth", async () => {
      const res = await app.request("/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /billing/events", () => {
    it("requires auth", async () => {
      const res = await app.request("/billing/events");
      expect(res.status).toBe(401);
    });

    it("returns events list with auth", async () => {
      const res = await app.request("/billing/events", {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("POST /billing/webhook (public, Stripe signature)", () => {
    it("does not require auth (no 401)", async () => {
      const res = await app.request("/billing/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "test" }),
      });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it("returns 400 for missing Stripe-Signature", async () => {
      const res = await app.request("/billing/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "test" }),
      });
      expect(res.status).toBe(400);
      const body = await jsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Stripe-Signature");
    });
  });
});

// ===========================================================================
// CORS
// ===========================================================================

describe("CORS", () => {
  it("allows tauri://localhost origin", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "tauri://localhost" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("tauri://localhost");
  });

  it("allows http://localhost:3000 origin", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("rejects non-localhost origins", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "https://evil.com" },
    });
    const acao = res.headers.get("Access-Control-Allow-Origin");
    expect(acao === null || acao !== "https://evil.com").toBe(true);
  });

  it("handles OPTIONS preflight", async () => {
    const res = await app.request("/agent/chat", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization",
      },
    });
    // Preflight should return 204 or 200
    expect(res.status === 204 || res.status === 200).toBe(true);
  });
});

// ===========================================================================
// RESPONSE FORMAT CONSISTENCY
// ===========================================================================

describe("Response format consistency", () => {
  it("404 fallback has ok:false and error string", async () => {
    const res = await app.request("/does-not-exist", {
      headers: authHeaders(),
    });
    const body = await jsonBody(res);
    expect(body).toHaveProperty("ok", false);
    expect(typeof body.error).toBe("string");
    expect(body.data).toBeUndefined();
  });

  it("auth failure has ok:false and error string", async () => {
    const res = await app.request("/agent/list", {
      headers: { Authorization: "Bearer bad" },
    });
    const body = await jsonBody(res);
    expect(body).toHaveProperty("ok", false);
    expect(typeof body.error).toBe("string");
    expect(body.data).toBeUndefined();
  });

  it("successful response has ok:true and data", async () => {
    const res = await app.request("/health");
    const body = await jsonBody(res);
    expect(body).toHaveProperty("ok", true);
    expect(body.data).toBeDefined();
    expect(body.error).toBeUndefined();
  });

  it("validation error has ok:false and error string", async () => {
    const res = await app.request("/agent/spawn", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ prompt: "" }),
    });
    const body = await jsonBody(res);
    expect(body).toHaveProperty("ok", false);
    expect(typeof body.error).toBe("string");
  });
});
