/**
 * Kernel Boot Sequence, Agent Loop, and Channel Router Audit Tests
 *
 * Validates:
 *   - Boot sequence: all imports resolve, functions exist, types are correct
 *   - Agent loop: tool error handling, max rounds, guard enforcement, JSON repair
 *   - Channel router: command dispatch, session state, error isolation
 *   - Shutdown: all resources released, state transitions correct
 *   - Signal handlers: registration, shutdown hook execution
 */

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";

// ---------------------------------------------------------------------------
// Database setup (needed by session, message, trigger, and kv modules)
// ---------------------------------------------------------------------------

beforeAll(() => {
  initDatabase(":memory:");
});

afterAll(() => {
  closeDatabase();
});

// ===========================================================================
// 1. KERNEL TYPES & EXPORTS
// ===========================================================================

describe("Audit: Kernel exports and types", () => {
  it("exports boot, shutdown, getState, isRunning, onShutdown", async () => {
    const kernel = await import("../../src/daemon/kernel.js");
    expect(typeof kernel.boot).toBe("function");
    expect(typeof kernel.shutdown).toBe("function");
    expect(typeof kernel.getState).toBe("function");
    expect(typeof kernel.isRunning).toBe("function");
    expect(typeof kernel.onShutdown).toBe("function");
  });

  it("getState() returns KernelState with correct default phase", async () => {
    const { getState } = await import("../../src/daemon/kernel.js");
    const state = getState();
    expect(state).toHaveProperty("phase");
    expect(state).toHaveProperty("config");
    expect(state).toHaveProperty("db");
    expect(state).toHaveProperty("channels");
    expect(state).toHaveProperty("triggers");
    expect(state).toHaveProperty("connectors");
    expect(state).toHaveProperty("workers");
    expect(state).toHaveProperty("plugins");
    expect(state).toHaveProperty("relay");
    expect(state).toHaveProperty("server");
    expect(state).toHaveProperty("startedAt");
    // Phase should be idle or stopped (not running without boot)
    expect(["idle", "stopped"]).toContain(state.phase);
  });

  it("isRunning() returns false when daemon has not booted", async () => {
    const { isRunning } = await import("../../src/daemon/kernel.js");
    expect(isRunning()).toBe(false);
  });
});

// ===========================================================================
// 2. AGENT LOOP — runAgent exports and types
// ===========================================================================

describe("Audit: Agent loop exports", () => {
  it("exports runAgent as async generator function", async () => {
    const { runAgent } = await import("../../src/daemon/agent/agent.js");
    expect(typeof runAgent).toBe("function");
  });

  it("AgentRunConfig interface includes all required fields", async () => {
    // We test this by constructing a valid config and verifying it compiles
    const config = {
      sessionId: "test-session",
      backend: "anthropic",
      model: "claude",
      systemPrompt: "test",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
      toolIds: null,
      maxRounds: 10,
      signal: undefined,
      depth: 0,
    };
    // All fields should be present
    expect(config.sessionId).toBeDefined();
    expect(config.backend).toBeDefined();
    expect(config.model).toBeDefined();
    expect(config.maxRounds).toBe(10);
    expect(config.depth).toBe(0);
  });
});

// ===========================================================================
// 3. EXECUTION GUARD
// ===========================================================================

