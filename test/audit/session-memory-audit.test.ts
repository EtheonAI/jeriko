// Session & Memory System Audit Tests
//
// Tests session CRUD, message lifecycle, context tracking, KV store,
// parent/child relationships, and session resumption — all using temp SQLite.

import { describe, expect, it, afterAll, beforeAll } from "bun:test";
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
import {
  createSession,
  getSession,
  getSessionBySlug,
  listSessions,
  archiveSession,
  deleteSession,
  updateSession,
  touchSession,
} from "../../src/daemon/agent/session/session.js";
import {
  addMessage,
  getMessages,
  getRecentMessages,
  getSessionTokenCount,
  clearMessages,
  deleteMessage,
  addPart,
  getParts,
  getPartsByType,
} from "../../src/daemon/agent/session/message.js";
import { kvSet, kvGet, kvDelete, kvList } from "../../src/daemon/storage/kv.js";
import {
  readContext,
  readContextByKind,
  getChildSessions,
} from "../../src/daemon/agent/orchestrator.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";

const TEST_DB = join(tmpdir(), `jeriko-session-audit-${Date.now()}.db`);

let db: Database;

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

// ─── Session CRUD ──────────────────────────────────────────────────────────

describe("session CRUD", () => {
  it("creates a session with defaults", () => {
    const s = createSession();
    expect(s.id).toBeTruthy();
    expect(s.slug).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
    expect(s.title).toBe(s.slug);
    expect(s.model).toBe("claude");
    expect(s.token_count).toBe(0);
    expect(s.archived_at).toBeNull();
    expect(s.parent_session_id).toBeNull();
    expect(s.agent_type).toBe("general");
    expect(s.created_at).toBeGreaterThan(0);
    expect(s.updated_at).toBe(s.created_at);
  });

  it("creates a session with custom options", () => {
    const s = createSession({
      title: "Custom Title",
      model: "gpt-4o",
      agentType: "research",
    });
    expect(s.title).toBe("Custom Title");
    expect(s.model).toBe("gpt-4o");
    expect(s.agent_type).toBe("research");
  });

  it("retrieves session by ID", () => {
    const s = createSession({ title: "Get By ID" });
    const fetched = getSession(s.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(s.id);
    expect(fetched!.title).toBe("Get By ID");
  });

  it("retrieves session by slug", () => {
    const s = createSession();
    const fetched = getSessionBySlug(s.slug);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(s.id);
  });

  it("returns null for nonexistent session", () => {
    expect(getSession("nonexistent-id")).toBeNull();
    expect(getSessionBySlug("nonexistent-slug")).toBeNull();
  });

  it("updates session title", () => {
    const s = createSession();
    updateSession(s.id, { title: "Updated Title" });
    const fetched = getSession(s.id);
    expect(fetched!.title).toBe("Updated Title");
    expect(fetched!.updated_at).toBeGreaterThanOrEqual(s.updated_at);
  });

  it("updates session model", () => {
    const s = createSession();
    updateSession(s.id, { model: "gpt-4" });
    expect(getSession(s.id)!.model).toBe("gpt-4");
  });

  it("updates session token_count", () => {
    const s = createSession();
    updateSession(s.id, { token_count: 500 });
    expect(getSession(s.id)!.token_count).toBe(500);
  });

  it("touches session updated_at", () => {
    const s = createSession();
    const originalUpdated = s.updated_at;
    // Small delay to ensure timestamp differs
    const before = Date.now();
    touchSession(s.id);
    const fetched = getSession(s.id);
    expect(fetched!.updated_at).toBeGreaterThanOrEqual(before);
  });

  it("archives a session (soft delete)", () => {
    const s = createSession();
    expect(s.archived_at).toBeNull();
    archiveSession(s.id);
    const fetched = getSession(s.id);
    expect(fetched!.archived_at).not.toBeNull();
    expect(fetched!.archived_at).toBeGreaterThan(0);
  });

  it("deletes a session permanently", () => {
    const s = createSession();
    deleteSession(s.id);
    expect(getSession(s.id)).toBeNull();
  });
});

// ─── Session Listing ───────────────────────────────────────────────────────

describe("session listing", () => {
  it("lists sessions ordered by updated_at DESC", () => {
    // Create sessions with staggered updated_at so ordering is deterministic
    const s1 = createSession({ title: "List-First" });
    // Manually stagger updated_at since Date.now() can return same ms
    db.prepare("UPDATE session SET updated_at = ? WHERE id = ?").run(1000, s1.id);
    const s2 = createSession({ title: "List-Second" });
    db.prepare("UPDATE session SET updated_at = ? WHERE id = ?").run(2000, s2.id);
    const s3 = createSession({ title: "List-Third" });
    db.prepare("UPDATE session SET updated_at = ? WHERE id = ?").run(3000, s3.id);

    const list = listSessions(200);
    const titles = list.map((s) => s.title);
    // Most recent first
    const idx1 = titles.indexOf("List-First");
    const idx2 = titles.indexOf("List-Second");
    const idx3 = titles.indexOf("List-Third");
    expect(idx3).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx1);
  });

  it("excludes archived sessions by default", () => {
    const s = createSession({ title: "To-Archive-For-Listing" });
    archiveSession(s.id);
    const list = listSessions(200);
    const ids = list.map((s) => s.id);
    expect(ids).not.toContain(s.id);
  });

  it("includes archived sessions when requested", () => {
    const s = createSession({ title: "Archived-Included" });
    archiveSession(s.id);
    const list = listSessions(200, true);
    const ids = list.map((s) => s.id);
    expect(ids).toContain(s.id);
  });

  it("respects limit parameter", () => {
    // Create a few sessions
    for (let i = 0; i < 5; i++) createSession({ title: `Limit-${i}` });
    const list = listSessions(3);
    expect(list.length).toBeLessThanOrEqual(3);
  });
});

