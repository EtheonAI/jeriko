/**
 * Slash command handler integration test.
 *
 * Exercises every handler from session.ts, model.ts, connector.ts, system.ts
 * with mock backends to verify they run without crashing and produce output.
 */

import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";
import { createSessionHandlers } from "../../../src/cli/handlers/session.js";
import { createModelHandlers } from "../../../src/cli/handlers/model.js";
import { createConnectorHandlers } from "../../../src/cli/handlers/connector.js";
import { createSystemHandlers } from "../../../src/cli/handlers/system.js";
// Theme imports (single-theme now — no switching needed)
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
        { id: "anthropic", name: "Anthropic", type: "built-in" },
        { id: "groq", name: "Groq", type: "available", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.1-8b-instant", envKey: "GROQ_API_KEY" },
        { id: "deepseek", name: "DeepSeek", type: "available", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-chat", envKey: "DEEPSEEK_API_KEY" },
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

    // Tasks & Notifications
    listTasks: mock(() => Promise.resolve([])),
    listNotifications: mock(() => Promise.resolve([])),
    setNotifications: mock(() => Promise.resolve()),

    // Session control
    abort: mock(() => {}),
    deleteSessionById: mock((target: string) => Promise.resolve(target !== "current-session")),
    disconnectService: mock(() => Promise.resolve({ ok: true, label: "GitHub" })),

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

  // Subsystem-8 controllers — minimal stubs so /theme and /keybindings
  // handlers don't dereference undefined. The /theme stub advertises the
  // default theme as the only option; individual tests can override
  // ctx.themeControllerRef.current if they want to exercise list behaviour.
  const themeControllerRef = {
    current: {
      current: "jeriko" as const,
      set: (_id: string) => {},
      list: () => [{ id: "jeriko", displayName: "Jeriko (Electric Indigo)", kind: "dark", colors: {} as never }],
    },
  };
  const helpControllerRef = {
    current: {
      visible: false,
      show:   () => {},
      hide:   () => {},
      toggle: () => {},
    },
  };

  return {
    backend,
    dispatch: (action: unknown) => dispatched.push(action),
    addSystemMessage: (msg: string) => messages.push(msg),
    messages,
    dispatched,
    wizardConfigRef: { current: null },
    themeControllerRef,
    helpControllerRef,
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

  test("/sessions launches interactive picker", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.sessions("");
    // No args → wizard-based action picker
    expect(ctx.wizardConfigRef.current).not.toBeNull();
    expect(ctx.dispatched.some((a: any) => a.type === "SET_PHASE" && a.phase === "wizard")).toBe(true);
  });

  test("/sessions picker includes session actions", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.sessions("");
    const wizard = ctx.wizardConfigRef.current!;
    const options = wizard.steps[0]!.options!;
    expect(options.some((o: any) => o.value === "detail")).toBe(true);
    expect(options.some((o: any) => o.value === "list")).toBe(true);
  });

  test("/sessionslist lists all sessions", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.sessions("list");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/resume with valid slug resumes session", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.resume("my-session");
    expect(ctx.dispatched).toContainEqual({ type: "SET_SESSION_SLUG", slug: "my-session" });
  });

  test("/resume with empty args launches session picker wizard", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.resume("");
    expect(ctx.wizardConfigRef.current).not.toBeNull();
    expect(ctx.wizardConfigRef.current!.title).toContain("Resume");
    expect(ctx.dispatched).toContainEqual({ type: "SET_PHASE", phase: "wizard" });
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

  test("/clear launches confirmation wizard", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.clear();
    // Should launch a wizard with confirmation prompt
    expect(ctx.wizardConfigRef.current).not.toBeNull();
    expect(ctx.wizardConfigRef.current!.title).toContain("Clear");
    expect(ctx.dispatched).toContainEqual({ type: "SET_PHASE", phase: "wizard" });
  });

  test("/clear wizard 'yes' clears messages", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.clear();
    // Simulate wizard completing with "yes"
    const wizard = ctx.wizardConfigRef.current!;
    await wizard.onComplete(["yes"]);
    expect(ctx.dispatched).toContainEqual({ type: "CLEAR_MESSAGES" });
  });

  test("/clear wizard 'no' cancels without clearing", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.clear();
    const wizard = ctx.wizardConfigRef.current!;
    await wizard.onComplete(["no"]);
    expect(ctx.dispatched).not.toContainEqual({ type: "CLEAR_MESSAGES" });
    expect(ctx.messages.some((m) => m.includes("cancelled"))).toBe(true);
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

  test("/kill on error does not change local state", async () => {
    const ctx = createTestCtx({
      killSession: (() => Promise.reject(new Error("backend failure"))) as any,
    });
    const h = createSessionHandlers(ctx);
    await h.kill();
    // Should show error, not dispatch state changes
    expect(ctx.messages.some((m) => m.includes("backend failure"))).toBe(true);
    expect(ctx.dispatched).not.toContainEqual({ type: "RESET_STATS" });
    expect(ctx.dispatched).not.toContainEqual({ type: "CLEAR_MESSAGES" });
  });

  test("/archive archives session and creates new one", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.archive();
    expect(ctx.dispatched).toContainEqual({ type: "RESET_STATS" });
    expect(ctx.dispatched).toContainEqual({ type: "CLEAR_MESSAGES" });
    expect(ctx.dispatched).toContainEqual({ type: "SET_SESSION_SLUG", slug: "fresh-session-2" });
    expect(ctx.messages[0]).toContain("archived");
  });

  test("/archive on error shows error without state changes", async () => {
    const ctx = createTestCtx({
      archiveSession: (() => Promise.reject(new Error("archive failure"))) as any,
    });
    const h = createSessionHandlers(ctx);
    await h.archive();
    expect(ctx.messages.some((m) => m.includes("archive failure"))).toBe(true);
    expect(ctx.dispatched).not.toContainEqual({ type: "RESET_STATS" });
  });

  test("/sessionsdelete without slug shows usage hint", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.sessions("delete");
    expect(ctx.messages[0]).toContain("Usage");
  });

  test("/sessionsdelete current session returns error (not crash)", async () => {
    const ctx = createTestCtx({
      deleteSessionById: mock((target: string) => Promise.resolve(false)) as any,
    });
    const h = createSessionHandlers(ctx);
    await h.sessions("delete current-session");
    expect(ctx.messages[0]).toContain("Cannot delete");
  });

  test("/sessionsdelete valid session shows success", async () => {
    const ctx = createTestCtx({
      deleteSessionById: mock((target: string) => Promise.resolve(true)) as any,
    });
    const h = createSessionHandlers(ctx);
    await h.sessions("delete old-session");
    expect(ctx.messages[0]).toContain("deleted");
  });

  test("/sessionsdelete handles backend error gracefully", async () => {
    const ctx = createTestCtx({
      deleteSessionById: (() => Promise.reject(new Error("db error"))) as any,
    });
    const h = createSessionHandlers(ctx);
    await h.sessions("delete some-session");
    expect(ctx.messages.some((m) => m.includes("db error"))).toBe(true);
  });

  test("/stop aborts the active AI response", async () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    await h.stop();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Model handlers
// ---------------------------------------------------------------------------

describe("Model handlers", () => {
  test("/model with no args launches model selector wizard", async () => {
    const ctx = createTestCtx();
    const wizardRef = { current: null as any };
    const h = createModelHandlers({ ...ctx, wizardConfigRef: wizardRef });
    await h.model("");
    expect(wizardRef.current).not.toBeNull();
    expect(wizardRef.current!.title).toContain("Switch Model");
  });

  test("/model with arg switches model", async () => {
    const ctx = createTestCtx();
    const h = createModelHandlers({ ...ctx, wizardConfigRef: { current: null } });
    await h.model("gpt-4o");
    expect(ctx.dispatched).toContainEqual({ type: "SET_MODEL", model: "gpt-4o" });
    expect(ctx.messages[0]).toContain("gpt-4o");
  });

  test("/model list browses all models", async () => {
    const ctx = createTestCtx();
    const h = createModelHandlers({ ...ctx, wizardConfigRef: { current: null } });
    await h.model("list");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/model add without id launches provider picker wizard", async () => {
    const ctx = createTestCtx();
    const wizardRef = { current: null as any };
    const h = createModelHandlers({ ...ctx, wizardConfigRef: wizardRef });
    await h.model("add");
    // Should launch a wizard for adding a provider
    expect(wizardRef.current).not.toBeNull();
    expect(wizardRef.current!.title).toContain("Add");
  });

  test("/model rm without id shows message or launches wizard", async () => {
    const ctx = createTestCtx();
    const wizardRef = { current: null as any };
    const h = createModelHandlers({ ...ctx, wizardConfigRef: wizardRef });
    await h.model("rm");
    // Either shows "no custom providers" or launches a wizard picker
    expect(ctx.messages.length > 0 || wizardRef.current !== null).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Connector handlers
// ---------------------------------------------------------------------------

describe("Connector handlers", () => {
  // Connector commands require daemon mode — test both paths

  test("/connectorsin non-daemon mode shows daemon required", async () => {
    const ctx = createTestCtx();
    const h = createConnectorHandlers(ctx);
    await h.connectors("");
    expect(ctx.messages[0]).toContain("daemon");
  });

  test("/connectors in daemon mode launches interactive picker", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.connectors("");
    // No args → wizard-based action picker
    expect(ctx.wizardConfigRef.current).not.toBeNull();
    expect(ctx.dispatched.some((a: any) => a.type === "SET_PHASE" && a.phase === "wizard")).toBe(true);
  });

  test("/channelslist in daemon mode lists channels", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.channels("list");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/connectorsconnect without args in daemon mode launches wizard", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.connectors("connect");
    // Either launches wizard or shows a "no services" message
    expect(ctx.messages.length > 0 || ctx.wizardConfigRef.current !== null).toBe(true);
  });

  test("/connectorsdisconnect without args in daemon mode launches wizard", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.connectors("disconnect");
    // Either launches wizard or shows a "no services" message
    expect(ctx.messages.length > 0 || ctx.wizardConfigRef.current !== null).toBe(true);
  });

  test("/connectorsauth with no args launches auth wizard", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.connectors("auth");
    // Either launches wizard or shows connectors
    expect(ctx.messages.length > 0 || ctx.wizardConfigRef.current !== null).toBe(true);
  });

  test("/connectorshealth checks connector health", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createConnectorHandlers(ctx);
    await h.connectors("health");
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

  test("/skillslist lists skills", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.skills("list");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/skillswith name shows detail", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.skills("test-skill");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/skillswithout name launches skill picker wizard", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.skills("");
    // Either launches wizard (if skills exist) or shows "no skills" message
    expect(ctx.messages.length > 0 || ctx.wizardConfigRef.current !== null).toBe(true);
  });

  test("/skillswith unknown name shows error", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.skills("not-found");
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

  test("/status requires daemon with actionable guidance", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.status();
    const msg = ctx.messages[0]!;
    expect(msg).toContain("daemon");
    expect(msg).toContain("jeriko server start");
    expect(msg).toContain("jeriko");
  });

  test("/plan shows plan info", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.plan();
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/upgrade without email launches email wizard with proper validation", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.upgrade("");
    expect(ctx.wizardConfigRef.current).not.toBeNull();
    expect(ctx.wizardConfigRef.current!.title).toContain("Upgrade");

    // Test the email validation function
    const step = ctx.wizardConfigRef.current!.steps[0]!;
    const validate = step.validate!;
    expect(validate("not-an-email")).toBeDefined();        // invalid
    expect(validate("foo@")).toBeDefined();                 // invalid
    expect(validate("user@example.com")).toBeUndefined();   // valid
    expect(validate("a@b.c")).toBeUndefined();              // valid minimal
    expect(validate("with spaces@bad.com")).toBeDefined();  // invalid
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
    expect(ctx.messages[0]).toContain("billing.stripe.com");
  });

  test("/tasks no args launches wizard picker", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createSystemHandlers(ctx);
    await h.tasks("");
    // No args now launches an interactive wizard instead of showing hub directly
    expect(ctx.wizardConfigRef.current).not.toBeNull();
    expect((ctx.wizardConfigRef.current as any)?.title).toBe("Tasks");
  });

  test("/tasks list shows task hub", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createSystemHandlers(ctx);
    await h.tasks("list");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/taskstrigger filters triggers", async () => {
    const ctx = createTestCtx({ mode: "daemon" } as any);
    const h = createSystemHandlers(ctx);
    await h.tasks("trigger");
    expect(ctx.messages.length).toBeGreaterThan(0);
  });

  test("/tasksrequires daemon", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.tasks("");
    expect(ctx.messages[0]).toContain("daemon");
  });

  test("/notifications launches interactive toggle picker", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.notifications("");
    // No args → wizard-based enable/disable picker
    expect(ctx.wizardConfigRef.current).not.toBeNull();
    expect(ctx.dispatched.some((a: any) => a.type === "SET_PHASE" && a.phase === "wizard")).toBe(true);
  });

  test("/theme with no args lists themes (includes active)", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.theme("");
    // New Subsystem-8 behaviour: shows the list with ▸ on the active theme.
    expect(ctx.messages[0]).toContain("jeriko");
    expect(ctx.messages[0]).toContain("▸");
  });

  test("/theme <unknown> surfaces an error message", async () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    await h.theme("anything");
    expect(ctx.messages[0]).toContain("Unknown theme");
  });

  test("/keybindings toggles the help controller", async () => {
    const ctx = createTestCtx();
    let toggled = 0;
    ctx.helpControllerRef.current.toggle = () => { toggled++; };
    const h = createSystemHandlers(ctx);
    await h.keybindings("");
    expect(toggled).toBe(1);
  });
});
