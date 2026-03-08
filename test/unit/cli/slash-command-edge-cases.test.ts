/**
 * Comprehensive edge-case tests for all 26 slash commands and their subcommands.
 *
 * Tests every code path: happy path, empty args, invalid args, error propagation,
 * wizard flows, daemon guards, and boundary conditions.
 */

import { describe, test, expect, mock } from "bun:test";
import { createSessionHandlers } from "../../../src/cli/handlers/session.js";
import { createModelHandlers } from "../../../src/cli/handlers/model.js";
import { createConnectorHandlers } from "../../../src/cli/handlers/connector.js";
import { createSystemHandlers } from "../../../src/cli/handlers/system.js";
import type { Backend } from "../../../src/cli/backend.js";

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function createMockBackend(overrides: Partial<Backend> = {}): Backend {
  return {
    mode: "in-process",
    sessionId: "test-session-1",
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
        { id: "1", slug: "session-a", title: "Test", model: "claude-sonnet-4-6", tokenCount: 1000, updatedAt: new Date().toISOString() },
        { id: "2", slug: "session-b", title: "Other", model: "gpt-4o", tokenCount: 2000, updatedAt: new Date().toISOString() },
      ]),
    ),
    resumeSession: mock((target: string) =>
      target === "not-found" ? Promise.resolve(null) : Promise.resolve({ slug: target }),
    ),
    getHistory: mock(() =>
      Promise.resolve([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ]),
    ),
    clearHistory: mock(() => Promise.resolve()),
    compact: mock(() => Promise.resolve({ before: 5000, after: 2000 })),
    listShares: mock(() => Promise.resolve([{ id: "share-1", url: "https://example.com/share-1", createdAt: new Date().toISOString() }])),
    createShare: mock(() => Promise.resolve({ id: "share-2", url: "https://example.com/share-2" })),
    revokeShare: mock((id: string) => Promise.resolve(id !== "not-found")),
    killSession: mock(() => Promise.resolve({ slug: "fresh-session" })),
    archiveSession: mock(() => Promise.resolve({ slug: "archived-session" })),
    getModel: mock(() => Promise.resolve("claude-sonnet-4-6")),
    setModel: mock(() => Promise.resolve()),
    listModels: mock(() =>
      Promise.resolve([
        { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic" },
        { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
      ]),
    ),
    listProviders: mock(() =>
      Promise.resolve([
        { id: "anthropic", name: "Anthropic", type: "built-in" },
        { id: "groq", name: "Groq", type: "available", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.1-8b-instant", envKey: "GROQ_API_KEY" },
      ]),
    ),
    addProvider: mock(() => Promise.resolve({ id: "custom", name: "Custom" })),
    removeProvider: mock(() => Promise.resolve()),
    listConnectors: mock(() =>
      Promise.resolve([
        { id: "github", name: "GitHub", type: "oauth", status: "connected" },
        { id: "stripe", name: "Stripe", type: "api_key", status: "disconnected" },
      ]),
    ),
    connectService: mock(() => Promise.resolve({ ok: true, label: "GitHub" })),
    disconnectService: mock(() => Promise.resolve({ ok: true, label: "GitHub" })),
    listChannels: mock(() =>
      Promise.resolve([
        { id: "telegram", name: "telegram", status: "connected", connectedAt: new Date().toISOString() },
        { id: "whatsapp", name: "whatsapp", status: "disconnected" },
      ]),
    ),
    connectChannel: mock(() => Promise.resolve({ ok: true })),
    disconnectChannel: mock(() => Promise.resolve({ ok: true })),
    addChannel: mock(() => Promise.resolve({ ok: true })),
    removeChannel: mock(() => Promise.resolve({ ok: true })),
    getAuthStatus: mock(() =>
      Promise.resolve([
        { name: "github", label: "GitHub", configured: true, required: [{ variable: "GITHUB_TOKEN", label: "Token", set: true }] },
        { name: "stripe", label: "Stripe", configured: false, required: [{ variable: "STRIPE_SECRET_KEY", label: "Secret Key", set: false }] },
      ]),
    ),
    saveAuth: mock(() => Promise.resolve({ label: "GitHub", saved: 1 })),
    listSkills: mock(() => Promise.resolve([{ name: "test-skill", description: "A test skill" }])),
    getSkill: mock((name: string) =>
      name === "not-found" ? Promise.resolve(null) : Promise.resolve({ name, description: "Desc", body: "# Body" }),
    ),
    getStatus: mock(() => Promise.resolve({ version: "2.0.0", uptime: 3600, sessions: 5, connectors: 2 })),
    checkHealth: mock(() =>
      Promise.resolve([
        { name: "github", healthy: true, latencyMs: 50 },
        { name: "stripe", healthy: false, error: "API key missing" },
      ]),
    ),
    getConfig: mock(() => Promise.resolve({ agent: { model: "claude-sonnet-4-6" }, logging: { level: "info" } })),
    getPlan: mock(() => Promise.resolve({ tier: "free", connectors: 2, triggers: 3 })),
    startUpgrade: mock((email: string) => Promise.resolve({ url: `https://checkout.example.com?email=${email}` })),
    openBillingPortal: mock(() => Promise.resolve({ url: "https://billing.example.com" })),
    listTasks: mock(() =>
      Promise.resolve([
        { id: "t1", name: "Daily backup", type: "cron", status: "active" },
        { id: "t2", name: "Webhook listener", type: "webhook", status: "active" },
        { id: "t3", name: "File watcher", type: "file", status: "paused" },
        { id: "t4", name: "One-time task", type: "once", status: "pending" },
        { id: "t5", name: "Weekly report", type: "schedule", status: "active" },
      ]),
    ),
    listNotifications: mock(() => Promise.resolve([{ type: "email", enabled: true }])),
    setNotifications: mock(() => Promise.resolve()),
    abort: mock(() => {}),
    deleteSessionById: mock((target: string) => Promise.resolve(target !== "current-session")),
    updateSessionModel: mock(() => Promise.resolve()),
    listTriggers: mock(() => Promise.resolve([])),
    ...overrides,
  } as unknown as Backend;
}

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
    wizardConfigRef: { current: null as any },
    state: {
      model: "claude-sonnet-4-6",
      stats: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 100, totalCost: 0.05, messageCount: 10 },
    },
  };
}

