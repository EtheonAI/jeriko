// Storage layer audit tests — validates database init, migrations, all stores, and schema constraints.

import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, unlinkSync, existsSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Storage layer imports
import {
  initDatabase,
  closeDatabase,
  runMigrations,
} from "../../src/daemon/storage/db.js";
import { kvSet, kvGet, kvDelete, kvList } from "../../src/daemon/storage/kv.js";
import {
  createShare,
  getShare,
  getShareRaw,
  revokeShare,
  listSharesBySession,
  listShares,
  pruneExpiredShares,
} from "../../src/daemon/storage/share.js";

// Session/message stores (use getDatabase() singleton internally)
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
  deleteMessage,
  clearMessages,
  addPart,
  getParts,
  getPartsByType,
} from "../../src/daemon/agent/session/message.js";

// Migration registry
import { MIGRATIONS } from "../../src/daemon/storage/migrations.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), `jeriko-storage-audit-${Date.now()}`);
const TEST_DB = join(TEST_DIR, "test.db");

function cleanupDb(): void {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      const p = TEST_DB + suffix;
      if (existsSync(p)) unlinkSync(p);
    } catch { /* best effort */ }
  }
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("storage-audit", () => {
  let db: Database;

  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    db = initDatabase(TEST_DB);
  });

  afterAll(() => {
    cleanupDb();
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* */ }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Database Initialization & PRAGMAs
  // ═══════════════════════════════════════════════════════════════════════════

  describe("database initialization", () => {
    it("creates a valid database file", () => {
      expect(existsSync(TEST_DB)).toBe(true);
    });

    it("sets WAL journal mode", () => {
      const row = db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get();
      expect(row!.journal_mode).toBe("wal");
    });

    it("sets synchronous to NORMAL", () => {
      const row = db.query<{ synchronous: number }, []>("PRAGMA synchronous").get();
      // NORMAL = 1
      expect(row!.synchronous).toBe(1);
    });

    it("sets busy_timeout to 5000", () => {
      const row = db.query<{ timeout: number }, []>("PRAGMA busy_timeout").get();
      expect(row!.timeout).toBe(5000);
    });

    it("sets cache_size to -64000 (64MB)", () => {
      const row = db.query<{ cache_size: number }, []>("PRAGMA cache_size").get();
      expect(row!.cache_size).toBe(-64000);
    });

    it("enables foreign keys", () => {
      const row = db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get();
      expect(row!.foreign_keys).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Migrations
  // ═══════════════════════════════════════════════════════════════════════════

  describe("migrations", () => {
    it("has 6 migrations in the registry", () => {
      expect(MIGRATIONS.length).toBe(6);
    });

    it("migrations are in lexicographic order", () => {
      for (let i = 1; i < MIGRATIONS.length; i++) {
        expect(MIGRATIONS[i]!.filename > MIGRATIONS[i - 1]!.filename).toBe(true);
      }
    });

    it("all migrations are recorded in _migrations table", () => {
      const applied = db
        .query<{ name: string }, []>("SELECT name FROM _migrations ORDER BY name")
        .all()
        .map((r) => r.name);
      expect(applied.length).toBe(6);
      expect(applied).toEqual(MIGRATIONS.map((m) => m.filename));
    });

    it("each migration has an applied_at timestamp", () => {
      const rows = db
        .query<{ name: string; applied_at: number }, []>(
          "SELECT name, applied_at FROM _migrations",
        )
        .all();
      for (const row of rows) {
        expect(typeof row.applied_at).toBe("number");
        expect(row.applied_at).toBeGreaterThan(0);
      }
    });

    it("migrations are idempotent (re-running is a no-op)", () => {
      const countBefore = db
        .query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM _migrations")
        .get()!.cnt;

      // Run again
      runMigrations(db);

      const countAfter = db
        .query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM _migrations")
        .get()!.cnt;

      expect(countAfter).toBe(countBefore);
    });

    it("creates all expected tables", () => {
      const tables = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map((r) => r.name);

      expect(tables).toContain("_migrations");
      expect(tables).toContain("session");
      expect(tables).toContain("message");
      expect(tables).toContain("part");
      expect(tables).toContain("audit_log");
      expect(tables).toContain("key_value");
      expect(tables).toContain("agent_context");
      expect(tables).toContain("shared_session");
      expect(tables).toContain("billing_subscription");
      expect(tables).toContain("billing_event");
      expect(tables).toContain("billing_license");
      expect(tables).toContain("billing_consent");
    });

    it("trigger_def table was dropped by migration 0003", () => {
      const tables = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='trigger_def'",
        )
        .all();
      expect(tables.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Session CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe("session store", () => {
    it("creates a session with defaults", () => {
      const s = createSession();
      expect(s.id).toBeTruthy();
      expect(s.slug).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
      expect(s.title).toBe(s.slug);
      expect(s.model).toBe("claude");
      expect(s.created_at).toBeGreaterThan(0);
      expect(s.updated_at).toBe(s.created_at);
      expect(s.archived_at).toBeNull();
      expect(s.token_count).toBe(0);
      expect(s.parent_session_id).toBeNull();
      expect(s.agent_type).toBe("general");
    });

    it("creates a session with custom opts", () => {
      const s = createSession({
        title: "Test Session",
        model: "gpt-4o",
        agentType: "research",
      });
      expect(s.title).toBe("Test Session");
      expect(s.model).toBe("gpt-4o");
      expect(s.agent_type).toBe("research");
    });

    it("retrieves a session by ID", () => {
      const s = createSession({ title: "Findable" });
      const found = getSession(s.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(s.id);
      expect(found!.title).toBe("Findable");
    });

    it("returns null for non-existent session", () => {
      expect(getSession("nonexistent-id")).toBeNull();
    });

    it("retrieves a session by slug", () => {
      const s = createSession();
      const found = getSessionBySlug(s.slug);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(s.id);
    });

    it("lists sessions ordered by updated_at DESC", () => {
      const s1 = createSession({ title: "First-order" });
      // Touch s1 to give it a later updated_at than s2
      const s2 = createSession({ title: "Second-order" });
      // Explicitly touch s1 so its updated_at > s2's
      touchSession(s1.id);
      const list = listSessions(100);
      const ids = list.map((s) => s.id);
      // s1 was touched after s2 was created, so s1 should appear first
      expect(ids.indexOf(s1.id)).toBeLessThan(ids.indexOf(s2.id));
    });

    it("excludes archived sessions by default", () => {
      const s = createSession({ title: "Archivable" });
      archiveSession(s.id);
      const list = listSessions(100);
      expect(list.find((x) => x.id === s.id)).toBeUndefined();
    });

    it("includes archived sessions when requested", () => {
      const s = createSession({ title: "Archivable2" });
      archiveSession(s.id);
      const list = listSessions(100, true);
      expect(list.find((x) => x.id === s.id)).toBeTruthy();
    });

    it("updates session title", () => {
      const s = createSession();
      updateSession(s.id, { title: "Updated Title" });
      const updated = getSession(s.id)!;
      expect(updated.title).toBe("Updated Title");
      expect(updated.updated_at).toBeGreaterThanOrEqual(s.updated_at);
    });

    it("updates session model", () => {
      const s = createSession();
      updateSession(s.id, { model: "gpt-4" });
      expect(getSession(s.id)!.model).toBe("gpt-4");
    });

    it("updates session token_count", () => {
      const s = createSession();
      updateSession(s.id, { token_count: 1500 });
      expect(getSession(s.id)!.token_count).toBe(1500);
    });

    it("touches session updated_at", () => {
      const s = createSession();
      const originalUpdated = s.updated_at;
      // Small delay to ensure different timestamp
      touchSession(s.id);
      const touched = getSession(s.id)!;
      expect(touched.updated_at).toBeGreaterThanOrEqual(originalUpdated);
    });

    it("deletes a session", () => {
      const s = createSession({ title: "Deletable" });
      deleteSession(s.id);
      expect(getSession(s.id)).toBeNull();
    });

    it("cascade deletes messages when session is deleted", () => {
      const s = createSession();
      addMessage(s.id, "user", "Hello");
      deleteSession(s.id);
      const msgs = getMessages(s.id);
      expect(msgs.length).toBe(0);
    });

    it("supports parent-child session linking", () => {
      const parent = createSession({ title: "Parent" });
      const child = createSession({
        title: "Child",
        parentSessionId: parent.id,
        agentType: "task",
      });
      expect(child.parent_session_id).toBe(parent.id);
      expect(child.agent_type).toBe("task");
      const fetched = getSession(child.id)!;
      expect(fetched.parent_session_id).toBe(parent.id);
    });

    it("sets parent_session_id to NULL on parent delete (ON DELETE SET NULL)", () => {
      const parent = createSession({ title: "Parent to delete" });
      const child = createSession({
        title: "Orphan child",
        parentSessionId: parent.id,
      });
      deleteSession(parent.id);
      const fetched = getSession(child.id)!;
      expect(fetched.parent_session_id).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Message CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe("message store", () => {
    let sessionId: string;

    beforeEach(() => {
      const s = createSession({ title: "MessageTest-" + Date.now() });
      sessionId = s.id;
    });

    it("adds a message and returns the row", () => {
      const msg = addMessage(sessionId, "user", "Hello!");
      expect(msg.id).toBeTruthy();
      expect(msg.session_id).toBe(sessionId);
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("Hello!");
      expect(msg.tokens_input).toBe(0);
      expect(msg.tokens_output).toBe(0);
      expect(msg.created_at).toBeGreaterThan(0);
    });

    it("adds a message with token counts", () => {
      const msg = addMessage(sessionId, "assistant", "Response", {
        input: 10,
        output: 25,
      });
      expect(msg.tokens_input).toBe(10);
      expect(msg.tokens_output).toBe(25);
    });

    it("increments session token_count on addMessage", () => {
      addMessage(sessionId, "user", "Q1", { input: 5, output: 0 });
      addMessage(sessionId, "assistant", "A1", { input: 0, output: 20 });
      const s = getSession(sessionId)!;
      expect(s.token_count).toBe(25);
    });

    it("touches session updated_at on addMessage", () => {
      const before = getSession(sessionId)!.updated_at;
      addMessage(sessionId, "user", "Touching");
      const after = getSession(sessionId)!.updated_at;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it("retrieves messages ordered by created_at ASC", () => {
      addMessage(sessionId, "user", "First");
      addMessage(sessionId, "assistant", "Second");
      addMessage(sessionId, "user", "Third");
      const msgs = getMessages(sessionId);
      expect(msgs.length).toBe(3);
      expect(msgs[0]!.content).toBe("First");
      expect(msgs[1]!.content).toBe("Second");
      expect(msgs[2]!.content).toBe("Third");
    });

    it("retrieves messages with limit", () => {
      addMessage(sessionId, "user", "A");
      addMessage(sessionId, "user", "B");
      addMessage(sessionId, "user", "C");
      const msgs = getMessages(sessionId, 2);
      expect(msgs.length).toBe(2);
    });

    it("retrieves recent messages (last N)", () => {
      addMessage(sessionId, "user", "Old");
      addMessage(sessionId, "assistant", "Middle");
      addMessage(sessionId, "user", "New");
      const recent = getRecentMessages(sessionId, 2);
      expect(recent.length).toBe(2);
      // The last 2 messages should be returned (Middle and New)
      // but ordering within same-ms timestamps is non-deterministic,
      // so just verify we got the right set
      const contents = recent.map((m) => m.content).sort();
      expect(contents).toEqual(["Middle", "New"].sort());
    });

    it("computes session token count from messages", () => {
      addMessage(sessionId, "user", "Q", { input: 10, output: 0 });
      addMessage(sessionId, "assistant", "A", { input: 0, output: 30 });
      expect(getSessionTokenCount(sessionId)).toBe(40);
    });

    it("deletes a single message", () => {
      const msg = addMessage(sessionId, "user", "Temp");
      deleteMessage(msg.id);
      const msgs = getMessages(sessionId);
      expect(msgs.find((m) => m.id === msg.id)).toBeUndefined();
    });

    it("clears all messages and resets token count", () => {
      addMessage(sessionId, "user", "A", { input: 10, output: 0 });
      addMessage(sessionId, "assistant", "B", { input: 0, output: 20 });
      clearMessages(sessionId);
      expect(getMessages(sessionId).length).toBe(0);
      expect(getSession(sessionId)!.token_count).toBe(0);
    });

    it("enforces role CHECK constraint", () => {
      expect(() => {
        db.prepare(
          "INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)",
        ).run(randomUUID(), sessionId, "invalid_role", "test", Date.now());
      }).toThrow();
    });

    it("enforces session_id foreign key", () => {
      expect(() => {
        db.prepare(
          "INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)",
        ).run(randomUUID(), "nonexistent-session", "user", "test", Date.now());
      }).toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Part CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  describe("part store", () => {
    let sessionId: string;
    let messageId: string;

    beforeEach(() => {
      const s = createSession({ title: "PartTest" });
      sessionId = s.id;
      const msg = addMessage(sessionId, "assistant", "Response with parts");
      messageId = msg.id;
    });

    it("adds a text part", () => {
      const part = addPart(messageId, "text", "Hello world");
      expect(part.id).toBeTruthy();
      expect(part.message_id).toBe(messageId);
      expect(part.type).toBe("text");
      expect(part.content).toBe("Hello world");
      expect(part.tool_name).toBeNull();
      expect(part.tool_call_id).toBeNull();
    });

    it("adds a tool_call part with tool metadata", () => {
      const part = addPart(messageId, "tool_call", '{"arg":1}', "bash", "call_123");
      expect(part.type).toBe("tool_call");
      expect(part.tool_name).toBe("bash");
      expect(part.tool_call_id).toBe("call_123");
    });

    it("adds a tool_result part", () => {
      const part = addPart(messageId, "tool_result", "output", "bash", "call_123");
      expect(part.type).toBe("tool_result");
    });

    it("retrieves parts ordered by created_at", () => {
      addPart(messageId, "text", "First");
      addPart(messageId, "tool_call", "Second", "exec");
      addPart(messageId, "text", "Third");
      const parts = getParts(messageId);
      expect(parts.length).toBe(3);
      expect(parts[0]!.content).toBe("First");
      expect(parts[2]!.content).toBe("Third");
    });

    it("filters parts by type", () => {
      addPart(messageId, "text", "Text1");
      addPart(messageId, "tool_call", "Call1", "bash");
      addPart(messageId, "text", "Text2");
      const textParts = getPartsByType(messageId, "text");
      expect(textParts.length).toBe(2);
      const toolParts = getPartsByType(messageId, "tool_call");
      expect(toolParts.length).toBe(1);
    });

    it("enforces type CHECK constraint", () => {
      expect(() => {
        db.prepare(
          "INSERT INTO part (id, message_id, type, content, created_at) VALUES (?, ?, ?, ?, ?)",
        ).run(randomUUID(), messageId, "invalid_type", "test", Date.now());
      }).toThrow();
    });

    it("cascade deletes parts when message is deleted", () => {
      const part = addPart(messageId, "text", "Will be deleted");
      deleteMessage(messageId);
      const parts = getParts(messageId);
      expect(parts.length).toBe(0);
    });

    it("cascade deletes parts when session is deleted", () => {
      addPart(messageId, "text", "Deep cascade");
      deleteSession(sessionId);
      const parts = getParts(messageId);
      expect(parts.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. KV Store
  // ═══════════════════════════════════════════════════════════════════════════

  describe("kv store", () => {
    it("sets and gets a string value", () => {
      kvSet("test:string", "hello");
      expect(kvGet("test:string")).toBe("hello");
    });

    it("sets and gets a numeric value", () => {
      kvSet("test:number", 42);
      expect(kvGet("test:number")).toBe(42);
    });

    it("sets and gets an object value", () => {
      const obj = { name: "test", nested: { a: 1 } };
      kvSet("test:object", obj);
      expect(kvGet("test:object")).toEqual(obj);
    });

    it("sets and gets an array value", () => {
      kvSet("test:array", [1, 2, 3]);
      expect(kvGet("test:array")).toEqual([1, 2, 3]);
    });

    it("sets and gets a boolean value", () => {
      kvSet("test:bool", true);
      expect(kvGet("test:bool")).toBe(true);
    });

    it("sets and gets null value", () => {
      kvSet("test:null", null);
      expect(kvGet("test:null")).toBeNull();
    });

    it("returns null for non-existent key", () => {
      expect(kvGet("nonexistent:key")).toBeNull();
    });

    it("upserts on conflict (updates existing key)", () => {
      kvSet("test:upsert", "original");
      kvSet("test:upsert", "updated");
      expect(kvGet("test:upsert")).toBe("updated");
    });

    it("deletes a key", () => {
      kvSet("test:delete", "temp");
      kvDelete("test:delete");
      expect(kvGet("test:delete")).toBeNull();
    });

    it("delete is a no-op for non-existent key", () => {
      // Should not throw
      kvDelete("nonexistent:delete");
    });

    it("lists all keys", () => {
      kvSet("list:a", 1);
      kvSet("list:b", 2);
      const all = kvList();
      expect(all.length).toBeGreaterThanOrEqual(2);
      const keys = all.map((r) => r.key);
      expect(keys).toContain("list:a");
      expect(keys).toContain("list:b");
    });

    it("lists keys by prefix", () => {
      kvSet("prefix:alpha", 1);
      kvSet("prefix:beta", 2);
      kvSet("other:gamma", 3);
      const filtered = kvList("prefix:");
      const keys = filtered.map((r) => r.key);
      expect(keys).toContain("prefix:alpha");
      expect(keys).toContain("prefix:beta");
      expect(keys).not.toContain("other:gamma");
    });

    it("list with empty prefix returns all", () => {
      const all = kvList("");
      expect(all.length).toBeGreaterThan(0);
    });

    it("updates updated_at on upsert", () => {
      kvSet("test:timestamp", "v1");
      const row1 = db
        .query<{ updated_at: number }, [string]>(
          "SELECT updated_at FROM key_value WHERE key = ?",
        )
        .get("test:timestamp");

      kvSet("test:timestamp", "v2");
      const row2 = db
        .query<{ updated_at: number }, [string]>(
          "SELECT updated_at FROM key_value WHERE key = ?",
        )
        .get("test:timestamp");

      expect(row2!.updated_at).toBeGreaterThanOrEqual(row1!.updated_at);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Share Store
  // ═══════════════════════════════════════════════════════════════════════════

  describe("share store", () => {
    let sessionId: string;

    beforeEach(() => {
      const s = createSession({ title: "ShareTest" });
      sessionId = s.id;
    });

    it("creates a shared session", () => {
      const share = createShare({
        sessionId,
        title: "Shared Chat",
        model: "claude",
        messages: JSON.stringify([{ role: "user", content: "Hi" }]),
      });
      expect(share.id).toBeTruthy();
      expect(share.share_id).toBeTruthy();
      expect(share.share_id.length).toBe(8); // 6 bytes base64url = 8 chars
      expect(share.session_id).toBe(sessionId);
      expect(share.title).toBe("Shared Chat");
      expect(share.revoked_at).toBeNull();
      expect(share.expires_at).toBeGreaterThan(Date.now()); // default 30 day expiry
    });

    it("creates a share with no expiry", () => {
      const share = createShare({
        sessionId,
        title: "Permanent",
        model: "claude",
        messages: "[]",
        expiresInMs: null,
      });
      expect(share.expires_at).toBeNull();
    });

    it("retrieves a share by share_id", () => {
      const share = createShare({
        sessionId,
        title: "Retrievable",
        model: "claude",
        messages: "[]",
      });
      const found = getShare(share.share_id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(share.id);
    });

    it("returns null for non-existent share_id", () => {
      expect(getShare("nonexistent")).toBeNull();
    });

    it("returns null for revoked share", () => {
      const share = createShare({
        sessionId,
        title: "Revokable",
        model: "claude",
        messages: "[]",
      });
      revokeShare(share.share_id);
      expect(getShare(share.share_id)).toBeNull();
    });

    it("returns null for expired share", () => {
      const share = createShare({
        sessionId,
        title: "Expiring",
        model: "claude",
        messages: "[]",
        expiresInMs: 1, // expires in 1ms
      });
      // Wait a tiny bit to ensure expiry
      const start = Date.now();
      while (Date.now() - start < 5) { /* spin */ }
      expect(getShare(share.share_id)).toBeNull();
    });

    it("getShareRaw returns revoked/expired shares", () => {
      const share = createShare({
        sessionId,
        title: "Raw access",
        model: "claude",
        messages: "[]",
      });
      revokeShare(share.share_id);
      const raw = getShareRaw(share.share_id);
      expect(raw).not.toBeNull();
      expect(raw!.revoked_at).not.toBeNull();
    });

    it("revokes a share and returns true", () => {
      const share = createShare({
        sessionId,
        title: "To revoke",
        model: "claude",
        messages: "[]",
      });
      expect(revokeShare(share.share_id)).toBe(true);
    });

    it("revoking a non-existent share returns false", () => {
      expect(revokeShare("nonexistent")).toBe(false);
    });

    it("double-revoking returns false (already revoked)", () => {
      const share = createShare({
        sessionId,
        title: "Double revoke",
        model: "claude",
        messages: "[]",
      });
      revokeShare(share.share_id);
      expect(revokeShare(share.share_id)).toBe(false);
    });

    it("lists shares by session", () => {
      const s1 = createShare({
        sessionId,
        title: "S1",
        model: "claude",
        messages: "[]",
      });
      const s2 = createShare({
        sessionId,
        title: "S2",
        model: "claude",
        messages: "[]",
      });
      const list = listSharesBySession(sessionId);
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it("lists all shares", () => {
      const list = listShares(100);
      expect(list.length).toBeGreaterThan(0);
    });

    it("prunes expired shares", () => {
      const share = createShare({
        sessionId,
        title: "Prunable",
        model: "claude",
        messages: "[]",
        expiresInMs: 1,
      });
      const start = Date.now();
      while (Date.now() - start < 5) { /* spin */ }
      const pruned = pruneExpiredShares();
      expect(pruned).toBeGreaterThanOrEqual(1);
    });

    it("enforces share_id UNIQUE constraint", () => {
      const share = createShare({
        sessionId,
        title: "Unique test",
        model: "claude",
        messages: "[]",
      });
      expect(() => {
        db.prepare(
          "INSERT INTO shared_session (id, share_id, session_id, title, model, messages, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(randomUUID(), share.share_id, sessionId, "dup", "claude", "[]", Date.now());
      }).toThrow();
    });

    it("cascade deletes shares when session is deleted", () => {
      const s = createSession({ title: "Session to delete with share" });
      const share = createShare({
        sessionId: s.id,
        title: "Cascade",
        model: "claude",
        messages: "[]",
      });
      deleteSession(s.id);
      expect(getShareRaw(share.share_id)).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Agent Context (from migration 0002)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("agent_context table", () => {
    let sessionId: string;

    beforeEach(() => {
      const s = createSession({ title: "ContextTest" });
      sessionId = s.id;
    });

    it("inserts and retrieves agent context", () => {
      const id = randomUUID().slice(0, 12);
      const now = Date.now();
      db.prepare(
        "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(id, sessionId, "tool_call", "bash", '{"cmd":"ls"}', now);

      const rows = db
        .query<{ id: string; kind: string; key: string; value: string }, [string]>(
          "SELECT * FROM agent_context WHERE session_id = ?",
        )
        .all(sessionId);
      expect(rows.length).toBe(1);
      expect(rows[0]!.kind).toBe("tool_call");
      expect(rows[0]!.key).toBe("bash");
    });

    it("enforces kind CHECK constraint", () => {
      expect(() => {
        db.prepare(
          "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(randomUUID(), sessionId, "invalid_kind", "key", "val", Date.now());
      }).toThrow();
    });

    it("allows all valid kind values", () => {
      const kinds = ["tool_call", "file_write", "file_edit", "artifact", "error", "metric"];
      for (const kind of kinds) {
        db.prepare(
          "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(randomUUID(), sessionId, kind, "key", "val", Date.now());
      }
      const count = db
        .query<{ cnt: number }, [string]>(
          "SELECT COUNT(*) as cnt FROM agent_context WHERE session_id = ?",
        )
        .get(sessionId)!.cnt;
      expect(count).toBe(kinds.length);
    });

    it("cascade deletes context when session is deleted", () => {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO agent_context (id, session_id, kind, key, value, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(id, sessionId, "artifact", "result", "data", Date.now());
      deleteSession(sessionId);
      const rows = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM agent_context WHERE id = ?",
        )
        .all(id);
      expect(rows.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Audit Log table
  // ═══════════════════════════════════════════════════════════════════════════

  describe("audit_log table", () => {
    it("inserts and retrieves audit log entries", () => {
      const id = randomUUID();
      const now = Date.now();
      db.prepare(
        `INSERT INTO audit_log (id, lease_id, agent, command, risk, decision, reason, duration_ms, exit_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, "lease-1", "main", "bash ls", "low", "allow", "safe", 150, 0, now);

      const row = db
        .query<{ id: string; command: string; duration_ms: number }, [string]>(
          "SELECT * FROM audit_log WHERE id = ?",
        )
        .get(id);
      expect(row).not.toBeNull();
      expect(row!.command).toBe("bash ls");
      expect(row!.duration_ms).toBe(150);
    });

    it("allows nullable duration_ms and exit_code", () => {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO audit_log (id, lease_id, agent, command, risk, decision, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, "lease-2", "main", "cmd", "high", "deny", "risky", Date.now());

      const row = db
        .query<{ duration_ms: number | null; exit_code: number | null }, [string]>(
          "SELECT duration_ms, exit_code FROM audit_log WHERE id = ?",
        )
        .get(id);
      expect(row!.duration_ms).toBeNull();
      expect(row!.exit_code).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Billing Tables (Schema Validation)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("billing tables", () => {
    it("inserts into billing_subscription", () => {
      const id = "sub_test_" + Date.now();
      db.prepare(
        `INSERT INTO billing_subscription (id, customer_id, email, tier, status)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, "cus_test", "test@example.com", "pro", "active");

      const row = db
        .query<{ id: string; tier: string }, [string]>(
          "SELECT * FROM billing_subscription WHERE id = ?",
        )
        .get(id);
      expect(row).not.toBeNull();
      expect(row!.tier).toBe("pro");
    });

    it("inserts into billing_event", () => {
      const id = "evt_test_" + Date.now();
      db.prepare(
        "INSERT INTO billing_event (id, type, payload) VALUES (?, ?, ?)",
      ).run(id, "invoice.paid", '{"amount": 999}');

      const row = db
        .query<{ id: string; type: string }, [string]>(
          "SELECT * FROM billing_event WHERE id = ?",
        )
        .get(id);
      expect(row!.type).toBe("invoice.paid");
    });

    it("inserts into billing_license with default key", () => {
      // Use default key 'current'
      db.prepare(
        `INSERT OR REPLACE INTO billing_license (key, tier, connector_limit, trigger_limit)
         VALUES ('current', 'free', 2, 3)`,
      ).run();

      const row = db
        .query<{ tier: string; connector_limit: number }, []>(
          "SELECT * FROM billing_license WHERE key = 'current'",
        )
        .get();
      expect(row!.tier).toBe("free");
      expect(row!.connector_limit).toBe(2);
    });

    it("inserts into billing_consent", () => {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO billing_consent (id, subscription_id, email, client_ip, terms_accepted_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, "sub_123", "user@test.com", "1.2.3.4", Date.now());

      const row = db
        .query<{ email: string; client_ip: string }, [string]>(
          "SELECT * FROM billing_consent WHERE id = ?",
        )
        .get(id);
      expect(row!.email).toBe("user@test.com");
      expect(row!.client_ip).toBe("1.2.3.4");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Schema Constraints
  // ═══════════════════════════════════════════════════════════════════════════

  describe("schema constraints", () => {
    it("session.slug is NOT NULL", () => {
      expect(() => {
        db.prepare(
          "INSERT INTO session (id, slug, title, model, created_at, updated_at, token_count) VALUES (?, NULL, ?, ?, ?, ?, 0)",
        ).run(randomUUID(), "t", "m", Date.now(), Date.now());
      }).toThrow();
    });

    it("message.content is NOT NULL", () => {
      const s = createSession();
      expect(() => {
        db.prepare(
          "INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at) VALUES (?, ?, 'user', NULL, 0, 0, ?)",
        ).run(randomUUID(), s.id, Date.now());
      }).toThrow();
    });

    it("key_value.key is PRIMARY KEY (unique)", () => {
      const key = "unique:test:" + Date.now();
      db.prepare("INSERT INTO key_value (key, value, updated_at) VALUES (?, '1', ?)").run(key, Date.now());
      expect(() => {
        db.prepare("INSERT INTO key_value (key, value, updated_at) VALUES (?, '2', ?)").run(key, Date.now());
      }).toThrow();
    });

    it("message.role CHECK allows only valid roles", () => {
      const s = createSession();
      for (const role of ["user", "assistant", "system", "tool"]) {
        db.prepare(
          "INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at) VALUES (?, ?, ?, 'test', 0, 0, ?)",
        ).run(randomUUID(), s.id, role, Date.now());
      }
      // All 4 should succeed (no throw above)
      expect(true).toBe(true);
    });

    it("part.type CHECK allows only valid types", () => {
      const s = createSession();
      const msg = addMessage(s.id, "user", "test");
      for (const type of ["text", "tool_call", "tool_result", "error"]) {
        db.prepare(
          "INSERT INTO part (id, message_id, type, content, created_at) VALUES (?, ?, ?, 'test', ?)",
        ).run(randomUUID(), msg.id, type, Date.now());
      }
      expect(true).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. Index Verification
  // ═══════════════════════════════════════════════════════════════════════════

  describe("indexes", () => {
    it("has expected indexes on session table", () => {
      const indexes = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='session' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((r) => r.name);
      expect(indexes).toContain("idx_session_created_at");
      expect(indexes).toContain("idx_session_slug");
      expect(indexes).toContain("idx_session_archived_at");
      expect(indexes).toContain("idx_session_parent");
      expect(indexes).toContain("idx_session_agent_type");
    });

    it("has expected indexes on message table", () => {
      const indexes = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='message' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((r) => r.name);
      expect(indexes).toContain("idx_message_session_id");
      expect(indexes).toContain("idx_message_created_at");
      expect(indexes).toContain("idx_message_session_time");
    });

    it("has expected indexes on part table", () => {
      const indexes = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='part' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((r) => r.name);
      expect(indexes).toContain("idx_part_message_id");
      expect(indexes).toContain("idx_part_tool_call_id");
    });

    it("has expected indexes on audit_log table", () => {
      const indexes = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='audit_log' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((r) => r.name);
      expect(indexes).toContain("idx_audit_log_created_at");
      expect(indexes).toContain("idx_audit_log_lease_id");
      expect(indexes).toContain("idx_audit_log_agent");
    });

    it("has expected indexes on shared_session table", () => {
      const indexes = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='shared_session' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((r) => r.name);
      expect(indexes).toContain("idx_shared_session_share_id");
      expect(indexes).toContain("idx_shared_session_session_id");
      expect(indexes).toContain("idx_shared_session_created_at");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. Fresh Database (test migrations from scratch)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("fresh database migration", () => {
    it("applies all migrations cleanly to a fresh database", () => {
      const freshDir = join(tmpdir(), `jeriko-fresh-${Date.now()}`);
      mkdirSync(freshDir, { recursive: true });
      const freshPath = join(freshDir, "fresh.db");

      // Create a raw database and run migrations manually
      const freshDb = new Database(freshPath, { create: true });
      freshDb.exec("PRAGMA journal_mode = WAL");
      freshDb.exec("PRAGMA foreign_keys = ON");

      runMigrations(freshDb);

      // Verify all tables exist
      const tables = freshDb
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map((r) => r.name);

      expect(tables).toContain("session");
      expect(tables).toContain("message");
      expect(tables).toContain("part");
      expect(tables).toContain("audit_log");
      expect(tables).toContain("key_value");
      expect(tables).toContain("agent_context");
      expect(tables).toContain("shared_session");
      expect(tables).toContain("billing_subscription");

      // Verify all 6 migrations recorded
      const applied = freshDb
        .query<{ name: string }, []>("SELECT name FROM _migrations ORDER BY name")
        .all();
      expect(applied.length).toBe(6);

      freshDb.close();
      try { rmSync(freshDir, { recursive: true, force: true }); } catch { /* */ }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. closeDatabase and re-init
  // ═══════════════════════════════════════════════════════════════════════════

  describe("database lifecycle", () => {
    it("closeDatabase is safe to call multiple times", () => {
      // We can't actually close the main db in the middle of tests,
      // but we can test the pattern with a separate instance.
      const tmpPath = join(tmpdir(), `jeriko-lifecycle-${Date.now()}.db`);
      const tmpDb = initDatabase(tmpPath);

      // First close
      closeDatabase();
      // Second close (should be no-op)
      closeDatabase();

      // Re-init should work (restores singleton for remaining tests)
      db = initDatabase(TEST_DB);

      // Cleanup
      for (const suffix of ["", "-wal", "-shm"]) {
        try { if (existsSync(tmpPath + suffix)) unlinkSync(tmpPath + suffix); } catch { /* */ }
      }
    });
  });
});