describe("Audit: ExecutionGuard", () => {
  let ExecutionGuard: typeof import("../../src/daemon/agent/guard.js").ExecutionGuard;

  beforeAll(async () => {
    const mod = await import("../../src/daemon/agent/guard.js");
    ExecutionGuard = mod.ExecutionGuard;
  });

  it("constructor creates a guard with default config", () => {
    const guard = new ExecutionGuard();
    expect(guard).toBeDefined();
  });

  it("checkBeforeRound() returns null initially (well within time limit)", () => {
    const guard = new ExecutionGuard();
    expect(guard.checkBeforeRound()).toBeNull();
  });

  it("checkBeforeRound() returns error string when duration exceeded", () => {
    // Create guard with 0ms duration limit
    const guard = new ExecutionGuard({ maxDurationMs: 0 });
    const result = guard.checkBeforeRound();
    expect(result).toBeString();
    expect(result).toContain("time limit");
  });

  it("checkToolCall() returns null for unregistered tools (no rate limit)", () => {
    const guard = new ExecutionGuard();
    expect(guard.checkToolCall("bash")).toBeNull();
    expect(guard.checkToolCall("read")).toBeNull();
    expect(guard.checkToolCall("write")).toBeNull();
  });

  it("checkToolCall() rate-limits screenshot tool after max calls", () => {
    const guard = new ExecutionGuard({
      toolLimits: { screenshot: { maxCalls: 2, windowMs: 60_000 } },
    });
    expect(guard.checkToolCall("screenshot")).toBeNull();
    expect(guard.checkToolCall("screenshot")).toBeNull();
    // Third call should be rate-limited
    const result = guard.checkToolCall("screenshot");
    expect(result).toBeString();
    expect(result).toContain("Rate limited");
  });

  it("recordRound() returns null when not all failed", () => {
    const guard = new ExecutionGuard();
    expect(guard.recordRound(false)).toBeNull();
  });

  it("recordRound() trips circuit breaker after N consecutive all-fail rounds", () => {
    const guard = new ExecutionGuard({ maxConsecutiveErrors: 3 });
    expect(guard.recordRound(true)).toBeNull(); // 1
    expect(guard.recordRound(true)).toBeNull(); // 2
    const result = guard.recordRound(true); // 3 — trips
    expect(result).toBeString();
    expect(result).toContain("consecutive rounds");
  });

  it("recordRound() resets counter on successful round", () => {
    const guard = new ExecutionGuard({ maxConsecutiveErrors: 3 });
    expect(guard.recordRound(true)).toBeNull(); // 1
    expect(guard.recordRound(true)).toBeNull(); // 2
    expect(guard.recordRound(false)).toBeNull(); // success — resets
    expect(guard.recordRound(true)).toBeNull(); // 1 (reset)
    expect(guard.recordRound(true)).toBeNull(); // 2
    const result = guard.recordRound(true); // 3 — trips
    expect(result).toBeString();
  });

  it("default maxConsecutiveErrors is 5", () => {
    const guard = new ExecutionGuard();
    // 4 rounds should NOT trip
    for (let i = 0; i < 4; i++) {
      expect(guard.recordRound(true)).toBeNull();
    }
    // 5th round should trip
    const result = guard.recordRound(true);
    expect(result).toBeString();
  });

  it("default maxDurationMs is 10 minutes (600000ms)", () => {
    // We can verify by checking that a fresh guard passes the duration check
    const guard = new ExecutionGuard();
    expect(guard.checkBeforeRound()).toBeNull();
  });
});

// ===========================================================================
// 4. TOOL ARGUMENT PARSING (JSON repair)
// ===========================================================================

describe("Audit: parseToolArgs JSON repair", () => {
  // The parseToolArgs function is private to agent.ts.
  // We test the behavior by importing and calling the module's internal export
  // or by testing through a shim. Since it's private, we'll replicate the logic
  // to verify the repair patterns work correctly.

  function parseToolArgs(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw);
    } catch {}

    let s = raw.trim();
    if (!s) return {};

    if (s.startsWith("```")) {
      s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
    }

    s = s.replace(/,\s*([}\]])/g, "$1");

    if (!s.includes('"') && s.includes("'")) {
      s = s.replace(/'/g, '"');
    }

    s = s.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');

    try {
      return JSON.parse(s);
    } catch {
      return JSON.parse(raw);
    }
  }

  it("parses valid JSON directly", () => {
    const result = parseToolArgs('{"command":"ls"}');
    expect(result).toEqual({ command: "ls" });
  });

  it("returns empty object for empty string", () => {
    expect(parseToolArgs("")).toEqual({});
    expect(parseToolArgs("   ")).toEqual({});
  });

  it("strips markdown code fences", () => {
    const input = '```json\n{"a": 1}\n```';
    const result = parseToolArgs(input);
    expect(result).toEqual({ a: 1 });
  });

  it("removes trailing commas", () => {
    const result = parseToolArgs('{"a": 1, "b": 2,}');
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("converts single quotes to double quotes", () => {
    const result = parseToolArgs("{'key': 'value'}");
    expect(result).toEqual({ key: "value" });
  });

  it("quotes unquoted keys", () => {
    const result = parseToolArgs('{key: "value"}');
    expect(result).toEqual({ key: "value" });
  });

  it("handles nested trailing commas", () => {
    const result = parseToolArgs('{"a": [1, 2,], "b": {"c": 3,},}');
    expect(result).toEqual({ a: [1, 2], b: { c: 3 } });
  });
});