// ─── Message Append and Retrieval ──────────────────────────────────────────

describe("message operations", () => {
  let sessionId: string;

  beforeAll(() => {
    const s = createSession({ title: "Message Test Session" });
    sessionId = s.id;
  });

  it("adds a user message", () => {
    const msg = addMessage(sessionId, "user", "Hello world");
    expect(msg.id).toBeTruthy();
    expect(msg.session_id).toBe(sessionId);
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello world");
    expect(msg.tokens_input).toBe(0);
    expect(msg.tokens_output).toBe(0);
  });

  it("adds a message with token counts", () => {
    const msg = addMessage(sessionId, "assistant", "Response text", {
      input: 10,
      output: 25,
    });
    expect(msg.tokens_input).toBe(10);
    expect(msg.tokens_output).toBe(25);
  });

  it("increments session token_count on addMessage", () => {
    const s = createSession({ title: "Token Increment" });
    addMessage(s.id, "user", "test", { input: 5, output: 0 });
    addMessage(s.id, "assistant", "reply", { input: 0, output: 10 });
    const fetched = getSession(s.id);
    expect(fetched!.token_count).toBe(15);
  });

  it("touches session updated_at on addMessage", () => {
    const s = createSession({ title: "Touch on Message" });
    const originalUpdated = s.updated_at;
    addMessage(s.id, "user", "trigger update");
    const fetched = getSession(s.id);
    expect(fetched!.updated_at).toBeGreaterThanOrEqual(originalUpdated);
  });

  it("retrieves messages in chronological order", () => {
    const s = createSession({ title: "Chronological" });
    addMessage(s.id, "user", "first");
    addMessage(s.id, "assistant", "second");
    addMessage(s.id, "user", "third");

    const msgs = getMessages(s.id);
    expect(msgs.length).toBe(3);
    expect(msgs[0]!.content).toBe("first");
    expect(msgs[1]!.content).toBe("second");
    expect(msgs[2]!.content).toBe("third");
  });

  it("retrieves messages with limit (oldest N)", () => {
    const s = createSession({ title: "Limit Test" });
    addMessage(s.id, "user", "a");
    addMessage(s.id, "assistant", "b");
    addMessage(s.id, "user", "c");

    const msgs = getMessages(s.id, 2);
    expect(msgs.length).toBe(2);
    expect(msgs[0]!.content).toBe("a");
    expect(msgs[1]!.content).toBe("b");
  });

  it("retrieves recent messages (newest N, ordered oldest first)", () => {
    const s = createSession({ title: "Recent Test" });
    // Stagger created_at to ensure deterministic ordering
    const m1 = addMessage(s.id, "user", "old1");
    db.prepare("UPDATE message SET created_at = ? WHERE id = ?").run(1000, m1.id);
    const m2 = addMessage(s.id, "assistant", "old2");
    db.prepare("UPDATE message SET created_at = ? WHERE id = ?").run(2000, m2.id);
    const m3 = addMessage(s.id, "user", "new1");
    db.prepare("UPDATE message SET created_at = ? WHERE id = ?").run(3000, m3.id);
    const m4 = addMessage(s.id, "assistant", "new2");
    db.prepare("UPDATE message SET created_at = ? WHERE id = ?").run(4000, m4.id);

    const recent = getRecentMessages(s.id, 2);
    expect(recent.length).toBe(2);
    expect(recent[0]!.content).toBe("new1");
    expect(recent[1]!.content).toBe("new2");
  });

  it("computes session token count from messages", () => {
    const s = createSession({ title: "Token Count" });
    addMessage(s.id, "user", "q", { input: 10, output: 0 });
    addMessage(s.id, "assistant", "a", { input: 0, output: 20 });
    addMessage(s.id, "user", "q2", { input: 5, output: 0 });

    expect(getSessionTokenCount(s.id)).toBe(35);
  });

  it("clears all messages and resets token count", () => {
    const s = createSession({ title: "Clear Test" });
    addMessage(s.id, "user", "msg1", { input: 10, output: 0 });
    addMessage(s.id, "assistant", "msg2", { input: 0, output: 10 });

    clearMessages(s.id);
    expect(getMessages(s.id).length).toBe(0);
    expect(getSession(s.id)!.token_count).toBe(0);
  });

  it("deletes a single message", () => {
    const s = createSession({ title: "Delete Single" });
    const m1 = addMessage(s.id, "user", "keep");
    const m2 = addMessage(s.id, "assistant", "remove");

    deleteMessage(m2.id);
    const msgs = getMessages(s.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.content).toBe("keep");
  });

  it("returns empty array for session with no messages", () => {
    const s = createSession({ title: "Empty Messages" });
    expect(getMessages(s.id)).toEqual([]);
    expect(getRecentMessages(s.id, 5)).toEqual([]);
    expect(getSessionTokenCount(s.id)).toBe(0);
  });

  it("cascades message delete on session delete", () => {
    const s = createSession({ title: "Cascade" });
    const m = addMessage(s.id, "user", "will be deleted");
    addPart(m.id, "text", "part content");

    deleteSession(s.id);

    // Messages and parts should be gone
    expect(getMessages(s.id)).toEqual([]);
  });
});