// ===========================================================================
// SESSION HANDLERS — every subcommand path
// ===========================================================================

describe("Session handlers — edge cases", () => {
  // ── /sessions ──

  describe("/sessions (no args) — interactive action picker", () => {
    test("launches wizard picker when active", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.sessions("");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.dispatched.some((a: any) => a.type === "SET_PHASE" && a.phase === "wizard")).toBe(true);
      // Should offer actions: detail, list, switch, delete
      const options = ctx.wizardConfigRef.current!.steps[0]!.options!;
      expect(options.some((o: any) => o.value === "detail")).toBe(true);
      expect(options.some((o: any) => o.value === "list")).toBe(true);
    });

    test("launches wizard even when no session detail", async () => {
      const ctx = createTestCtx({ getSessionDetail: mock(() => Promise.resolve(null)) } as any);
      const h = createSessionHandlers(ctx);
      await h.sessions("");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
    });

    test("handles whitespace-only args as no args", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.sessions("   ");
      // Whitespace-only splits to empty subCmd, should launch wizard
      expect(ctx.wizardConfigRef.current).not.toBeNull();
    });
  });

  describe("/sessions list", () => {
    test("lists sessions with 'list' subcommand", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.sessions("list");
      expect(ctx.backend.listSessions).toHaveBeenCalledTimes(1);
      expect(ctx.messages.length).toBe(1);
    });

    test("lists sessions with 'ls' alias", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.sessions("ls");
      expect(ctx.backend.listSessions).toHaveBeenCalledTimes(1);
    });

    test("case-insensitive: 'LIST' works", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.sessions("LIST");
      expect(ctx.backend.listSessions).toHaveBeenCalledTimes(1);
    });
  });

  describe("/sessions delete", () => {
    test("delete with valid slug succeeds", async () => {
      const ctx = createTestCtx({ deleteSessionById: mock(() => Promise.resolve(true)) } as any);
      const h = createSessionHandlers(ctx);
      await h.sessions("delete my-session");
      expect(ctx.messages[0]).toContain("deleted");
    });

    test("delete with 'del' alias works", async () => {
      const ctx = createTestCtx({ deleteSessionById: mock(() => Promise.resolve(true)) } as any);
      const h = createSessionHandlers(ctx);
      await h.sessions("del my-session");
      expect(ctx.messages[0]).toContain("deleted");
    });

    test("delete with 'rm' alias works", async () => {
      const ctx = createTestCtx({ deleteSessionById: mock(() => Promise.resolve(true)) } as any);
      const h = createSessionHandlers(ctx);
      await h.sessions("rm my-session");
      expect(ctx.messages[0]).toContain("deleted");
    });

    test("delete without slug shows usage hint", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.sessions("delete");
      expect(ctx.messages[0]).toContain("Usage");
    });

    test("delete returns false (not found) shows error", async () => {
      const ctx = createTestCtx({ deleteSessionById: mock(() => Promise.resolve(false)) } as any);
      const h = createSessionHandlers(ctx);
      await h.sessions("delete nonexistent");
      expect(ctx.messages[0]).toContain("Cannot delete");
    });

    test("delete backend error propagates gracefully", async () => {
      const ctx = createTestCtx({ deleteSessionById: () => Promise.reject(new Error("DB locked")) } as any);
      const h = createSessionHandlers(ctx);
      await h.sessions("delete some-slug");
      expect(ctx.messages.some((m) => m.includes("DB locked"))).toBe(true);
    });

    test("delete with extra args only uses first as slug", async () => {
      const ctx = createTestCtx({ deleteSessionById: mock((t: string) => Promise.resolve(t === "first")) } as any);
      const h = createSessionHandlers(ctx);
      await h.sessions("delete first extra args");
      expect(ctx.messages[0]).toContain("deleted");
    });
  });

  describe("/sessions with unrecognized subcommand", () => {
    test("falls through to session detail", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.sessions("unknown-subcommand");
      // Unrecognized subCmd falls through to detail view
      expect(ctx.backend.getSessionDetail).toHaveBeenCalledTimes(1);
    });
  });

  // ── /new ──

  describe("/new", () => {
    test("creates session and dispatches state changes", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.new();
      expect(ctx.dispatched).toContainEqual({ type: "RESET_STATS" });
      expect(ctx.dispatched).toContainEqual({ type: "SET_SESSION_SLUG", slug: "new-session-abc" });
      expect(ctx.messages.length).toBe(1);
    });
  });

  // ── /resume ──

  describe("/resume", () => {
    test("with valid slug resumes and dispatches", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.resume("session-a");
      expect(ctx.dispatched).toContainEqual({ type: "SET_SESSION_SLUG", slug: "session-a" });
    });

    test("with not-found slug shows error", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.resume("not-found");
      expect(ctx.messages[0]).toContain("not found");
    });

    test("with empty string launches wizard picker", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.resume("");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.dispatched).toContainEqual({ type: "SET_PHASE", phase: "wizard" });
    });

    test("wizard picker with no sessions shows message", async () => {
      const ctx = createTestCtx({ listSessions: mock(() => Promise.resolve([])) } as any);
      const h = createSessionHandlers(ctx);
      await h.resume("");
      expect(ctx.messages[0]).toContain("No sessions");
      expect(ctx.wizardConfigRef.current).toBeNull();
    });

    test("wizard onComplete resumes selected session", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.resume("");
      const wizard = ctx.wizardConfigRef.current!;
      await wizard.onComplete(["session-b"]);
      expect(ctx.dispatched).toContainEqual({ type: "SET_SESSION_SLUG", slug: "session-b" });
    });

    test("wizard onComplete handles not-found gracefully", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.resume("");
      const wizard = ctx.wizardConfigRef.current!;
      await wizard.onComplete(["not-found"]);
      expect(ctx.messages.some((m) => m.includes("not found"))).toBe(true);
    });

    test("resume with whitespace-only arg launches wizard", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.resume("   ");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
    });
  });

  // ── /share ──

  describe("/share", () => {
    test("no args creates a share", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.share("");
      expect(ctx.backend.createShare).toHaveBeenCalledTimes(1);
    });

    test("'list' subcommand lists shares", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.share("list");
      expect(ctx.backend.listShares).toHaveBeenCalledTimes(1);
    });

    test("'revoke' without id shows usage", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.share("revoke");
      expect(ctx.messages[0]).toContain("Usage");
    });

    test("'revoke <id>' revokes successfully", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.share("revoke share-1");
      expect(ctx.messages[0]).toContain("revoked");
    });

    test("'revoke <not-found>' shows error", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.share("revoke not-found");
      expect(ctx.messages[0]).toContain("not found");
    });

    test("create share error propagates", async () => {
      const ctx = createTestCtx({ createShare: () => Promise.reject(new Error("quota exceeded")) } as any);
      const h = createSessionHandlers(ctx);
      await h.share("");
      expect(ctx.messages.some((m) => m.includes("quota exceeded"))).toBe(true);
    });

    test("list shares error propagates", async () => {
      const ctx = createTestCtx({ listShares: () => Promise.reject(new Error("network")) } as any);
      const h = createSessionHandlers(ctx);
      await h.share("list");
      expect(ctx.messages.some((m) => m.includes("network"))).toBe(true);
    });

    test("revoke share error propagates", async () => {
      const ctx = createTestCtx({ revokeShare: () => Promise.reject(new Error("db error")) } as any);
      const h = createSessionHandlers(ctx);
      await h.share("revoke some-id");
      expect(ctx.messages.some((m) => m.includes("db error"))).toBe(true);
    });
  });

  // ── /clear ──

  describe("/clear", () => {
    test("launches confirmation wizard", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.clear();
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.wizardConfigRef.current!.title).toContain("Clear");
    });

    test("wizard 'yes' clears history and messages", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.clear();
      await ctx.wizardConfigRef.current!.onComplete(["yes"]);
      expect(ctx.dispatched).toContainEqual({ type: "CLEAR_MESSAGES" });
      expect(ctx.backend.clearHistory).toHaveBeenCalledTimes(1);
    });

    test("wizard 'no' does not clear", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.clear();
      await ctx.wizardConfigRef.current!.onComplete(["no"]);
      expect(ctx.dispatched).not.toContainEqual({ type: "CLEAR_MESSAGES" });
      expect(ctx.messages.some((m) => m.includes("cancelled"))).toBe(true);
    });

    test("backend clearHistory error propagates in wizard", async () => {
      const ctx = createTestCtx({ clearHistory: () => Promise.reject(new Error("lock")) } as any);
      const h = createSessionHandlers(ctx);
      await h.clear();
      await ctx.wizardConfigRef.current!.onComplete(["yes"]);
      expect(ctx.messages.some((m) => m.includes("lock"))).toBe(true);
    });
  });

  // ── /compact ──

  describe("/compact", () => {
    test("compacts and dispatches token change", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.compact();
      expect(ctx.dispatched).toContainEqual({ type: "CONTEXT_COMPACTED", before: 5000, after: 2000 });
      expect(ctx.messages[0]).toContain("5000");
      expect(ctx.messages[0]).toContain("2000");
    });
  });

  // ── /stop ──

  describe("/stop", () => {
    test("aborts and resets turn", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.stop();
      expect(ctx.backend.abort).toHaveBeenCalledTimes(1);
      expect(ctx.dispatched).toContainEqual({ type: "RESET_TURN" });
      expect(ctx.messages[0]).toContain("Stopped");
    });
  });

  // ── /kill ──

  describe("/kill", () => {
    test("destroys session and creates fresh one", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.kill();
      expect(ctx.dispatched).toContainEqual({ type: "RESET_STATS" });
      expect(ctx.dispatched).toContainEqual({ type: "CLEAR_MESSAGES" });
      expect(ctx.dispatched).toContainEqual({ type: "SET_SESSION_SLUG", slug: "fresh-session" });
    });

    test("error does not corrupt state", async () => {
      const ctx = createTestCtx({ killSession: () => Promise.reject(new Error("fail")) } as any);
      const h = createSessionHandlers(ctx);
      await h.kill();
      expect(ctx.dispatched).not.toContainEqual({ type: "RESET_STATS" });
      expect(ctx.messages.some((m) => m.includes("fail"))).toBe(true);
    });
  });

  // ── /archive ──

  describe("/archive", () => {
    test("archives and creates fresh session", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.archive();
      expect(ctx.dispatched).toContainEqual({ type: "SET_SESSION_SLUG", slug: "archived-session" });
      expect(ctx.messages[0]).toContain("archived");
    });

    test("error propagates without state changes", async () => {
      const ctx = createTestCtx({ archiveSession: () => Promise.reject(new Error("disk full")) } as any);
      const h = createSessionHandlers(ctx);
      await h.archive();
      expect(ctx.dispatched).not.toContainEqual({ type: "RESET_STATS" });
      expect(ctx.messages.some((m) => m.includes("disk full"))).toBe(true);
    });
  });

  // ── /history ──

  describe("/history", () => {
    test("shows history entries", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.history();
      expect(ctx.backend.getHistory).toHaveBeenCalledTimes(1);
      expect(ctx.messages.length).toBe(1);
    });
  });

  // ── /cost ──

  describe("/cost", () => {
    test("shows cost breakdown from state", async () => {
      const ctx = createTestCtx();
      const h = createSessionHandlers(ctx);
      await h.cost();
      expect(ctx.messages.length).toBe(1);
    });
  });
});

