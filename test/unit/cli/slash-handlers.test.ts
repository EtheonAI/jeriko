/**
 * Slash command handler integration test.
 *
 * Exercises every handler from session.ts, model.ts, connector.ts, system.ts
 * with mock backends to verify they run without crashing and produce output.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createSessionHandlers } from "../../../src/cli/handlers/session.js";
import { createModelHandlers } from "../../../src/cli/handlers/model.js";
import { createConnectorHandlers } from "../../../src/cli/handlers/connector.js";
import { createSystemHandlers } from "../../../src/cli/handlers/system.js";
import type { Backend } from "../../../src/cli/backend.js";

// ---------------------------------------------------------------------------
// Shared mock factory
// ---------------------------------------------------------------------------

function createMockBackend(overrides: Partial<Backend> = {}): Backend {
  return {
    mode: "in-process",
    sessionId: "test-session-1",

    // Session
    newSession: mock(() => Promise.resolve({ slug: "new-session-abc" })),
    getSessionDetail: mock(() =>
      Promise.resolve({
        slug: "test-session",
        model: "claude-sonnet-4-6",
        messageCount: 10,
        tokenCount: 5000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),
    listSessions: mock(() =>
      Promise.resolve([
        {
          id: "1",
          slug: "session-a",
          title: "Test session",
          model: "claude-sonnet-4-6",
          tokenCount: 1000,
          updatedAt: new Date().toISOString(),
        },
      ]),
    ),
    resumeSession: mock((target: string) =>
      target === "not-found"
        ? Promise.resolve(null)
        : Promise.resolve({ slug: target }),
    ),
    getHistory: mock(() =>
      Promise.resolve([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ]),
    ),
    clearHistory: mock(() => Promise.resolve()),
    compact: mock(() => Promise.resolve({ before: 5000, after: 2000 })),
    listShares: mock(() => Promise.resolve([])),
    createShare: mock(() =>
      Promise.resolve({ id: "share-1", url: "https://share.example.com/share-1" }),
    ),
    revokeShare: mock((id: string) => Promise.resolve(id !== "not-found")),
    killSession: mock(() => Promise.resolve({ slug: "fresh-session" })),
    archiveSession: mock(() => Promise.resolve({ slug: "fresh-session-2" })),

    // Model
    getModel: mock(() => Promise.resolve("claude-sonnet-4-6")),
    setModel: mock(() => Promise.resolve()),
    listModels: mock(() =>
      Promise.resolve([
        { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic" },
      ]),
    ),
    listProviders: mock(() =>
      Promise.resolve([
        { id: "anthropic", name: "Anthropic", models: ["claude-sonnet-4-6"] },
      ]),
    ),
    addProvider: mock(() => Promise.resolve()),
    removeProvider: mock(() => Promise.resolve()),

    // Connectors
    listConnectors: mock(() =>
      Promise.resolve([
        { id: "github", name: "GitHub", type: "oauth", status: "connected" },
      ]),
    ),
    connectService: mock(() => Promise.resolve({ ok: true, label: "GitHub" })),
    disconnectService: mock(() => Promise.resolve({ ok: true, label: "GitHub" })),
    listChannels: mock(() =>
      Promise.resolve([
        { id: "telegram", name: "Telegram", status: "active" },
      ]),
    ),
    connectChannel: mock(() => Promise.resolve({ ok: true })),
    disconnectChannel: mock(() => Promise.resolve({ ok: true })),
    addChannel: mock(() => Promise.resolve({ ok: true })),
    removeChannel: mock(() => Promise.resolve({ ok: true })),
    listTriggers: mock(() => Promise.resolve([])),
    getAuthStatus: mock(() =>
      Promise.resolve([{ name: "github", status: "connected", keys: [] }]),
    ),
    saveAuth: mock(() => Promise.resolve({ label: "GitHub", saved: 1 })),

    // Model extras
    updateSessionModel: mock(() => Promise.resolve()),
    addProvider: mock(() => Promise.resolve({ id: "custom", name: "Custom" })),
    removeProvider: mock(() => Promise.resolve()),

    // Skills
    listSkills: mock(() =>
      Promise.resolve([
        { name: "test-skill", description: "A test skill" },
      ]),
    ),
    getSkill: mock((name: string) =>
      name === "not-found"
        ? Promise.resolve(null)
        : Promise.resolve({ name, description: "Desc", body: "# Body" }),
    ),

    // System
    getStatus: mock(() =>
      Promise.resolve({
        version: "2.0.0",
        uptime: 3600,
        sessions: 5,
        connectors: 2,
      }),
    ),
    checkHealth: mock(() =>
      Promise.resolve([
        { name: "database", status: "ok" },
        { name: "relay", status: "ok" },
      ]),
    ),
    getConfig: mock(() =>
      Promise.resolve({
        agent: { model: "claude-sonnet-4-6" },
        logging: { level: "info" },
      }),
    ),

    // Billing
    getPlan: mock(() =>
      Promise.resolve({ tier: "free", connectors: 2, triggers: 3 }),
    ),
    startUpgrade: mock((email: string) =>
      Promise.resolve({ url: `https://checkout.example.com?email=${email}` }),
    ),
    openBillingPortal: mock(() =>
      Promise.resolve({ url: "https://billing.example.com" }),
    ),
    cancelSubscription: mock(() =>
      Promise.resolve({ already_cancelling: false, cancel_at: "2026-04-06" }),
    ),

    // Tasks & Notifications
    listTasks: mock(() => Promise.resolve([])),
    listNotifications: mock(() => Promise.resolve([])),

    ...overrides,
  } as unknown as Backend;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestCtx(backendOverrides: Partial<Backend> = {}) {
  const messages: string[] = [];
  const dispatched: unknown[] = [];
  const backend = createMockBackend(backendOverrides);

  return {
    backend,
    dispatch: (action: unknown) => dispatched.push(action),
    addSystemMessage: (msg: string) => messages.push(msg),
    messages,
    dispatched,
    state: {
      model: "claude-sonnet-4-6",
      stats: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 200,
        cacheWriteTokens: 100,
        totalCost: 0.05,
        messageCount: 10,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Session handlers
// ---------------------------------------------------------------------------

describe("Session handlers", () => {
  test("/new creates a new session", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.new();
    expect(ctx.messages.length).toBeGreaterThan(0);
    expect(ctx.dispatched).toContainEqual({ type: "RESET_STATS" });
  });

  test("/session shows session detail", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.session();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/session handles no active session", async () => {
    const ctx = createTestCtx({ getSessionDetail: mock(() => Promise.resolve(null)) } as any);
    const h = createSessionHandlers(ctx);
    await h.session();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/sessions lists all sessions", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.sessions();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/resume with valid slug resumes session", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.resume("my-session");
    expect(ctx.dispatched).toContainEqual({ type: "SET_SESSION_SLUG", slug: "my-session" });
  });

  test("/resume with empty args shows usage", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.resume("");
    expect(ctx.messages[0]).toContain("Usage");
  });

  test("/resume with not-found slug shows error", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.resume("not-found");
    expect(ctx.messages[0]).toContain("not found");
  });

  test("/history shows history entries", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.history();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/clear clears messages", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.clear();
    expect(ctx.dispatched).toContainEqual({ type: "CLEAR_MESSAGES" });
  });

  test("/compact compacts context", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.compact();
    expect(ctx.messages[0]).toContain("compacted");
  });

  test("/share creates a share", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.share("");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/share list lists shares", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.share("list");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/share revoke without id shows usage", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.share("revoke");
    expect(ctx.messages[0]).toContain("Usage");
  });

  test("/cost shows cost info", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.cost();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/kill destroys session and creates new one", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.kill();
    expect(ctx.dispatched).toContainEqual({ type: "RESET_STATS" });
    expect(ctx.dispatched).toContainEqual({ type: "CLEAR_MESSAGES" });
  });

  test("/archive archives session", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.archive();
    expect(ctx.dispatched).toContainEqual({ type: "RESET_STATS" });
  });
});

// ---------------------------------------------------------------------------
// Model handlers
// ---------------------------------------------------------------------------

describe("Model handlers", () => {
  test("/model with no args shows current model", async () => {
    const ctx = createTestCtx();
    const h = createModelHandlers({ ...ctx, pickerProvidersRef: { current: [] } });
    await h.model("");
    expect(ctx.messages.length).toBeGreaterThan(0);
    expect(ctx.messages[0]).toContain("model");
  });

  test("/model with arg switches model", async () => {
    const ctx = createTestCtx();
    const h = createModelHandlers({ ...ctx, pickerProvidersRef: { current: [] } });
    await h.model("gpt-4o");
    expect(ctx.dispatched).toContainEqual({ type: "SET_MODEL", model: "gpt-4o" });
    expect(ctx.messages[0]).toContain("gpt-4o");
  });

  test("/models lists available models", async () => {
    const ctx = createTestCtx();
    const h = createModelHandlers({ ...ctx, pickerProvidersRef: { current: [] } });
    await h.models();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/providers lists providers", async () => {
    const ctx = createTestCtx();
    const h = createModelHandlers({ ...ctx, pickerProvidersRef: { current: [] } });
    await h.providers();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/provider with no args lists providers", async () => {
    const ctx = createTestCtx();
    const h = createModelHandlers({ ...ctx, pickerProvidersRef: { current: [] } });
    await h.provider("");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/provider add without id launches picker", async () => {
    const ctx = createTestCtx();
    const h = createModelHandlers({ ...ctx, pickerProvidersRef: { current: [] } });
    await h.provider("add");
    expect(ctx.dispatched).toContainEqual({ type: "SET_PHASE", phase: "provider-add" });
  });

  test("/provider remove without id shows usage", async () => {
    const ctx = createTestCtx();
    const h = createModelHandlers({ ...ctx, pickerProvidersRef: { current: [] } });
    await h.provider("remove");
    expect(ctx.messages[0]).toContain("Usage");
  });
});

// ---------------------------------------------------------------------------
// Connector handlers
// ---------------------------------------------------------------------------

describe("Connector handlers", () => {
  // Connector commands require daemon mode — test both paths

  test("/connectors in non-daemon mode shows daemon required", async () => {
    const ctx = createTestCtx();
    const h = createConnectorHandlers(ctx);
    await h.connectors();
    expect(ctx.messages[0]).toContain("daemon");
  });

  test("/connectors in daemon mode lists connectors", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.connectors();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/channels in daemon mode lists channels", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.channels();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/triggers in daemon mode lists triggers", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.triggers();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/connect without args in daemon mode shows usage", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.connect("");
    expect(ctx.messages[0]).toContain("Usage");
  });

  test("/disconnect without args in daemon mode shows usage", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.disconnect("");
    expect(ctx.messages[0]).toContain("Usage");
  });

  test("/auth with no args shows auth status", async () => {
    const ctx = createTestCtx();
    const h = createConnectorHandlers(ctx);
    await h.auth("");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// System handlers
// ---------------------------------------------------------------------------

describe("System handlers", () => {
  test("/help shows help text", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.help();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/skills lists skills", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.skills();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/skill with name shows detail", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.skill("test-skill");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/skill without name shows usage", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.skill("");
    expect(ctx.messages[0]).toContain("Usage");
  });

  test("/skill with unknown name shows error", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.skill("not-found");
    expect(ctx.messages[0]).toContain("not found");
  });

  test("/sys shows system info", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.sys();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/config shows config", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.config();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/status requires daemon", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.status();
    // in-process mode, should show daemon required message
    expect(ctx.messages[0]).toContain("daemon");
  });

  test("/health requires daemon", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.health();
    expect(ctx.messages[0]).toContain("daemon");
  });

  test("/plan shows plan info", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.plan();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/upgrade without email shows usage", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.upgrade("");
    expect(ctx.messages[0]).toContain("Usage");
  });

  test("/upgrade with email starts checkout", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.upgrade("user@example.com");
    expect(ctx.messages[0]).toContain("Checkout");
  });

  test("/billing opens portal", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.billing();
    expect(ctx.messages[0]).toContain("portal");
  });

  test("/cancel requires daemon", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.cancel();
    expect(ctx.messages[0]).toContain("daemon");
  });

  test("/tasks lists tasks", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.tasks();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/notifications lists notifications", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.notifications();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/theme with no args lists themes", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.theme("");
    expect(ctx.messages[0]).toContain("Theme");
  });

  test("/theme with invalid name shows error", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.theme("nonexistent-theme");
    expect(ctx.messages[0]).toContain("Unknown theme");
  });

  test("/theme with valid name switches theme", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.theme("nord");
    expect(ctx.messages[0]).toContain("switched");
  });
});
