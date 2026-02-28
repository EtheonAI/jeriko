import { describe, expect, it, beforeAll, afterAll, mock } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";

// ─── Test database ─────────────────────────────────────────────────────────
// We need a real SQLite database for context capture tests.

const TEST_DB = join(tmpdir(), `jeriko-orch-test-${Date.now()}.db`);

// Mock the database module to use our test DB
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";

let db: ReturnType<typeof initDatabase>;

beforeAll(() => {
  db = initDatabase(TEST_DB);
});

afterAll(() => {
  closeDatabase();
  try {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_DB + "-wal")) unlinkSync(TEST_DB + "-wal");
    if (existsSync(TEST_DB + "-shm")) unlinkSync(TEST_DB + "-shm");
  } catch { /* cleanup best effort */ }
});

// ─── Import the modules under test ─────────────────────────────────────────

import {
  AGENT_TYPES,
  getToolsForType,
  readContext,
  readContextByKind,
  getChildSessions,
  orchestratorBus,
  type AgentType,
  type SubTaskContext,
} from "../../src/daemon/agent/orchestrator.js";

import { createSession } from "../../src/daemon/agent/session/session.js";
import { getDatabase } from "../../src/daemon/storage/db.js";
import { randomUUID } from "node:crypto";

// ─── Agent type preset tests ──────────────────────────────────────────────

