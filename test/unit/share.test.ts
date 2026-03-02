// Share feature tests — validates share store, URL generation, and share lifecycle.
//
// Tests:
//   - Share store: create, get, revoke, list, expiry filtering
//   - URL generation: shared utility produces correct links
//   - Share ID format: URL-safe, correct length
//   - Migration: shared_session table exists after init

import { describe, expect, it, afterAll, beforeAll } from "bun:test";
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
import {
  createShare,
  getShare,
  getShareRaw,
  revokeShare,
  listSharesBySession,
  listShares,
} from "../../src/daemon/storage/share.js";
import { buildShareLink, getShareUrl, getPublicUrl } from "../../src/shared/urls.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import type { Database } from "bun:sqlite";

const TEST_DB = join(tmpdir(), `jeriko-share-test-${Date.now()}.db`);

describe("share", () => {
  let db: Database;

  beforeAll(() => {
    db = initDatabase(TEST_DB);

    // Seed a session and messages for share tests
    const now = Date.now();
    db.prepare(
      `INSERT INTO session (id, slug, title, model, created_at, updated_at, token_count, agent_type)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'general')`,
    ).run("sess-1", "bold-agent-001", "Test Conversation", "claude", now, now);

    db.prepare(
      `INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
    ).run("msg-1", "sess-1", "user", "Hello, how are you?", now);

    db.prepare(
      `INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
    ).run("msg-2", "sess-1", "assistant", "I'm doing well! How can I help?", now + 1000);

    // Seed a second session
    db.prepare(
      `INSERT INTO session (id, slug, title, model, created_at, updated_at, token_count, agent_type)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'general')`,
    ).run("sess-2", "calm-tower-042", "Another Session", "gpt4", now + 5000, now + 5000);

    db.prepare(
      `INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
    ).run("msg-3", "sess-2", "user", "Different conversation", now + 5000);
  });

  afterAll(() => {
    closeDatabase();
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        if (existsSync(TEST_DB + suffix)) unlinkSync(TEST_DB + suffix);
      } catch { /* cleanup best effort */ }
    }
  });

  // ── Migration ────────────────────────────────────────────────

  it("creates shared_session table", () => {
    const tables = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(tables).toContain("shared_session");
  });

  it("creates share_id unique index", () => {
    const indexes = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(indexes).toContain("idx_shared_session_share_id");
  });

  // ── Share creation ───────────────────────────────────────────

  it("creates a share with valid share_id", () => {
    const messages = JSON.stringify([
      { role: "user", content: "Hello", created_at: Date.now() },
      { role: "assistant", content: "Hi!", created_at: Date.now() + 100 },
    ]);

    const share = createShare({
      sessionId: "sess-1",
      title: "Test Conversation",
      model: "claude",
      messages,
    });

    expect(share.id).toBeTruthy();
    expect(share.share_id).toBeTruthy();
    expect(share.share_id.length).toBeGreaterThanOrEqual(6);
    expect(share.session_id).toBe("sess-1");
    expect(share.title).toBe("Test Conversation");
    expect(share.model).toBe("claude");
    expect(share.revoked_at).toBeNull();
    expect(share.created_at).toBeGreaterThan(0);
    // Default expiry: 30 days from now
    expect(share.expires_at).not.toBeNull();
    expect(share.expires_at!).toBeGreaterThan(Date.now());
  });

  it("creates a share without expiry", () => {
    const messages = JSON.stringify([{ role: "user", content: "Test", created_at: Date.now() }]);

    const share = createShare({
      sessionId: "sess-1",
      title: "No Expiry",
      model: "claude",
      messages,
      expiresInMs: null,
    });

    expect(share.expires_at).toBeNull();
  });

  it("creates shares with unique share IDs", () => {
    const messages = JSON.stringify([{ role: "user", content: "Test", created_at: Date.now() }]);

    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const share = createShare({
        sessionId: "sess-1",
        title: `Share ${i}`,
        model: "claude",
        messages,
      });
      ids.add(share.share_id);
    }

    // All 10 IDs should be unique
    expect(ids.size).toBe(10);
  });

  it("generates URL-safe share IDs", () => {
    const messages = JSON.stringify([{ role: "user", content: "Test", created_at: Date.now() }]);
    const share = createShare({
      sessionId: "sess-1",
      title: "URL Safe Test",
      model: "claude",
      messages,
    });

    // base64url alphabet: A-Z, a-z, 0-9, -, _
    expect(share.share_id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  // ── Share retrieval ──────────────────────────────────────────

  it("retrieves a share by share_id", () => {
    const messages = JSON.stringify([{ role: "user", content: "Find me", created_at: Date.now() }]);
    const created = createShare({
      sessionId: "sess-1",
      title: "Findable",
      model: "claude",
      messages,
    });

    const found = getShare(created.share_id);
    expect(found).not.toBeNull();
    expect(found!.share_id).toBe(created.share_id);
    expect(found!.title).toBe("Findable");
  });

  it("returns null for non-existent share_id", () => {
    const found = getShare("nonexistent-id");
    expect(found).toBeNull();
  });

  it("returns null for expired share", () => {
    const messages = JSON.stringify([{ role: "user", content: "Expired", created_at: Date.now() }]);
    const share = createShare({
      sessionId: "sess-1",
      title: "Will Expire",
      model: "claude",
      messages,
    });

    // Manually expire the share by setting expires_at to the past
    db.prepare("UPDATE shared_session SET expires_at = ? WHERE share_id = ?")
      .run(Date.now() - 1000, share.share_id);

    const found = getShare(share.share_id);
    expect(found).toBeNull();
  });

  it("returns null for revoked share via getShare", () => {
    const messages = JSON.stringify([{ role: "user", content: "Revocable", created_at: Date.now() }]);
    const share = createShare({
      sessionId: "sess-1",
      title: "Will Revoke",
      model: "claude",
      messages,
    });

    revokeShare(share.share_id);

    const found = getShare(share.share_id);
    expect(found).toBeNull();
  });

  it("getShareRaw returns revoked shares", () => {
    const messages = JSON.stringify([{ role: "user", content: "Raw check", created_at: Date.now() }]);
    const share = createShare({
      sessionId: "sess-1",
      title: "Raw Revoked",
      model: "claude",
      messages,
    });

    revokeShare(share.share_id);

    const raw = getShareRaw(share.share_id);
    expect(raw).not.toBeNull();
    expect(raw!.revoked_at).not.toBeNull();
  });

  // ── Revocation ───────────────────────────────────────────────

  it("revokes a share and returns true", () => {
    const messages = JSON.stringify([{ role: "user", content: "Revoke me", created_at: Date.now() }]);
    const share = createShare({
      sessionId: "sess-1",
      title: "Revokable",
      model: "claude",
      messages,
    });

    const result = revokeShare(share.share_id);
    expect(result).toBe(true);
  });

  it("returns false for already-revoked share", () => {
    const messages = JSON.stringify([{ role: "user", content: "Double revoke", created_at: Date.now() }]);
    const share = createShare({
      sessionId: "sess-1",
      title: "Double Revoke",
      model: "claude",
      messages,
    });

    revokeShare(share.share_id);
    const result = revokeShare(share.share_id);
    expect(result).toBe(false);
  });

  it("returns false for non-existent share_id", () => {
    const result = revokeShare("does-not-exist");
    expect(result).toBe(false);
  });

  // ── Listing ──────────────────────────────────────────────────

  it("lists shares by session ID (active only)", () => {
    const messages = JSON.stringify([{ role: "user", content: "Listable", created_at: Date.now() }]);

    // Create a share for sess-2
    const share = createShare({
      sessionId: "sess-2",
      title: "Session 2 Share",
      model: "gpt4",
      messages,
    });

    const shares = listSharesBySession("sess-2");
    expect(shares.length).toBeGreaterThanOrEqual(1);

    const found = shares.find((s) => s.share_id === share.share_id);
    expect(found).toBeTruthy();
    expect(found!.session_id).toBe("sess-2");
  });

  it("listShares returns all shares sorted by creation desc", () => {
    const shares = listShares(100);
    expect(shares.length).toBeGreaterThan(0);

    // Verify descending order
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i - 1]!.created_at).toBeGreaterThanOrEqual(shares[i]!.created_at);
    }
  });

  it("listShares respects limit", () => {
    const shares = listShares(2);
    expect(shares.length).toBeLessThanOrEqual(2);
  });

  // ── URL utility ──────────────────────────────────────────────

  it("buildShareLink produces correct URL format", () => {
    const url = buildShareLink("abc123");
    expect(url).toMatch(/\/s\/abc123$/);
  });

  it("getPublicUrl returns default when env not set", () => {
    const original = process.env.JERIKO_PUBLIC_URL;
    delete process.env.JERIKO_PUBLIC_URL;

    const url = getPublicUrl();
    expect(url).toBe("https://bot.jeriko.ai");

    if (original !== undefined) process.env.JERIKO_PUBLIC_URL = original;
  });

  it("getPublicUrl reads JERIKO_PUBLIC_URL env var", () => {
    const original = process.env.JERIKO_PUBLIC_URL;
    process.env.JERIKO_PUBLIC_URL = "https://custom.example.com";

    const url = getPublicUrl();
    expect(url).toBe("https://custom.example.com");

    if (original !== undefined) {
      process.env.JERIKO_PUBLIC_URL = original;
    } else {
      delete process.env.JERIKO_PUBLIC_URL;
    }
  });

  it("getShareUrl prefers JERIKO_SHARE_URL over JERIKO_PUBLIC_URL", () => {
    const origShare = process.env.JERIKO_SHARE_URL;
    const origPublic = process.env.JERIKO_PUBLIC_URL;

    process.env.JERIKO_SHARE_URL = "https://share.jeriko.ai";
    process.env.JERIKO_PUBLIC_URL = "https://bot.jeriko.ai";

    const url = getShareUrl();
    expect(url).toBe("https://share.jeriko.ai");

    if (origShare !== undefined) {
      process.env.JERIKO_SHARE_URL = origShare;
    } else {
      delete process.env.JERIKO_SHARE_URL;
    }
    if (origPublic !== undefined) {
      process.env.JERIKO_PUBLIC_URL = origPublic;
    } else {
      delete process.env.JERIKO_PUBLIC_URL;
    }
  });

  // ── Message snapshot integrity ───────────────────────────────

  it("preserves message content in snapshot", () => {
    const original = [
      { role: "user", content: "What is 2+2?", created_at: 1000 },
      { role: "assistant", content: "2+2 equals 4.", created_at: 2000 },
    ];
    const messages = JSON.stringify(original);

    const share = createShare({
      sessionId: "sess-1",
      title: "Math",
      model: "claude",
      messages,
    });

    const retrieved = getShare(share.share_id);
    expect(retrieved).not.toBeNull();

    const parsed = JSON.parse(retrieved!.messages);
    expect(parsed).toEqual(original);
    expect(parsed.length).toBe(2);
    expect(parsed[0].content).toBe("What is 2+2?");
    expect(parsed[1].content).toBe("2+2 equals 4.");
  });
});