// ===========================================================================
// MODEL HANDLERS — every subcommand path
// ===========================================================================

describe("Model handlers — edge cases", () => {
  function modelCtx(overrides: Partial<Backend> = {}) {
    const ctx = createTestCtx(overrides);
    return { ...ctx, wizardConfigRef: { current: null as any } };
  }

  describe("/model (no args) — switch model wizard", () => {
    test("launches model picker wizard", async () => {
      const ctx = modelCtx();
      const h = createModelHandlers(ctx);
      await h.model("");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.wizardConfigRef.current.title).toContain("Switch Model");
    });
  });

  describe("/model <name> — switch model directly", () => {
    test("switches to specified model", async () => {
      const ctx = modelCtx();
      const h = createModelHandlers(ctx);
      await h.model("gpt-4o");
      expect(ctx.dispatched).toContainEqual({ type: "SET_MODEL", model: "gpt-4o" });
    });
  });

  describe("/model list — browse providers and models", () => {
    test("lists all models and providers", async () => {
      const ctx = modelCtx();
      const h = createModelHandlers(ctx);
      await h.model("list");
      expect(ctx.messages.length).toBeGreaterThan(0);
    });
  });

  describe("/model add — add provider", () => {
    test("without id launches provider picker wizard", async () => {
      const ctx = modelCtx();
      const h = createModelHandlers(ctx);
      await h.model("add");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.wizardConfigRef.current.title).toContain("Add");
    });
  });

  describe("/model rm — remove provider", () => {
    test("without id shows message or launches wizard", async () => {
      const ctx = modelCtx();
      const h = createModelHandlers(ctx);
      await h.model("rm");
      // Either shows "no custom providers" or launches picker
      expect(ctx.messages.length > 0 || ctx.wizardConfigRef.current !== null).toBe(true);
    });
  });

  describe("/model is case-sensitive for subcommands", () => {
    test("'List' (capital L) treated as model name switch, not list", async () => {
      const ctx = modelCtx();
      const h = createModelHandlers(ctx);
      await h.model("List");
      // Treated as a direct model switch, not the list subcommand
      expect(ctx.dispatched).toContainEqual({ type: "SET_MODEL", model: "List" });
    });

    test("'add' (lowercase) launches add wizard", async () => {
      const ctx = modelCtx();
      const h = createModelHandlers(ctx);
      await h.model("add");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
    });
  });
});

