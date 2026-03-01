/**
 * Tests for the TUI SessionProvider — session and message state management.
 *
 * Tests the DisplayMessage type contract and session info transformation
 * without requiring a full SolidJS context or database.
 */

import { describe, test, expect } from "bun:test";
import type { DisplayMessage, SessionInfo } from "../../../src/cli/tui/context/session.js";

// ---------------------------------------------------------------------------
// Helpers — mirrors the transformation logic from SessionProvider
// ---------------------------------------------------------------------------

function toSessionInfo(row: Record<string, unknown>): SessionInfo {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    model: row.model as string,
    tokenCount: (row.token_count as number) ?? 0,
    updatedAt: row.updated_at as number,
  };
}

function toDisplayMessage(row: Record<string, unknown>): DisplayMessage {
  return {
    id: row.id as string,
    role: row.role as DisplayMessage["role"],
    content: row.content as string,
    createdAt: row.created_at as number,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Session State", () => {
  describe("toSessionInfo", () => {
    test("transforms a DB row to SessionInfo", () => {
      const row = {
        id: "abc-123",
        slug: "bold-nexus-042",
        title: "bold-nexus-042",
        model: "claude",
        token_count: 2500,
        updated_at: 1700000000000,
      };

      const info = toSessionInfo(row);
      expect(info.id).toBe("abc-123");
      expect(info.slug).toBe("bold-nexus-042");
      expect(info.model).toBe("claude");
      expect(info.tokenCount).toBe(2500);
    });

    test("defaults token count to 0 when missing", () => {
      const row = {
        id: "abc",
        slug: "slug",
        title: "title",
        model: "claude",
        updated_at: 0,
      };

      const info = toSessionInfo(row);
      expect(info.tokenCount).toBe(0);
    });
  });

  describe("toDisplayMessage", () => {
    test("transforms a DB message row", () => {
      const row = {
        id: "msg-1",
        role: "user",
        content: "Hello world",
        created_at: 1700000000000,
      };

      const msg = toDisplayMessage(row);
      expect(msg.id).toBe("msg-1");
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("Hello world");
    });

    test("preserves all roles", () => {
      for (const role of ["user", "assistant", "system", "tool"]) {
        const msg = toDisplayMessage({ id: "x", role, content: "", created_at: 0 });
        expect(msg.role).toBe(role);
      }
    });
  });

  describe("DisplayMessage type", () => {
    test("supports optional thinking and toolCalls", () => {
      const msg: DisplayMessage = {
        id: "msg-1",
        role: "assistant",
        content: "Response text",
        thinking: "Let me analyze...",
        toolCalls: [
          { id: "tc-1", name: "bash", arguments: "{}", status: "done", result: "ok" },
        ],
        meta: {
          model: "claude",
          tokensIn: 100,
          tokensOut: 500,
          durationMs: 2300,
        },
        createdAt: Date.now(),
      };

      expect(msg.thinking).toBe("Let me analyze...");
      expect(msg.toolCalls).toHaveLength(1);
      expect(msg.meta?.model).toBe("claude");
      expect(msg.meta?.durationMs).toBe(2300);
    });

    test("user messages have minimal fields", () => {
      const msg: DisplayMessage = {
        id: "msg-2",
        role: "user",
        content: "Hello",
        createdAt: Date.now(),
      };

      expect(msg.thinking).toBeUndefined();
      expect(msg.toolCalls).toBeUndefined();
      expect(msg.meta).toBeUndefined();
    });
  });

  describe("conversation history extraction", () => {
    test("filters to user and assistant messages only", () => {
      const messages: DisplayMessage[] = [
        { id: "1", role: "system", content: "You are...", createdAt: 0 },
        { id: "2", role: "user", content: "Hello", createdAt: 1 },
        { id: "3", role: "assistant", content: "Hi!", createdAt: 2 },
        { id: "4", role: "tool", content: "tool output", createdAt: 3 },
        { id: "5", role: "user", content: "Thanks", createdAt: 4 },
      ];

      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      expect(history).toHaveLength(3);
      expect(history[0]!.role).toBe("user");
      expect(history[1]!.role).toBe("assistant");
      expect(history[2]!.role).toBe("user");
    });
  });
});