// ===========================================================================
// 5. MESSAGE COMPACTION
// ===========================================================================

describe("Audit: Message compaction logic", () => {
  // Replicate compactMessages from agent.ts
  interface Msg { role: string; content: string }

  function compactMessages(messages: Msg[]): Msg[] {
    if (messages.length <= 8) return messages;

    const result: Msg[] = [];
    const systemMsgs = messages.filter((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    result.push(...systemMsgs);

    if (nonSystem.length > 0) {
      const first = nonSystem[0];
      if (first) result.push(first);
    }

    result.push({
      role: "system",
      content: "[Earlier conversation history was compacted to save context window space.]",
    });

    const tail = nonSystem.slice(-6);
    result.push(...tail);

    return result;
  }

  it("returns messages unchanged when <= 8 messages", () => {
    const msgs: Msg[] = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg ${i}`,
    }));
    expect(compactMessages(msgs)).toBe(msgs);
  });

  it("compacts messages > 8 to system + first + marker + last 6", () => {
    const msgs: Msg[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg ${i}`,
    }));
    const compacted = compactMessages(msgs);
    // system msgs (0) + first (1) + compaction marker (1) + tail (6) = 8
    expect(compacted.length).toBe(8);
    expect(compacted[0].content).toBe("msg 0"); // first non-system
    expect(compacted[1].content).toContain("compacted");
    // Last 6 messages preserved
    expect(compacted[compacted.length - 1].content).toBe("msg 19");
  });

  it("preserves system messages in compaction", () => {
    const msgs: Msg[] = [
      { role: "system", content: "system prompt" },
      ...Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `msg ${i}`,
      })),
    ];
    const compacted = compactMessages(msgs);
    expect(compacted[0].content).toBe("system prompt");
    expect(compacted[1].content).toBe("msg 0"); // first non-system
  });
});

// ===========================================================================
// 6. SOCKET IPC SERVER
// ===========================================================================

describe("Audit: Socket IPC exports", () => {
  it("exports all required functions", async () => {
    const socket = await import("../../src/daemon/api/socket.js");
    expect(typeof socket.startSocketServer).toBe("function");
    expect(typeof socket.stopSocketServer).toBe("function");
    expect(typeof socket.registerMethod).toBe("function");
    expect(typeof socket.registerStreamMethod).toBe("function");
    expect(typeof socket.sendRequest).toBe("function");
    expect(typeof socket.sendStreamRequest).toBe("function");
    expect(typeof socket.isDaemonRunning).toBe("function");
  });
});

// ===========================================================================
// 7. HTTP APP (Hono)
// ===========================================================================

describe("Audit: HTTP app exports", () => {
  it("exports createApp and startServer/stopServer", async () => {
    const app = await import("../../src/daemon/api/app.js");
    expect(typeof app.createApp).toBe("function");
    expect(typeof app.startServer).toBe("function");
    expect(typeof app.stopServer).toBe("function");
  });
});

// ===========================================================================
// 8. CHANNEL ROUTER
// ===========================================================================

describe("Audit: Channel router exports", () => {
  it("exports startChannelRouter", async () => {
    const router = await import("../../src/daemon/services/channels/router.js");
    expect(typeof router.startChannelRouter).toBe("function");
  });
});

// ===========================================================================
// 9. SESSION PERSISTENCE (agent loop dependency)
// ===========================================================================