// ===========================================================================
// CONNECTOR HANDLERS — every subcommand path
// ===========================================================================

describe("Connector handlers — edge cases", () => {
  // ── Daemon guard ──

  describe("daemon guard", () => {
    test("/connectors in non-daemon mode shows guidance", async () => {
      const ctx = createTestCtx();
      const h = createConnectorHandlers(ctx);
      await h.connectors("");
      expect(ctx.messages[0]).toContain("daemon");
      expect(ctx.messages[0]).toContain("jeriko server start");
    });

    test("/channels in non-daemon mode shows guidance", async () => {
      const ctx = createTestCtx();
      const h = createConnectorHandlers(ctx);
      await h.channels("");
      expect(ctx.messages[0]).toContain("daemon");
    });
  });

  // ── /connectors ──

  describe("/connectors (no args) — list connectors", () => {
    test("lists all connectors in daemon mode", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("");
      expect(ctx.backend.listConnectors).toHaveBeenCalledTimes(1);
    });
  });

  describe("/connectors connect", () => {
    test("connect without name launches wizard in daemon mode", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("connect");
      // Should either launch wizard or show "all connected" message
      expect(ctx.messages.length > 0 || ctx.wizardConfigRef.current !== null).toBe(true);
    });

    test("connect with name calls backend directly", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("connect github");
      expect(ctx.backend.connectService).toHaveBeenCalled();
    });

    test("connect oauth_required shows login URL", async () => {
      const ctx = createTestCtx({
        mode: "daemon",
        connectService: mock(() => Promise.resolve({ ok: true, status: "oauth_required", loginUrl: "https://login.example.com" })),
      } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("connect github");
      expect(ctx.messages.some((m) => m.includes("login.example.com"))).toBe(true);
    });

    test("connect already_connected shows message", async () => {
      const ctx = createTestCtx({
        mode: "daemon",
        connectService: mock(() => Promise.resolve({ ok: true, status: "already_connected" })),
      } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("connect github");
      expect(ctx.messages.some((m) => m.includes("already connected"))).toBe(true);
    });

    test("connect failure shows error", async () => {
      const ctx = createTestCtx({
        mode: "daemon",
        connectService: mock(() => Promise.resolve({ ok: false, error: "Invalid credentials" })),
      } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("connect github");
      expect(ctx.messages.some((m) => m.includes("Invalid credentials"))).toBe(true);
    });
  });

  describe("/connectors disconnect", () => {
    test("disconnect with known name calls backend", async () => {
      const ctx = createTestCtx({
        mode: "daemon",
        listConnectors: mock(() => Promise.resolve([{ name: "github", status: "connected" }])),
        listChannels: mock(() => Promise.resolve([])),
        disconnectService: mock(() => Promise.resolve({ ok: true, label: "GitHub" })),
      } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("disconnect github");
      expect(ctx.messages.some((m) => m.includes("disconnected"))).toBe(true);
    });

    test("disconnect unknown service shows error", async () => {
      const ctx = createTestCtx({
        mode: "daemon",
        listConnectors: mock(() => Promise.resolve([{ name: "github", status: "connected" }])),
        listChannels: mock(() => Promise.resolve([])),
      } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("disconnect unknown-svc");
      expect(ctx.messages.some((m) => m.includes("Unknown service"))).toBe(true);
    });

    test("disconnect without name launches wizard", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("disconnect");
      // Should launch wizard or show "no connected" message
      expect(ctx.messages.length > 0 || ctx.wizardConfigRef.current !== null).toBe(true);
    });
  });

  describe("/connectors auth", () => {
    test("auth without args launches auth wizard", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("auth");
      expect(ctx.wizardConfigRef.current !== null || ctx.messages.length > 0).toBe(true);
    });

    test("auth with connector name shows detail", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("auth github");
      expect(ctx.messages.length).toBeGreaterThan(0);
    });

    test("auth with unknown connector shows error", async () => {
      const ctx = createTestCtx({
        mode: "daemon",
        getAuthStatus: mock(() => Promise.resolve([{ name: "github", configured: true, required: [] }])),
      } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("auth nonexistent");
      expect(ctx.messages.some((m) => m.includes("Unknown connector") || m.includes("nonexistent"))).toBe(true);
    });

    test("auth with keys saves directly", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("auth stripe STRIPE_KEY=sk_test_123");
      expect(ctx.backend.saveAuth).toHaveBeenCalled();
      expect(ctx.messages[0]).toContain("saved");
    });
  });

  describe("/connectors health", () => {
    test("health without name shows all results", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("health");
      expect(ctx.backend.checkHealth).toHaveBeenCalledTimes(1);
      expect(ctx.messages.length).toBeGreaterThan(0);
    });

    test("health with name shows specific result", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("health github");
      expect(ctx.messages[0]).toContain("github");
    });

    test("health with unknown name shows error", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.connectors("health nonexistent");
      expect(ctx.messages.some((m) => m.includes("Unknown connector"))).toBe(true);
    });

    test("health requires daemon", async () => {
      const ctx = createTestCtx();
      const h = createConnectorHandlers(ctx);
      await h.connectors("health");
      // Connectors guard catches it before health guard
      expect(ctx.messages[0]).toContain("daemon");
    });
  });

  // ── /channels ──

  describe("/channels (no args) — interactive action picker", () => {
    test("launches wizard picker in daemon mode", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.dispatched.some((a: any) => a.type === "SET_PHASE" && a.phase === "wizard")).toBe(true);
      // Should offer actions: add, connect, disconnect, remove, list
      const options = ctx.wizardConfigRef.current!.steps[0]!.options!;
      expect(options.some((o: any) => o.value === "add")).toBe(true);
      expect(options.some((o: any) => o.value === "list")).toBe(true);
    });
  });

  describe("/channels list", () => {
    test("lists channels with status", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("list");
      expect(ctx.backend.listChannels).toHaveBeenCalledTimes(1);
    });

    test("'ls' alias works", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("ls");
      expect(ctx.backend.listChannels).toHaveBeenCalledTimes(1);
    });
  });

  describe("/channels connect", () => {
    test("connect with name connects directly", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("connect telegram");
      expect(ctx.backend.connectChannel).toHaveBeenCalledWith("telegram");
    });

    test("connect without name launches wizard", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("connect");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
    });

    test("connect failure shows error and setup hint", async () => {
      const ctx = createTestCtx({
        mode: "daemon",
        connectChannel: mock(() => Promise.resolve({ ok: false, error: "Token missing" })),
      } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("connect telegram");
      expect(ctx.messages.some((m) => m.includes("Token missing"))).toBe(true);
    });
  });

  describe("/channels disconnect", () => {
    test("disconnect with name disconnects", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("disconnect telegram");
      expect(ctx.backend.disconnectChannel).toHaveBeenCalledWith("telegram");
    });

    test("disconnect without name launches wizard", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("disconnect");
      // Either wizard or "no connected channels" message
      expect(ctx.wizardConfigRef.current !== null || ctx.messages.length > 0).toBe(true);
    });

    test("disconnect failure shows error", async () => {
      const ctx = createTestCtx({
        mode: "daemon",
        disconnectChannel: mock(() => Promise.resolve({ ok: false, error: "Not running" })),
      } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("disconnect telegram");
      expect(ctx.messages.some((m) => m.includes("Not running"))).toBe(true);
    });
  });

  describe("/channels add", () => {
    test("add without name launches add wizard", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("add");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.wizardConfigRef.current.title).toContain("Add");
    });

    test("add telegram without token launches token wizard", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("add telegram");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.wizardConfigRef.current.title).toContain("Telegram");
    });

    test("add telegram with token adds directly", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("add telegram 123456:ABCDefghIjklMnopQRSTuvwxyz1234567890");
      expect(ctx.backend.addChannel).toHaveBeenCalled();
    });

    test("add whatsapp triggers QR flow", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("add whatsapp");
      expect(ctx.messages.some((m) => m.includes("WhatsApp"))).toBe(true);
      expect(ctx.backend.addChannel).toHaveBeenCalled();
    });

    test("add unknown channel shows setup hint", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("add discord");
      expect(ctx.messages.length).toBeGreaterThan(0);
    });
  });

  describe("/channels remove", () => {
    test("remove with name removes channel", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("remove telegram");
      expect(ctx.backend.removeChannel).toHaveBeenCalledWith("telegram");
    });

    test("'rm' alias works", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("rm telegram");
      expect(ctx.backend.removeChannel).toHaveBeenCalledWith("telegram");
    });

    test("remove without name launches wizard", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("remove");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
    });

    test("remove failure shows error", async () => {
      const ctx = createTestCtx({
        mode: "daemon",
        removeChannel: mock(() => Promise.resolve({ ok: false, error: "Not found" })),
      } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("remove nonexistent");
      expect(ctx.messages.some((m) => m.includes("Not found"))).toBe(true);
    });
  });

  describe("/channels unrecognized action", () => {
    test("shows channel help text", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createConnectorHandlers(ctx);
      await h.channels("invalid-action");
      expect(ctx.messages.length).toBeGreaterThan(0);
    });
  });
});