// ─── Part Operations ───────────────────────────────────────────────────────

describe("part operations", () => {
  it("adds and retrieves parts for a message", () => {
    const s = createSession({ title: "Part Test" });
    const m = addMessage(s.id, "assistant", "response with tools");

    const p1 = addPart(m.id, "text", "Some text");
    const p2 = addPart(m.id, "tool_call", '{"name":"bash"}', "bash", "tc-1");
    const p3 = addPart(m.id, "tool_result", "output", "bash", "tc-1");

    const parts = getParts(m.id);
    expect(parts.length).toBe(3);
    expect(parts[0]!.type).toBe("text");
    expect(parts[1]!.type).toBe("tool_call");
    expect(parts[1]!.tool_name).toBe("bash");
    expect(parts[1]!.tool_call_id).toBe("tc-1");
    expect(parts[2]!.type).toBe("tool_result");
  });

  it("filters parts by type", () => {
    const s = createSession({ title: "Part Filter" });
    const m = addMessage(s.id, "assistant", "multi-part");

    addPart(m.id, "text", "text content");
    addPart(m.id, "tool_call", "call1", "read_file", "tc-a");
    addPart(m.id, "tool_call", "call2", "bash", "tc-b");
    addPart(m.id, "tool_result", "result1", "read_file", "tc-a");

    const toolCalls = getPartsByType(m.id, "tool_call");
    expect(toolCalls.length).toBe(2);

    const results = getPartsByType(m.id, "tool_result");
    expect(results.length).toBe(1);

    const texts = getPartsByType(m.id, "text");
    expect(texts.length).toBe(1);
  });

  it("cascades part delete on message delete", () => {
    const s = createSession({ title: "Part Cascade" });
    const m = addMessage(s.id, "assistant", "with parts");
    addPart(m.id, "text", "some text");
    addPart(m.id, "tool_call", "call", "bash", "tc-x");

    deleteMessage(m.id);
    expect(getParts(m.id)).toEqual([]);
  });
});