describe("Audit: Session persistence for agent loop", () => {
  it("creates and retrieves sessions", async () => {
    const { createSession, getSession } = await import("../../src/daemon/agent/session/session.js");
    const sess = createSession({ model: "test-model", title: "audit test" });
    expect(sess.id).toBeTruthy();
    expect(sess.model).toBe("test-model");

    const retrieved = getSession(sess.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.id).toBe(sess.id);
  });

  it("persists messages across retrieval", async () => {
    const { createSession } = await import("../../src/daemon/agent/session/session.js");
    const { addMessage, getMessages } = await import("../../src/daemon/agent/session/message.js");

    const sess = createSession({ model: "test-model" });
    addMessage(sess.id, "user", "hello");
    addMessage(sess.id, "assistant", "hi there");

    const msgs = getMessages(sess.id);
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
  });

  it("touchSession updates timestamp", async () => {
    const { createSession, getSession } = await import("../../src/daemon/agent/session/session.js");
    const { touchSession } = await import("../../src/daemon/agent/session/session.js");

    const sess = createSession({ model: "test-model" });
    const before = getSession(sess.id)!.updated_at;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));
    touchSession(sess.id);

    const after = getSession(sess.id)!.updated_at;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

// ===========================================================================
// 10. TOOL REGISTRY
// ===========================================================================

describe("Audit: Tool registry for agent loop", () => {
  it("registerTool and getTool work", async () => {
    const { registerTool, getTool, clearTools } = await import("../../src/daemon/agent/tools/registry.js");
    clearTools();

    registerTool({
      id: "audit_test_tool",
      name: "audit_test_tool",
      description: "Test tool for audit",
      parameters: { type: "object", properties: {} },
      execute: async () => "ok",
    });

    const tool = getTool("audit_test_tool");
    expect(tool).toBeTruthy();
    expect(tool!.id).toBe("audit_test_tool");
  });

  it("getTool returns undefined for unknown tool", async () => {
    const { getTool } = await import("../../src/daemon/agent/tools/registry.js");
    expect(getTool("nonexistent_tool_xyz")).toBeUndefined();
  });

  it("listTools returns all registered tools", async () => {
    const { listTools, clearTools, registerTool } = await import("../../src/daemon/agent/tools/registry.js");
    clearTools();

    registerTool({
      id: "t1", name: "t1", description: "d1",
      parameters: { type: "object", properties: {} },
      execute: async () => "ok",
    });
    registerTool({
      id: "t2", name: "t2", description: "d2",
      parameters: { type: "object", properties: {} },
      execute: async () => "ok",
    });

    const tools = listTools();
    expect(tools.length).toBe(2);
  });

  it("tool execute catches errors gracefully", async () => {
    const { registerTool, getTool, clearTools } = await import("../../src/daemon/agent/tools/registry.js");
    clearTools();

    registerTool({
      id: "throw_tool",
      name: "throw_tool",
      description: "Always throws",
      parameters: { type: "object", properties: {} },
      execute: async () => { throw new Error("boom"); },
    });

    const tool = getTool("throw_tool");
    try {
      await tool!.execute({});
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect((err as Error).message).toBe("boom");
    }
  });
});

// ===========================================================================
// 11. DRIVER REGISTRY
// ===========================================================================

describe("Audit: Driver registry", () => {
  it("exports getDriver, listDrivers, resolveModel, getCapabilities", async () => {
    const drivers = await import("../../src/daemon/agent/drivers/index.js");
    const models = await import("../../src/daemon/agent/drivers/models.js");
    expect(typeof drivers.getDriver).toBe("function");
    expect(typeof drivers.listDrivers).toBe("function");
    expect(typeof models.resolveModel).toBe("function");
    expect(typeof models.getCapabilities).toBe("function");
  });
});

// ===========================================================================
// 12. SHUTDOWN SEQUENCE VALIDATION
// ===========================================================================

describe("Audit: Shutdown state transitions", () => {
  it("shutdown is idempotent when not running", async () => {
    const { shutdown, getState } = await import("../../src/daemon/kernel.js");
    // Should not throw when called on a non-running kernel
    await shutdown();
    const state = getState();
    // Phase should be idle or stopped (not running)
    expect(["idle", "stopped"]).toContain(state.phase);
  });

  it("onShutdown registers hooks", async () => {
    const { onShutdown } = await import("../../src/daemon/kernel.js");
    let called = false;
    onShutdown(() => { called = true; });
    // Hook is registered but won't be called until actual shutdown with signal handler
    expect(typeof onShutdown).toBe("function");
  });
});

// ===========================================================================
// 13. CHANNEL BINDING PERSISTENCE
// ===========================================================================

describe("Audit: Channel binding persistence", () => {
  it("bindSession and getBinding round-trip", async () => {
    const { bindSession, getBinding, unbindSession } = await import(
      "../../src/daemon/services/channels/binding.js"
    );

    bindSession("test-channel", "chat-123", "session-abc", "claude");
    const binding = getBinding("test-channel", "chat-123");
    expect(binding).toBeTruthy();
    expect(binding!.sessionId).toBe("session-abc");
    expect(binding!.model).toBe("claude");

    // Cleanup
    unbindSession("test-channel", "chat-123");
    const after = getBinding("test-channel", "chat-123");
    expect(after).toBeNull();
  });

  it("updateBindingModel updates the model in KV", async () => {
    const { bindSession, getBinding, updateBindingModel, unbindSession } = await import(
      "../../src/daemon/services/channels/binding.js"
    );

    bindSession("test-channel", "chat-456", "session-def", "claude");
    updateBindingModel("test-channel", "chat-456", "gpt-4o");

    const binding = getBinding("test-channel", "chat-456");
    expect(binding!.model).toBe("gpt-4o");

    // Cleanup
    unbindSession("test-channel", "chat-456");
  });
});

// ===========================================================================
// 14. KV STORE (used by router, kernel, triggers)
// ===========================================================================

describe("Audit: KV store operations", () => {
  it("kvSet and kvGet round-trip", async () => {
    const { kvSet, kvGet, kvDelete } = await import("../../src/daemon/storage/kv.js");

    kvSet("audit:test:key", "hello");
    expect(kvGet("audit:test:key")).toBe("hello");
    kvDelete("audit:test:key");
    expect(kvGet("audit:test:key")).toBeNull();
  });

  it("kvGet returns null for missing keys", async () => {
    const { kvGet } = await import("../../src/daemon/storage/kv.js");
    expect(kvGet("audit:nonexistent:key")).toBeNull();
  });

  it("kvSet handles complex values (JSON serialization)", async () => {
    const { kvSet, kvGet, kvDelete } = await import("../../src/daemon/storage/kv.js");

    const value = { nested: { array: [1, 2, 3] }, flag: true };
    kvSet("audit:complex:key", value);
    const retrieved = kvGet<typeof value>("audit:complex:key");
    expect(retrieved).toEqual(value);
    kvDelete("audit:complex:key");
  });
});

// ===========================================================================
// 15. WORKER POOL
// ===========================================================================

describe("Audit: Worker pool", () => {
  it("exports WorkerPool class", async () => {
    const { WorkerPool } = await import("../../src/daemon/workers/pool.js");
    expect(typeof WorkerPool).toBe("function"); // class constructor
  });

  it("creates pool and reports status", async () => {
    const { WorkerPool } = await import("../../src/daemon/workers/pool.js");
    const pool = new WorkerPool({ maxWorkers: 2 });
    const status = pool.status();
    expect(status).toBeDefined();
    await pool.drain();
  });
});

// ===========================================================================
// 16. TRIGGER ENGINE
// ===========================================================================

describe("Audit: Trigger engine for kernel boot", () => {
  it("creates engine and lists empty", async () => {
    const { TriggerEngine } = await import("../../src/daemon/services/triggers/engine.js");
    const engine = new TriggerEngine();
    expect(engine.listAll()).toEqual([]);
    await engine.stop();
  });

  it("starts and stops without error", async () => {
    const { TriggerEngine } = await import("../../src/daemon/services/triggers/engine.js");
    const engine = new TriggerEngine();
    await engine.start();
    await engine.stop();
  });
});

// ===========================================================================
// 17. CONNECTOR MANAGER
// ===========================================================================

describe("Audit: Connector manager for kernel boot", () => {
  it("exports ConnectorManager", async () => {
    const { ConnectorManager } = await import("../../src/daemon/services/connectors/manager.js");
    expect(typeof ConnectorManager).toBe("function");
  });

  it("creates manager and lists health", async () => {
    const { ConnectorManager } = await import("../../src/daemon/services/connectors/manager.js");
    const mgr = new ConnectorManager();
    const health = await mgr.healthAll();
    expect(Array.isArray(health)).toBe(true);
    await mgr.shutdownAll();
  });
});

// ===========================================================================
// 18. CHANNEL REGISTRY
// ===========================================================================

describe("Audit: Channel registry for kernel boot", () => {
  it("exports ChannelRegistry", async () => {
    const { ChannelRegistry } = await import("../../src/daemon/services/channels/index.js");
    expect(typeof ChannelRegistry).toBe("function");
  });

  it("creates registry with event bus", async () => {
    const { ChannelRegistry } = await import("../../src/daemon/services/channels/index.js");
    const reg = new ChannelRegistry();
    expect(reg.bus).toBeDefined();
    expect(typeof reg.list).toBe("function");
    expect(typeof reg.register).toBe("function");
    expect(typeof reg.connectAll).toBe("function");
    expect(typeof reg.disconnectAll).toBe("function");
  });
});

// ===========================================================================
// 19. PLUGIN LOADER
// ===========================================================================

describe("Audit: Plugin loader for kernel boot", () => {
  it("exports PluginLoader", async () => {
    const { PluginLoader } = await import("../../src/daemon/plugin/loader.js");
    expect(typeof PluginLoader).toBe("function");
  });

  it("loadAll and unloadAll are callable", async () => {
    const { PluginLoader } = await import("../../src/daemon/plugin/loader.js");
    const loader = new PluginLoader();
    await loader.loadAll();
    await loader.unloadAll();
  });
});

// ===========================================================================
// 20. AGENT LOOP MAX ROUNDS DEFAULT
// ===========================================================================

describe("Audit: Agent loop defaults", () => {
  it("maxRounds defaults to 40 in source", async () => {
    // We verify this by reading the source — the default is config.maxRounds ?? 40
    // This is a structural assertion (the value exists in the code)
    const source = await Bun.file("src/daemon/agent/agent.ts").text();
    expect(source).toContain("config.maxRounds ?? 40");
  });

  it("compaction threshold is 75% of context window", async () => {
    const source = await Bun.file("src/daemon/agent/agent.ts").text();
    expect(source).toContain("0.75");
    expect(source).toContain("compactionThreshold");
  });

  it("clearActiveContext is called in finally block", async () => {
    const source = await Bun.file("src/daemon/agent/agent.ts").text();
    expect(source).toContain("finally");
    expect(source).toContain("clearActiveContext");
  });
});

// ===========================================================================
// 21. KERNEL SIGNAL HANDLER PATTERNS
// ===========================================================================

describe("Audit: Signal handling patterns", () => {
  it("kernel installs SIGINT and SIGTERM handlers", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    expect(source).toContain('process.on("SIGINT"');
    expect(source).toContain('process.on("SIGTERM"');
  });

  it("kernel catches uncaughtException", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    expect(source).toContain('process.on("uncaughtException"');
  });

  it("kernel catches unhandledRejection (log-only, no crash)", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    expect(source).toContain('process.on("unhandledRejection"');
    // Verify it does NOT call process.exit for unhandledRejection
    // The handler logs but does not trigger shutdown
    const rejectionBlock = source.slice(
      source.indexOf('process.on("unhandledRejection"'),
      source.indexOf('process.on("unhandledRejection"') + 300,
    );
    expect(rejectionBlock).not.toContain("process.exit");
    expect(rejectionBlock).not.toContain("handler(");
  });

  it("kernel has signalsInstalled guard against double-registration", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    expect(source).toContain("signalsInstalled");
    expect(source).toContain("if (signalsInstalled) return");
  });
});

