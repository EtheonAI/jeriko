import { describe, expect, it, afterAll } from "bun:test";
import { initDatabase } from "../../src/daemon/storage/db.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = join(tmpdir(), `jeriko-test-${Date.now()}.db`);

describe("database", () => {
  const db = initDatabase(TEST_DB);

  afterAll(() => {
    db.close();
    try {
      if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
      if (existsSync(TEST_DB + "-wal")) unlinkSync(TEST_DB + "-wal");
      if (existsSync(TEST_DB + "-shm")) unlinkSync(TEST_DB + "-shm");
    } catch { /* cleanup best effort */ }
  });

  it("creates session table", () => {
    const tables = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(tables).toContain("session");
    expect(tables).toContain("message");
    expect(tables).toContain("part");
    expect(tables).toContain("audit_log");
    expect(tables).toContain("trigger_def");
    expect(tables).toContain("key_value");
  });

  it("can insert and query a session", () => {
    const now = Date.now();
    db.prepare(
      "INSERT INTO session (id, slug, title, model, created_at, updated_at, token_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("test-1", "test-slug", "Test Session", "claude", now, now, 0);

    const row = db
      .query<{ id: string; title: string }, [string]>("SELECT * FROM session WHERE id = ?")
      .get("test-1");

    expect(row).not.toBeNull();
    expect(row!.title).toBe("Test Session");
  });

  it("can insert and query messages", () => {
    const now = Date.now();
    db.prepare(
      "INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("msg-1", "test-1", "user", "Hello", 5, 0, now);

    const msgs = db
      .query<{ id: string; content: string }, [string]>("SELECT * FROM message WHERE session_id = ?")
      .all("test-1");

    expect(msgs.length).toBe(1);
    expect(msgs[0]!.content).toBe("Hello");
  });

  it("cascades message delete on session delete", () => {
    db.prepare("DELETE FROM session WHERE id = ?").run("test-1");
    const msgs = db
      .query<{ id: string }, [string]>("SELECT * FROM message WHERE session_id = ?")
      .all("test-1");
    expect(msgs.length).toBe(0);
  });
});