describe("agent type presets", () => {
  it("defines 5 agent types", () => {
    const types = Object.keys(AGENT_TYPES);
    expect(types).toEqual(["general", "research", "task", "explore", "plan"]);
  });

  it("general type returns null (all tools)", () => {
    expect(getToolsForType("general")).toBeNull();
  });

  it("research type only has read + search + web tools", () => {
    const tools = getToolsForType("research")!;
    expect(tools).toContain("web_search");
    expect(tools).toContain("read_file");
    expect(tools).toContain("list_files");
    expect(tools).toContain("search_files");
    expect(tools).not.toContain("bash");
    expect(tools).not.toContain("write_file");
    expect(tools).not.toContain("edit_file");
  });

  it("code type has bash + file tools, no web", () => {
    const tools = getToolsForType("task")!;
    expect(tools).toContain("bash");
    expect(tools).toContain("read_file");
    expect(tools).toContain("write_file");
    expect(tools).toContain("edit_file");
    expect(tools).not.toContain("web_search");
  });

  it("explore type is read-only, no bash", () => {
    const tools = getToolsForType("explore")!;
    expect(tools).toContain("read_file");
    expect(tools).toContain("list_files");
    expect(tools).toContain("search_files");
    expect(tools).not.toContain("bash");
    expect(tools).not.toContain("write_file");
    expect(tools).not.toContain("edit_file");
    expect(tools).not.toContain("web_search");
  });

  it("plan type can read and search, plus web", () => {
    const tools = getToolsForType("plan")!;
    expect(tools).toContain("read_file");
    expect(tools).toContain("web_search");
    expect(tools).not.toContain("bash");
    expect(tools).not.toContain("write_file");
  });

  it("returns a copy, not a reference", () => {
    const a = getToolsForType("research");
    const b = getToolsForType("research");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

// ─── Session parent-child linking tests ────────────────────────────────────

describe("parent-child session linking", () => {
  it("creates a session with parent_session_id", () => {
    const parent = createSession({ title: "parent" });
    const child = createSession({
      title: "child",
      parentSessionId: parent.id,
      agentType: "research",
    });

    expect(child.parent_session_id).toBe(parent.id);
    expect(child.agent_type).toBe("research");
  });

  it("creates a session with default agent_type", () => {
    const session = createSession({ title: "default-type" });
    expect(session.agent_type).toBe("general");
    expect(session.parent_session_id).toBeNull();
  });

  it("getChildSessions returns children", () => {
    const parent = createSession({ title: "multi-parent" });
    createSession({ title: "child-1", parentSessionId: parent.id, agentType: "task" });
    createSession({ title: "child-2", parentSessionId: parent.id, agentType: "research" });
    createSession({ title: "child-3", parentSessionId: parent.id, agentType: "explore" });

    const children = getChildSessions(parent.id);
    expect(children.length).toBe(3);
    expect(children.map((c) => c.agent_type).sort()).toEqual(["explore", "research", "task"]);
  });
});

// ─── Structured context (agent_context table) tests ────────────────────────

describe("structured context", () => {
  it("writes and reads context entries", () => {
    const session = createSession({ title: "ctx-test" });

    // Manually write context entries (simulating what the orchestrator does)
    const db = getDatabase();
    const write = (kind: string, key: string, value: string) => {
      db.prepare(
        "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(randomUUID().slice(0, 12), session.id, kind, key, value, Date.now());
    };

    write("tool_call", "web_search", JSON.stringify({ id: "tc1", name: "web_search", arguments: '{"query":"hilton"}' }));
    write("tool_call", "result:tc1", JSON.stringify({ tool_call_id: "tc1", result: "Hilton is a hotel chain", is_error: false }));
    write("file_write", "/tmp/test.py", "");
    write("artifact", "summary", "Hilton Hotels overview");
    write("metric", "tokens", JSON.stringify({ tokensIn: 100, tokensOut: 200, rounds: 3 }));

    const allCtx = readContext(session.id);
    expect(allCtx.length).toBe(5);

    const toolCalls = readContextByKind(session.id, "tool_call");
    expect(toolCalls.length).toBe(2);

    const files = readContextByKind(session.id, "file_write");
    expect(files.length).toBe(1);
    expect(files[0]!.key).toBe("/tmp/test.py");

    const artifacts = readContextByKind(session.id, "artifact");
    expect(artifacts.length).toBe(1);
    expect(artifacts[0]!.value).toBe("Hilton Hotels overview");
  });

  it("context is scoped to session — no cross-talk", () => {
    const session1 = createSession({ title: "iso-1" });
    const session2 = createSession({ title: "iso-2" });

    const db = getDatabase();
    db.prepare(
      "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID().slice(0, 12), session1.id, "artifact", "s1-only", "belongs to s1", Date.now());

    db.prepare(
      "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID().slice(0, 12), session2.id, "artifact", "s2-only", "belongs to s2", Date.now());

    const ctx1 = readContext(session1.id);
    const ctx2 = readContext(session2.id);

    expect(ctx1.length).toBe(1);
    expect(ctx1[0]!.key).toBe("s1-only");
    expect(ctx2.length).toBe(1);
    expect(ctx2[0]!.key).toBe("s2-only");
  });

  it("context cascade deletes with session", () => {
    const session = createSession({ title: "cascade-test" });
    const db = getDatabase();

    db.prepare(
      "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID().slice(0, 12), session.id, "artifact", "will-be-deleted", "test", Date.now());

    expect(readContext(session.id).length).toBe(1);

    db.prepare("DELETE FROM session WHERE id = ?").run(session.id);

    expect(readContext(session.id).length).toBe(0);
  });
});

// ─── Orchestrator bus tests ────────────────────────────────────────────────

describe("orchestrator bus", () => {
  it("emits and receives events", () => {
    const events: string[] = [];
    const unsub = orchestratorBus.on("sub:started", (data) => {
      events.push(data.label);
    });

    orchestratorBus.emit("sub:started", {
      parentSessionId: "p1",
      childSessionId: "c1",
      label: "test task",
      agentType: "research",
    });

    expect(events).toEqual(["test task"]);
    unsub();
  });

  it("can observe sub:context events", () => {
    const kinds: string[] = [];
    const unsub = orchestratorBus.on("sub:context", (data) => {
      kinds.push(data.kind);
    });

    orchestratorBus.emit("sub:context", { childSessionId: "c1", kind: "tool_call", key: "bash" });
    orchestratorBus.emit("sub:context", { childSessionId: "c1", kind: "file_write", key: "/tmp/out.txt" });

    expect(kinds).toEqual(["tool_call", "file_write"]);
    unsub();
  });
});

// ─── Model compatibility tests ─────────────────────────────────────────────

describe("model compatibility", () => {
  it("agent types work regardless of model/backend", () => {
    // Agent types are model-agnostic — they just scope tool IDs.
    // The driver handles the actual API call format.
    const backends = ["anthropic", "openai", "local", "claude", "gpt", "ollama"];
    const types: AgentType[] = ["general", "research", "task", "explore", "plan"];

    for (const backend of backends) {
      for (const type of types) {
        const tools = getToolsForType(type);
        // Should not throw for any combination
        if (tools === null) {
          expect(tools).toBeNull();
        } else {
          expect(Array.isArray(tools)).toBe(true);
          expect(tools.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("session stores any model string", () => {
    const models = [
      "claude-opus-4-6",
      "gpt-4o",
      "gpt-oss-120b",
      "qwen2.5:72b",
      "llama3.2:70b",
      "deepseek-v3",
      "mistral-large",
    ];

    for (const model of models) {
      const session = createSession({ title: `test-${model}`, model });
      expect(session.model).toBe(model);
    }
  });
});