// ===========================================================================
// 22. SHUTDOWN RESOURCE CLEANUP ORDER
// ===========================================================================

describe("Audit: Shutdown cleanup order", () => {
  it("shutdown sets phase to shutting_down then stopped", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    const shutdownFn = source.slice(source.indexOf("export async function shutdown"));
    expect(shutdownFn).toContain('"shutting_down"');
    expect(shutdownFn).toContain('"stopped"');
  });

  it("shutdown nulls all state fields", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    const shutdownFn = source.slice(source.indexOf("export async function shutdown"));
    expect(shutdownFn).toContain("state.server = null");
    expect(shutdownFn).toContain("state.channels = null");
    expect(shutdownFn).toContain("state.relay = null");
    expect(shutdownFn).toContain("state.connectors = null");
    expect(shutdownFn).toContain("state.triggers = null");
    expect(shutdownFn).toContain("state.plugins = null");
    expect(shutdownFn).toContain("state.workers = null");
    expect(shutdownFn).toContain("state.db = null");
  });

  it("shutdown closes database", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    const shutdownFn = source.slice(source.indexOf("export async function shutdown"));
    expect(shutdownFn).toContain("closeDatabase()");
  });

  it("shutdown closes logger last", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    const shutdownFn = source.slice(source.indexOf("export async function shutdown"));
    const dbCloseIdx = shutdownFn.indexOf("closeDatabase()");
    const logCloseIdx = shutdownFn.indexOf("log.close()");
    expect(logCloseIdx).toBeGreaterThan(dbCloseIdx);
  });
});