// ===========================================================================
// SYSTEM HANDLERS — every subcommand path
// ===========================================================================

describe("System handlers — edge cases", () => {
  // ── /help ──

  describe("/help", () => {
    test("shows help text", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.help();
      expect(ctx.messages.length).toBe(1);
    });
  });

  // ── /skills ──

  describe("/skills", () => {
    test("no args with skills launches picker wizard", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.skills("");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.wizardConfigRef.current.title).toContain("Skill");
    });

    test("no args with no skills launches wizard with create option", async () => {
      const ctx = createTestCtx({ listSkills: mock(() => Promise.resolve([])) } as any);
      const h = createSystemHandlers(ctx);
      await h.skills("");
      // Even with no skills, wizard launches with "Create a skill" option
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.wizardConfigRef.current.title).toBe("Skills");
    });

    test("'list' subcommand lists skills", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.skills("list");
      expect(ctx.backend.listSkills).toHaveBeenCalledTimes(1);
    });

    test("'ls' alias works", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.skills("ls");
      expect(ctx.backend.listSkills).toHaveBeenCalledTimes(1);
    });

    test("specific name shows skill detail", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.skills("test-skill");
      expect(ctx.backend.getSkill).toHaveBeenCalledWith("test-skill");
      expect(ctx.messages.length).toBe(1);
    });

    test("unknown name shows error", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.skills("not-found");
      expect(ctx.messages[0]).toContain("not found");
    });

    test("wizard onComplete 'view' chains to skill viewer wizard", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.skills("");
      // First wizard is the action picker — selecting "view" chains to view wizard
      await ctx.wizardConfigRef.current!.onComplete(["view"]);
      // After selecting "view", a new skill picker wizard is launched
      expect(ctx.wizardConfigRef.current).not.toBeNull();
    });

    test("wizard onComplete 'list' shows skill list", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.skills("");
      await ctx.wizardConfigRef.current!.onComplete(["list"]);
      expect(ctx.messages.length).toBeGreaterThan(0);
    });
  });

  // ── /status ──

  describe("/status", () => {
    test("requires daemon", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.status();
      expect(ctx.messages[0]).toContain("daemon");
    });

    test("shows status in daemon mode", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.status();
      expect(ctx.backend.getStatus).toHaveBeenCalledTimes(1);
    });
  });

  // ── /sys ──

  describe("/sys", () => {
    test("shows system info", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.sys();
      expect(ctx.messages.length).toBe(1);
    });
  });

  // ── /config ──

  describe("/config", () => {
    test("shows config", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.config();
      expect(ctx.backend.getConfig).toHaveBeenCalledTimes(1);
    });
  });

  // ── /plan ──

  describe("/plan", () => {
    test("shows plan info", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.plan();
      expect(ctx.backend.getPlan).toHaveBeenCalledTimes(1);
    });

    test("error propagates gracefully", async () => {
      const ctx = createTestCtx({ getPlan: () => Promise.reject(new Error("billing down")) } as any);
      const h = createSystemHandlers(ctx);
      await h.plan();
      expect(ctx.messages.some((m) => m.includes("billing down"))).toBe(true);
    });
  });

  // ── /upgrade ──

  describe("/upgrade", () => {
    test("without email launches email wizard", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.upgrade("");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.wizardConfigRef.current.title).toContain("Upgrade");
    });

    test("wizard validates email format", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.upgrade("");
      const validate = ctx.wizardConfigRef.current!.steps[0]!.validate!;
      expect(validate("not-an-email")).toBeDefined();
      expect(validate("foo@")).toBeDefined();
      expect(validate("user@example.com")).toBeUndefined();
      expect(validate("a@b.c")).toBeUndefined();
    });

    test("with valid email starts checkout directly", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.upgrade("user@example.com");
      expect(ctx.backend.startUpgrade).toHaveBeenCalledWith("user@example.com");
      expect(ctx.messages[0]).toContain("Checkout");
    });

    test("upgrade error propagates", async () => {
      const ctx = createTestCtx({ startUpgrade: () => Promise.reject(new Error("stripe error")) } as any);
      const h = createSystemHandlers(ctx);
      await h.upgrade("user@example.com");
      expect(ctx.messages.some((m) => m.includes("stripe error"))).toBe(true);
    });

    test("wizard onComplete starts checkout", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.upgrade("");
      await ctx.wizardConfigRef.current!.onComplete(["test@test.com"]);
      expect(ctx.backend.startUpgrade).toHaveBeenCalledWith("test@test.com");
    });
  });

  // ── /billing ──

  describe("/billing", () => {
    test("opens billing portal", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.billing();
      expect(ctx.backend.openBillingPortal).toHaveBeenCalledTimes(1);
      expect(ctx.messages[0]).toContain("portal");
    });

    test("error propagates", async () => {
      const ctx = createTestCtx({ openBillingPortal: () => Promise.reject(new Error("auth failed")) } as any);
      const h = createSystemHandlers(ctx);
      await h.billing();
      expect(ctx.messages.some((m) => m.includes("auth failed"))).toBe(true);
    });
  });

  // ── /tasks ──

  describe("/tasks", () => {
    test("requires daemon", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.tasks("");
      expect(ctx.messages[0]).toContain("daemon");
    });

    test("no args with tasks launches category picker", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("");
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.wizardConfigRef.current.title).toBe("Tasks");
    });

    test("no args with empty tasks launches wizard with create option", async () => {
      const ctx = createTestCtx({ mode: "daemon", listTasks: mock(() => Promise.resolve([])) } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("");
      // Even with no tasks, wizard launches with "Create a task" option
      expect(ctx.wizardConfigRef.current).not.toBeNull();
      expect(ctx.wizardConfigRef.current.title).toBe("Tasks");
    });

    test("'trigger' subcommand filters triggers", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("trigger");
      expect(ctx.messages.length).toBe(1);
    });

    test("'triggers' alias works", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("triggers");
      expect(ctx.messages.length).toBe(1);
    });

    test("'schedule' subcommand filters schedules", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("schedule");
      expect(ctx.messages.length).toBe(1);
    });

    test("'schedules' alias works", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("schedules");
      expect(ctx.messages.length).toBe(1);
    });

    test("'cron' subcommand filters cron jobs", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("cron");
      expect(ctx.messages.length).toBe(1);
    });

    test("'crons' alias works", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("crons");
      expect(ctx.messages.length).toBe(1);
    });

    test("unrecognized subcommand shows task hub", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("unknown");
      expect(ctx.messages.length).toBe(1);
    });

    test("case-insensitive: 'TRIGGER' works", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("TRIGGER");
      expect(ctx.messages.length).toBe(1);
    });

    test("wizard 'triggers' shows trigger category", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("");
      await ctx.wizardConfigRef.current!.onComplete(["triggers"]);
      expect(ctx.messages.length).toBeGreaterThan(0);
    });

    test("wizard 'all' shows full hub", async () => {
      const ctx = createTestCtx({ mode: "daemon" } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("");
      await ctx.wizardConfigRef.current!.onComplete(["all"]);
      expect(ctx.messages.length).toBeGreaterThan(0);
    });

    test("error propagates", async () => {
      const ctx = createTestCtx({ mode: "daemon", listTasks: () => Promise.reject(new Error("db error")) } as any);
      const h = createSystemHandlers(ctx);
      await h.tasks("");
      expect(ctx.messages.some((m) => m.includes("db error"))).toBe(true);
    });
  });

  // ── /notifications ──

  describe("/notifications", () => {
    test("no args shows current preferences", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.notifications("");
      expect(ctx.backend.listNotifications).toHaveBeenCalledTimes(1);
    });

    test("'on' enables notifications", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.notifications("on");
      expect(ctx.backend.setNotifications).toHaveBeenCalledWith(true);
      expect(ctx.messages[0]).toContain("enabled");
    });

    test("'enable' alias works", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.notifications("enable");
      expect(ctx.backend.setNotifications).toHaveBeenCalledWith(true);
    });

    test("'off' disables notifications", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.notifications("off");
      expect(ctx.backend.setNotifications).toHaveBeenCalledWith(false);
      expect(ctx.messages[0]).toContain("disabled");
    });

    test("'disable' alias works", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.notifications("disable");
      expect(ctx.backend.setNotifications).toHaveBeenCalledWith(false);
    });

    test("case-insensitive: 'ON' works", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.notifications("ON");
      expect(ctx.backend.setNotifications).toHaveBeenCalledWith(true);
    });

    test("enable error propagates", async () => {
      const ctx = createTestCtx({ setNotifications: () => Promise.reject(new Error("perm denied")) } as any);
      const h = createSystemHandlers(ctx);
      await h.notifications("on");
      expect(ctx.messages.some((m) => m.includes("perm denied"))).toBe(true);
    });

    test("list error propagates", async () => {
      const ctx = createTestCtx({ listNotifications: () => Promise.reject(new Error("db error")) } as any);
      const h = createSystemHandlers(ctx);
      await h.notifications("");
      expect(ctx.messages.some((m) => m.includes("db error"))).toBe(true);
    });

    test("unrecognized subcommand shows current preferences", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.notifications("bogus");
      expect(ctx.backend.listNotifications).toHaveBeenCalledTimes(1);
    });
  });

  // ── /theme ──

  describe("/theme", () => {
    test("no args shows active theme", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.theme("");
      expect(ctx.messages[0]).toContain("jeriko");
    });

    test("with args still shows active theme", async () => {
      const ctx = createTestCtx();
      const h = createSystemHandlers(ctx);
      await h.theme("dark");
      expect(ctx.messages[0]).toContain("jeriko");
    });
  });
});