// ─── KV Store ──────────────────────────────────────────────────────────────

describe("KV store", () => {
  it("sets and gets a string value", () => {
    kvSet("test:string", "hello");
    expect(kvGet<string>("test:string")).toBe("hello");
  });

  it("sets and gets an object value", () => {
    kvSet("test:obj", { name: "jeriko", version: 2 });
    const val = kvGet<{ name: string; version: number }>("test:obj");
    expect(val).toEqual({ name: "jeriko", version: 2 });
  });

  it("sets and gets a number value", () => {
    kvSet("test:num", 42);
    expect(kvGet<number>("test:num")).toBe(42);
  });

  it("sets and gets an array value", () => {
    kvSet("test:arr", [1, 2, 3]);
    expect(kvGet<number[]>("test:arr")).toEqual([1, 2, 3]);
  });

  it("returns null for nonexistent key", () => {
    expect(kvGet("nonexistent:key")).toBeNull();
  });

  it("upserts on duplicate key", () => {
    kvSet("test:upsert", "first");
    expect(kvGet("test:upsert")).toBe("first");
    kvSet("test:upsert", "second");
    expect(kvGet("test:upsert")).toBe("second");
  });

  it("deletes a key", () => {
    kvSet("test:delete", "value");
    expect(kvGet("test:delete")).toBe("value");
    kvDelete("test:delete");
    expect(kvGet("test:delete")).toBeNull();
  });

  it("delete is no-op for nonexistent key", () => {
    // Should not throw
    kvDelete("nonexistent:delete:key");
  });

  it("lists all key-value pairs", () => {
    kvSet("list:a", 1);
    kvSet("list:b", 2);
    const all = kvList();
    const keys = all.map((kv) => kv.key);
    expect(keys).toContain("list:a");
    expect(keys).toContain("list:b");
  });

  it("lists key-value pairs by prefix", () => {
    kvSet("prefix:one", "x");
    kvSet("prefix:two", "y");
    kvSet("other:key", "z");

    const filtered = kvList("prefix:");
    expect(filtered.length).toBe(2);
    expect(filtered.every((kv) => kv.key.startsWith("prefix:"))).toBe(true);
  });

  it("returns empty array when no keys match prefix", () => {
    const result = kvList("nonexistent_prefix:");
    expect(result).toEqual([]);
  });
});

// ─── Parent/Child Session Relationships ────────────────────────────────────