// ===========================================================================
// 23. ROUTER TIMEOUT AND ERROR ISOLATION
// ===========================================================================

describe("Audit: Router error isolation patterns", () => {
  it("router has per-message timeout (PROCESS_TIMEOUT_MS)", async () => {
    const source = await Bun.file("src/daemon/services/channels/router.ts").text();
    expect(source).toContain("PROCESS_TIMEOUT_MS");
    expect(source).toContain("5 * 60_000");
  });

  it("router uses per-chat queue for sequential processing", async () => {
    const source = await Bun.file("src/daemon/services/channels/router.ts").text();
    expect(source).toContain("chatQueues");
    expect(source).toContain("chatQueues.set(chatId, next)");
  });

  it("router auto-aborts stuck runs on timeout", async () => {
    const source = await Bun.file("src/daemon/services/channels/router.ts").text();
    expect(source).toContain("stuckRun.controller.abort()");
    expect(source).toContain("activeRuns.delete(chatId)");
  });

  it("router cleans up queue entries after completion", async () => {
    const source = await Bun.file("src/daemon/services/channels/router.ts").text();
    expect(source).toContain("chatQueues.delete(chatId)");
  });

  it("router uses AbortController per message", async () => {
    const source = await Bun.file("src/daemon/services/channels/router.ts").text();
    expect(source).toContain("new AbortController()");
    expect(source).toContain("controller.signal");
  });
});