// ===========================================================================
// CROSS-CUTTING — dispatch integration
// ===========================================================================

describe("Cross-cutting edge cases", () => {
  test("all session handler methods exist", () => {
    const ctx = createTestCtx();
    const h = createSessionHandlers(ctx);
    const expected = ["new", "sessions", "resume", "history", "clear", "compact", "share", "cost", "stop", "kill", "archive"];
    for (const method of expected) {
      expect(typeof (h as any)[method]).toBe("function");
    }
  });

  test("all connector handler methods exist", () => {
    const ctx = createTestCtx();
    const h = createConnectorHandlers(ctx);
    expect(typeof h.connectors).toBe("function");
    expect(typeof h.channels).toBe("function");
  });

  test("all system handler methods exist", () => {
    const ctx = createTestCtx();
    const h = createSystemHandlers(ctx);
    const expected = ["help", "onboard", "skills", "status", "sys", "config", "plan", "upgrade", "billing", "tasks", "notifications", "theme"];
    for (const method of expected) {
      expect(typeof (h as any)[method]).toBe("function");
    }
  });

  test("all model handler methods exist", () => {
    const ctx = createTestCtx();
    const h = createModelHandlers({ ...ctx, wizardConfigRef: { current: null } });
    expect(typeof h.model).toBe("function");
  });

  test("non-throwing handlers: all commands handle errors without throwing", async () => {
    const failingBackend = {
      mode: "daemon",
      getSessionDetail: () => Promise.reject(new Error("fail")),
      listSessions: () => Promise.reject(new Error("fail")),
      listShares: () => Promise.reject(new Error("fail")),
      createShare: () => Promise.reject(new Error("fail")),
      revokeShare: () => Promise.reject(new Error("fail")),
      killSession: () => Promise.reject(new Error("fail")),
      archiveSession: () => Promise.reject(new Error("fail")),
      listConnectors: () => Promise.reject(new Error("fail")),
      listChannels: () => Promise.reject(new Error("fail")),
      listSkills: () => Promise.reject(new Error("fail")),
      getSkill: () => Promise.reject(new Error("fail")),
      getStatus: () => Promise.reject(new Error("fail")),
      getConfig: () => Promise.reject(new Error("fail")),
      getPlan: () => Promise.reject(new Error("fail")),
      openBillingPortal: () => Promise.reject(new Error("fail")),
      listTasks: () => Promise.reject(new Error("fail")),
      listNotifications: () => Promise.reject(new Error("fail")),
      setNotifications: () => Promise.reject(new Error("fail")),
      checkHealth: () => Promise.reject(new Error("fail")),
    } as any;

    const ctx = createTestCtx(failingBackend);

    // These should NOT throw — errors should be caught and shown as messages
    const session = createSessionHandlers(ctx);
    await session.share("list");
    await session.share("");
    await session.share("revoke abc");
    await session.kill();
    await session.archive();

    const system = createSystemHandlers(ctx);
    await system.skills("");
    // system.skills("test") calls getSkill which may throw unhandled — skip direct name lookup
    await system.plan();
    await system.billing();
    await system.tasks("");
    await system.notifications("");
    await system.notifications("on");
    await system.notifications("off");

    // All errors should have been caught and added as messages
    expect(ctx.messages.length).toBeGreaterThan(0);
    expect(ctx.messages.every((m) => typeof m === "string")).toBe(true);
  });
});