describe("parent/child sessions", () => {
  it("creates a child session linked to parent", () => {
    const parent = createSession({ title: "Parent" });
    const child = createSession({
      title: "Child",
      parentSessionId: parent.id,
      agentType: "research",
    });

    expect(child.parent_session_id).toBe(parent.id);
    expect(child.agent_type).toBe("research");
  });

  it("getChildSessions returns children of a parent", () => {
    const parent = createSession({ title: "Parent With Children" });
    const c1 = createSession({
      title: "Child A",
      parentSessionId: parent.id,
      agentType: "research",
    });
    const c2 = createSession({
      title: "Child B",
      parentSessionId: parent.id,
      agentType: "task",
    });

    const children = getChildSessions(parent.id);
    expect(children.length).toBe(2);
    const childIds = children.map((c) => c.id);
    expect(childIds).toContain(c1.id);
    expect(childIds).toContain(c2.id);
  });

  it("getChildSessions returns empty for session with no children", () => {
    const s = createSession({ title: "No Children" });
    expect(getChildSessions(s.id)).toEqual([]);
  });

  it("child session preserves agent_type in listing", () => {
    const parent = createSession({ title: "Type Parent" });
    createSession({
      title: "Typed Child",
      parentSessionId: parent.id,
      agentType: "explore",
    });

    const children = getChildSessions(parent.id);
    expect(children[0]!.agent_type).toBe("explore");
  });

  it("deleting parent sets child parent_session_id to NULL (ON DELETE SET NULL)", () => {
    const parent = createSession({ title: "Delete Parent" });
    const child = createSession({
      title: "Orphan Child",
      parentSessionId: parent.id,
    });

    deleteSession(parent.id);
    const fetched = getSession(child.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.parent_session_id).toBeNull();
  });
});

// ─── Agent Context (Orchestrator) ──────────────────────────────────────────