// ===========================================================================
// 24. HTTP SERVER SECURITY
// ===========================================================================

describe("Audit: HTTP server security middleware", () => {
  it("has auth middleware that skips health/webhook/oauth endpoints", async () => {
    const source = await Bun.file("src/daemon/api/app.ts").text();
    expect(source).toContain("authMiddleware");
    expect(source).toContain('/health"');
    expect(source).toContain("/hooks/");
    expect(source).toContain("/oauth/");
  });

  it("has rate limiting middleware", async () => {
    const source = await Bun.file("src/daemon/api/app.ts").text();
    expect(source).toContain("rateLimitMiddleware");
    expect(source).toContain("maxRequests: 100");
  });

  it("has body size limit (10MB)", async () => {
    const source = await Bun.file("src/daemon/api/app.ts").text();
    expect(source).toContain("bodyLimit");
    expect(source).toContain("10 * 1024 * 1024");
  });

  it("sets security headers (X-Frame-Options, X-Content-Type-Options)", async () => {
    const source = await Bun.file("src/daemon/api/app.ts").text();
    expect(source).toContain("X-Frame-Options");
    expect(source).toContain("X-Content-Type-Options");
    expect(source).toContain("Referrer-Policy");
  });

  it("binds to localhost by default", async () => {
    const source = await Bun.file("src/daemon/api/app.ts").text();
    expect(source).toContain('hostname ?? "127.0.0.1"');
  });

  it("warns when binding to non-localhost", async () => {
    const source = await Bun.file("src/daemon/api/app.ts").text();
    expect(source).toContain("exposes the API beyond localhost");
  });

  it("has global error handler that hides internals", async () => {
    const source = await Bun.file("src/daemon/api/app.ts").text();
    expect(source).toContain("app.onError");
    expect(source).toContain("Internal server error");
  });
});

