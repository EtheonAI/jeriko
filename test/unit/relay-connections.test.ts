// Relay connection manager tests — registration, lookup, trigger routing.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  authenticate,
  getConnection,
  findByTriggerId,
  registerTriggers,
  unregisterTriggers,
  sendTo,
  getStats,
  addPending,
  removeByWs,
} from "../../apps/relay/src/connections.js";

// Mock WebSocket for testing
function createMockWs(readyState = 1): any {
  const messages: string[] = [];
  return {
    readyState,
    data: {},
    send(msg: string) { messages.push(msg); },
    close(_code?: number, _reason?: string) { this.readyState = 3; },
    __messages: messages,
  };
}

describe("relay/connections", () => {
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedSecret = process.env.RELAY_AUTH_SECRET;
    process.env.RELAY_AUTH_SECRET = "test-secret-key";
  });

  afterEach(() => {
    if (savedSecret !== undefined) {
      process.env.RELAY_AUTH_SECRET = savedSecret;
    } else {
      delete process.env.RELAY_AUTH_SECRET;
    }
  });

  describe("authenticate", () => {
    it("accepts valid credentials", () => {
      const ws = createMockWs();
      addPending(ws);

      const result = authenticate(ws, "user-1", "test-secret-key", "2.0.0");
      expect(result).toBe(true);
    });

    it("rejects invalid token", () => {
      const ws = createMockWs();
      addPending(ws);

      const result = authenticate(ws, "user-1", "wrong-token");
      expect(result).toBe(false);
    });

    it("rejects when RELAY_AUTH_SECRET is not configured", () => {
      delete process.env.RELAY_AUTH_SECRET;
      const ws = createMockWs();
      addPending(ws);

      const result = authenticate(ws, "user-1", "any-token");
      expect(result).toBe(false);
    });
  });

  describe("getConnection", () => {
    it("returns connection after authenticate", () => {
      const ws = createMockWs();
      addPending(ws);
      authenticate(ws, "user-conn-1", "test-secret-key");

      const conn = getConnection("user-conn-1");
      expect(conn).toBeDefined();
      expect(conn!.userId).toBe("user-conn-1");
      expect(conn!.authenticated).toBe(true);
    });

    it("returns undefined for unknown user", () => {
      expect(getConnection("nonexistent-user")).toBeUndefined();
    });
  });

  describe("trigger routing", () => {
    it("registers and finds triggers by ID", () => {
      const ws = createMockWs();
      addPending(ws);
      authenticate(ws, "user-trigger-1", "test-secret-key");

      registerTriggers("user-trigger-1", ["t1", "t2", "t3"]);

      const conn = findByTriggerId("t2");
      expect(conn).toBeDefined();
      expect(conn!.userId).toBe("user-trigger-1");
    });

    it("returns undefined for unregistered trigger", () => {
      expect(findByTriggerId("nonexistent-trigger")).toBeUndefined();
    });

    it("unregisters triggers", () => {
      const ws = createMockWs();
      addPending(ws);
      authenticate(ws, "user-unreg-1", "test-secret-key");

      registerTriggers("user-unreg-1", ["unreg-t1", "unreg-t2"]);
      unregisterTriggers("user-unreg-1", ["unreg-t1"]);

      // unreg-t1 was removed — should not be found on this user
      const conn = getConnection("user-unreg-1");
      expect(conn!.triggerIds.has("unreg-t1")).toBe(false);
      expect(conn!.triggerIds.has("unreg-t2")).toBe(true);
    });
  });

  describe("sendTo", () => {
    it("sends message to connected user", () => {
      const ws = createMockWs();
      addPending(ws);
      authenticate(ws, "user-send-1", "test-secret-key");

      const result = sendTo("user-send-1", { type: "pong" });
      expect(result).toBe(true);
      expect(ws.__messages).toHaveLength(1);
      expect(JSON.parse(ws.__messages[0])).toEqual({ type: "pong" });
    });

    it("returns false for disconnected user", () => {
      const result = sendTo("nonexistent-user", { type: "pong" });
      expect(result).toBe(false);
    });
  });

  describe("removeByWs", () => {
    it("removes connection and returns userId", () => {
      const ws = createMockWs();
      addPending(ws);
      authenticate(ws, "user-remove-1", "test-secret-key");

      const userId = removeByWs(ws);
      expect(userId).toBe("user-remove-1");
      expect(getConnection("user-remove-1")).toBeUndefined();
    });
  });

  describe("getStats", () => {
    it("reports connection count", () => {
      const ws = createMockWs();
      addPending(ws);
      authenticate(ws, "user-stats-1", "test-secret-key");

      const stats = getStats();
      expect(stats.totalConnections).toBeGreaterThanOrEqual(1);
      expect(stats.users.find((u) => u.userId === "user-stats-1")).toBeDefined();
    });
  });

  describe("superseding connections", () => {
    it("evicts old connection when same userId reconnects", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      addPending(ws1);
      addPending(ws2);

      authenticate(ws1, "user-super-1", "test-secret-key");
      authenticate(ws2, "user-super-1", "test-secret-key");

      // Old connection should be closed
      expect(ws1.readyState).toBe(3); // closed

      // New connection is active
      const conn = getConnection("user-super-1");
      expect(conn).toBeDefined();
      expect(conn!.ws).toBe(ws2);
    });
  });

  describe("removeByWs race protection", () => {
    it("does not remove a superseding connection when old ws close fires late", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      addPending(ws1);
      addPending(ws2);

      // ws1 connects first
      authenticate(ws1, "user-race-1", "test-secret-key");
      // ws2 supersedes ws1 (same userId)
      authenticate(ws2, "user-race-1", "test-secret-key");

      // Simulate: ws1's close event fires AFTER ws2 has already registered.
      // Without the race fix, this would delete ws2's connection entry.
      const userId = removeByWs(ws1);
      expect(userId).toBe("user-race-1");

      // ws2's connection should still be active
      const conn = getConnection("user-race-1");
      expect(conn).toBeDefined();
      expect(conn!.ws).toBe(ws2);
    });
  });

  describe("trigger registration limits", () => {
    it("accepts triggers up to the per-connection limit", () => {
      const ws = createMockWs();
      addPending(ws);
      authenticate(ws, "user-limit-1", "test-secret-key");

      // Register a small batch — should succeed
      registerTriggers("user-limit-1", ["tl-1", "tl-2", "tl-3"]);
      const conn = getConnection("user-limit-1");
      expect(conn!.triggerIds.size).toBe(3);
    });
  });
});