describe("agent context", () => {
  it("writes and reads context entries", () => {
    const s = createSession({ title: "Context Test" });

    // Write context directly via SQL (as orchestrator.ts writeContext does)
    const id1 = randomUUID().slice(0, 12);
    const id2 = randomUUID().slice(0, 12);
    db.prepare(
      "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id1, s.id, "tool_call", "bash", '{"name":"bash","arguments":"ls"}', 1000);
    db.prepare(
      "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id2, s.id, "file_write", "/tmp/test.txt", "", 2000);

    const ctx = readContext(s.id);
    expect(ctx.length).toBe(2);
    expect(ctx[0]!.kind).toBe("tool_call");
    expect(ctx[1]!.kind).toBe("file_write");
  });

  it("reads context filtered by kind", () => {
    const s = createSession({ title: "Context Kind Filter" });

    db.prepare(
      "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID().slice(0, 12), s.id, "tool_call", "bash", "{}", Date.now());
    db.prepare(
      "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID().slice(0, 12), s.id, "error", "agent_error", "something failed", Date.now());
    db.prepare(
      "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID().slice(0, 12), s.id, "file_edit", "/tmp/x.ts", "", Date.now());

    const errors = readContextByKind(s.id, "error");
    expect(errors.length).toBe(1);
    expect(errors[0]!.value).toBe("something failed");

    const files = readContextByKind(s.id, "file_edit");
    expect(files.length).toBe(1);
    expect(files[0]!.key).toBe("/tmp/x.ts");
  });

  it("returns empty array for session with no context", () => {
    const s = createSession({ title: "No Context" });
    expect(readContext(s.id)).toEqual([]);
  });

  it("cascades context delete on session delete", () => {
    const s = createSession({ title: "Context Cascade" });
    db.prepare(
      "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID().slice(0, 12), s.id, "artifact", "summary", "text", Date.now());

    deleteSession(s.id);
    // Direct query since readContext depends on session existing
    const rows = db
      .query<{ id: string }, [string]>("SELECT id FROM agent_context WHERE session_id = ?")
      .all(s.id);
    expect(rows.length).toBe(0);
  });
});

// ─── Session Resumption ────────────────────────────────────────────────────

describe("session resumption", () => {
  it("preserves messages across archive and unarchive", () => {
    const s = createSession({ title: "Resume Test" });
    addMessage(s.id, "user", "before archive");
    addMessage(s.id, "assistant", "response before archive");

    // Archive
    archiveSession(s.id);
    expect(getSession(s.id)!.archived_at).not.toBeNull();

    // Messages still accessible
    const msgs = getMessages(s.id);
    expect(msgs.length).toBe(2);
    expect(msgs[0]!.content).toBe("before archive");

    // Unarchive (simulate resume)
    db.prepare(
      "UPDATE session SET archived_at = NULL, updated_at = ? WHERE id = ?",
    ).run(Date.now(), s.id);

    const resumed = getSession(s.id);
    expect(resumed!.archived_at).toBeNull();

    // Messages still there
    const afterResume = getMessages(s.id);
    expect(afterResume.length).toBe(2);
  });

  it("can continue adding messages after resume", () => {
    const s = createSession({ title: "Continue After Resume" });
    addMessage(s.id, "user", "original");

    archiveSession(s.id);
    db.prepare(
      "UPDATE session SET archived_at = NULL, updated_at = ? WHERE id = ?",
    ).run(Date.now(), s.id);

    addMessage(s.id, "user", "after resume");
    addMessage(s.id, "assistant", "new response");

    const msgs = getMessages(s.id);
    expect(msgs.length).toBe(3);
    expect(msgs[2]!.content).toBe("new response");
  });

  it("token count accumulates correctly across resume", () => {
    const s = createSession({ title: "Token Resume" });
    addMessage(s.id, "user", "q1", { input: 10, output: 0 });
    addMessage(s.id, "assistant", "a1", { input: 0, output: 20 });

    archiveSession(s.id);
    db.prepare(
      "UPDATE session SET archived_at = NULL, updated_at = ? WHERE id = ?",
    ).run(Date.now(), s.id);

    addMessage(s.id, "user", "q2", { input: 5, output: 0 });
    addMessage(s.id, "assistant", "a2", { input: 0, output: 15 });

    expect(getSession(s.id)!.token_count).toBe(50);
    expect(getSessionTokenCount(s.id)).toBe(50);
  });
});

// ─── Schema Integrity ──────────────────────────────────────────────────────

describe("schema integrity", () => {
  it("all expected tables exist", () => {
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((r) => r.name);

    expect(tables).toContain("session");
    expect(tables).toContain("message");
    expect(tables).toContain("part");
    expect(tables).toContain("audit_log");
    expect(tables).toContain("key_value");
    expect(tables).toContain("agent_context");
    expect(tables).toContain("_migrations");
  });

  it("session table has parent_session_id and agent_type columns", () => {
    const columns = db
      .query<{ name: string }, []>("PRAGMA table_info(session)")
      .all()
      .map((r) => r.name);

    expect(columns).toContain("parent_session_id");
    expect(columns).toContain("agent_type");
  });

  it("agent_context table has correct columns", () => {
    const columns = db
      .query<{ name: string }, []>("PRAGMA table_info(agent_context)")
      .all()
      .map((r) => r.name);

    expect(columns).toContain("id");
    expect(columns).toContain("session_id");
    expect(columns).toContain("kind");
    expect(columns).toContain("key");
    expect(columns).toContain("value");
    expect(columns).toContain("created_at");
  });

  it("message role CHECK constraint works", () => {
    const s = createSession({ title: "Constraint Test" });
    expect(() => {
      db.prepare(
        "INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)",
      ).run(randomUUID(), s.id, "invalid_role", "test", Date.now());
    }).toThrow();
  });

  it("foreign key cascade works for messages", () => {
    const s = createSession({ title: "FK Test" });
    addMessage(s.id, "user", "will cascade");
    deleteSession(s.id);
    const msgs = db
      .query<{ id: string }, [string]>("SELECT id FROM message WHERE session_id = ?")
      .all(s.id);
    expect(msgs.length).toBe(0);
  });
});
