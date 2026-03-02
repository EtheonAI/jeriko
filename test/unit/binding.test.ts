import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";

// ─── Test database ─────────────────────────────────────────────────────────
const TEST_DB = join(tmpdir(), `jeriko-binding-test-${Date.now()}.db`);

import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";

beforeAll(() => {
  initDatabase(TEST_DB);
});

afterAll(() => {
  closeDatabase();
  try {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(TEST_DB + "-wal")) unlinkSync(TEST_DB + "-wal");
    if (existsSync(TEST_DB + "-shm")) unlinkSync(TEST_DB + "-shm");
  } catch { /* cleanup best effort */ }
});

// ─── Import module under test ──────────────────────────────────────────────
import {
  bindSession,
  getBinding,
  updateBindingModel,
  unbindSession,
  restoreBindings,
  type ChannelBinding,
} from "../../src/daemon/services/channels/binding.js";

import { kvSet, kvDelete, kvList } from "../../src/daemon/storage/kv.js";

// Clean up all channel bindings between tests
beforeEach(() => {
  const entries = kvList("channel:");
  for (const { key } of entries) {
    kvDelete(key);
  }
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("channel binding", () => {
  describe("bindSession", () => {
    it("creates a binding retrievable by getBinding", () => {
      bindSession("telegram", "123", "sess-abc", "claude");

      const binding = getBinding("telegram", "123");
      expect(binding).not.toBeNull();
      expect(binding!.sessionId).toBe("sess-abc");
      expect(binding!.model).toBe("claude");
      expect(binding!.boundAt).toBeGreaterThan(0);
    });

    it("overwrites an existing binding for the same chat", () => {
      bindSession("telegram", "123", "sess-old", "claude");
      bindSession("telegram", "123", "sess-new", "gpt-4o");

      const binding = getBinding("telegram", "123");
      expect(binding!.sessionId).toBe("sess-new");
      expect(binding!.model).toBe("gpt-4o");
    });

    it("isolates bindings by channel", () => {
      bindSession("telegram", "123", "sess-tg", "claude");
      bindSession("whatsapp", "123", "sess-wa", "gpt-4o");

      expect(getBinding("telegram", "123")!.sessionId).toBe("sess-tg");
      expect(getBinding("whatsapp", "123")!.sessionId).toBe("sess-wa");
    });

    it("isolates bindings by chatId", () => {
      bindSession("telegram", "111", "sess-a", "claude");
      bindSession("telegram", "222", "sess-b", "claude");

      expect(getBinding("telegram", "111")!.sessionId).toBe("sess-a");
      expect(getBinding("telegram", "222")!.sessionId).toBe("sess-b");
    });
  });

  describe("getBinding", () => {
    it("returns null for a non-existent binding", () => {
      expect(getBinding("telegram", "nonexistent")).toBeNull();
    });

    it("returns null for a different channel with the same chatId", () => {
      bindSession("telegram", "123", "sess-abc", "claude");
      expect(getBinding("whatsapp", "123")).toBeNull();
    });
  });

  describe("updateBindingModel", () => {
    it("updates the model without changing the sessionId", () => {
      bindSession("telegram", "123", "sess-abc", "claude");
      updateBindingModel("telegram", "123", "gpt-4o");

      const binding = getBinding("telegram", "123");
      expect(binding!.sessionId).toBe("sess-abc");
      expect(binding!.model).toBe("gpt-4o");
    });

    it("is a no-op if no binding exists", () => {
      // Should not throw
      updateBindingModel("telegram", "nonexistent", "gpt-4o");
      expect(getBinding("telegram", "nonexistent")).toBeNull();
    });

    it("preserves the boundAt timestamp", () => {
      bindSession("telegram", "123", "sess-abc", "claude");
      const before = getBinding("telegram", "123")!.boundAt;

      updateBindingModel("telegram", "123", "gpt-4o");
      const after = getBinding("telegram", "123")!.boundAt;

      expect(after).toBe(before);
    });
  });

  describe("unbindSession", () => {
    it("removes the binding", () => {
      bindSession("telegram", "123", "sess-abc", "claude");
      unbindSession("telegram", "123");

      expect(getBinding("telegram", "123")).toBeNull();
    });

    it("is a no-op if no binding exists", () => {
      // Should not throw
      unbindSession("telegram", "nonexistent");
    });

    it("does not affect other chat bindings", () => {
      bindSession("telegram", "111", "sess-a", "claude");
      bindSession("telegram", "222", "sess-b", "claude");

      unbindSession("telegram", "111");

      expect(getBinding("telegram", "111")).toBeNull();
      expect(getBinding("telegram", "222")).not.toBeNull();
    });
  });

  describe("restoreBindings", () => {
    it("restores all bindings for a channel", () => {
      bindSession("telegram", "111", "sess-a", "claude");
      bindSession("telegram", "222", "sess-b", "gpt-4o");

      const restored = restoreBindings("telegram");

      expect(restored).toHaveLength(2);
      const chatIds = restored.map((r) => r.chatId).sort();
      expect(chatIds).toEqual(["111", "222"]);
    });

    it("returns empty array when no bindings exist", () => {
      const restored = restoreBindings("telegram");
      expect(restored).toEqual([]);
    });

    it("does not return bindings from other channels", () => {
      bindSession("telegram", "111", "sess-a", "claude");
      bindSession("whatsapp", "222", "sess-b", "gpt-4o");

      const restored = restoreBindings("telegram");
      expect(restored).toHaveLength(1);
      expect(restored[0]!.chatId).toBe("111");
    });

    it("includes all binding fields in restored entries", () => {
      bindSession("telegram", "123", "sess-abc", "claude");
      const [entry] = restoreBindings("telegram");

      expect(entry!.chatId).toBe("123");
      expect(entry!.sessionId).toBe("sess-abc");
      expect(entry!.model).toBe("claude");
      expect(entry!.boundAt).toBeGreaterThan(0);
    });

    it("filters out invalid bindings via validator", () => {
      bindSession("telegram", "111", "sess-valid", "claude");
      bindSession("telegram", "222", "sess-invalid", "claude");

      const restored = restoreBindings("telegram", (b) => b.sessionId === "sess-valid");

      expect(restored).toHaveLength(1);
      expect(restored[0]!.sessionId).toBe("sess-valid");
    });

    it("deletes invalid bindings from KV store", () => {
      bindSession("telegram", "111", "sess-valid", "claude");
      bindSession("telegram", "222", "sess-invalid", "claude");

      restoreBindings("telegram", (b) => b.sessionId === "sess-valid");

      // The invalid binding should have been deleted from KV
      expect(getBinding("telegram", "222")).toBeNull();
      // The valid one should still exist
      expect(getBinding("telegram", "111")).not.toBeNull();
    });

    it("deletes bindings with missing sessionId", () => {
      // Manually insert a malformed binding via KV
      kvSet("channel:telegram:999", { model: "claude", boundAt: Date.now() });

      const restored = restoreBindings("telegram");
      expect(restored).toEqual([]);
      // Should have been cleaned up
      const entries = kvList("channel:telegram:999");
      expect(entries).toHaveLength(0);
    });
  });
});