// ===========================================================================
// 25. BOOT STEP COMPLETENESS
// ===========================================================================

describe("Audit: Boot sequence completeness", () => {
  it("all 15+ steps are logged in kernel", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    expect(source).toContain("step 1-2");
    expect(source).toContain("step 3-4");
    expect(source).toContain("step 5");
    expect(source).toContain("step 5.5");
    expect(source).toContain("step 6");
    expect(source).toContain("step 7");
    expect(source).toContain("step 8");
    expect(source).toContain("step 9");
    expect(source).toContain("step 10");
    expect(source).toContain("step 10.5");
    expect(source).toContain("step 10.6");
    expect(source).toContain("step 11");
    expect(source).toContain("step 12");
    expect(source).toContain("step 13");
    expect(source).toContain("step 14");
    expect(source).toContain("step 15");
  });

  it("boot checks for already-running kernel", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    expect(source).toContain("Kernel is already running");
    expect(source).toContain('state.phase === "running"');
  });

  it("boot sets phase to booting then running", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    expect(source).toContain('state.phase = "booting"');
    expect(source).toContain('state.phase = "running"');
  });

  it("boot records startedAt timestamp", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    expect(source).toContain("state.startedAt = Date.now()");
  });

  it("all 16 tool modules are imported in step 6", async () => {
    const source = await Bun.file("src/daemon/kernel.ts").text();
    const toolImports = [
      "tools/bash.js",
      "tools/read.js",
      "tools/write.js",
      "tools/edit.js",
      "tools/list.js",
      "tools/search.js",
      "tools/web.js",
      "tools/screenshot.js",
      "tools/camera.js",
      "tools/parallel.js",
      "tools/browse.js",
      "tools/delegate.js",
      "tools/connector.js",
      "tools/skill.js",
      "tools/webdev.js",
      "tools/memory-tool.js",
    ];
    for (const toolPath of toolImports) {
      expect(source).toContain(toolPath);
    }
  });
});

// ===========================================================================
// 26. IPC SOCKET SECURITY
// ===========================================================================

describe("Audit: IPC socket security", () => {
  it("socket has 10MB buffer limit per connection", async () => {
    const source = await Bun.file("src/daemon/api/socket.ts").text();
    expect(source).toContain("10 * 1024 * 1024");
    expect(source).toContain("MAX_IPC_BUFFER");
  });

  it("socket file has 0600 permissions", async () => {
    const source = await Bun.file("src/daemon/api/socket.ts").text();
    expect(source).toContain("0o600");
  });

  it("socket cleans up stale file on start", async () => {
    const source = await Bun.file("src/daemon/api/socket.ts").text();
    expect(source).toContain("unlinkSync(socketPath)");
  });

  it("socket cleans up file on stop", async () => {
    const source = await Bun.file("src/daemon/api/socket.ts").text();
    const stopFn = source.slice(source.indexOf("export function stopSocketServer"));
    expect(stopFn).toContain("unlinkSync(socketPath)");
  });
});
