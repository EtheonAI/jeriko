/**
 * Tests for the TUI AgentProvider event processing logic.
 *
 * Tests the processEvent function behavior (extracted logic) to verify
 * that agent events are correctly mapped to state changes.
 */

import { describe, test, expect } from "bun:test";
import type { ToolCallState, ToolCallStatus } from "../../../src/cli/tui/context/agent.js";

// ---------------------------------------------------------------------------
// Extracted event processing logic (mirrors AgentProvider.processEvent)
// ---------------------------------------------------------------------------

interface AgentState {
  streamingText: string;
  thinkingText: string;
  activeToolCalls: ToolCallState[];
  lastTurnTokens: { in: number; out: number };
  toasts: Array<{ message: string; variant: string }>;
}

function createEmptyState(): AgentState {
  return {
    streamingText: "",
    thinkingText: "",
    activeToolCalls: [],
    lastTurnTokens: { in: 0, out: 0 },
    toasts: [],
  };
}

function processEvent(state: AgentState, event: Record<string, unknown>): AgentState {
  const next = { ...state };
  const type = event.type as string;

  switch (type) {
    case "text_delta":
      next.streamingText = state.streamingText + (event.content as string);
      break;

    case "thinking":
      next.thinkingText = state.thinkingText + (event.content as string);
      break;

    case "tool_call_start": {
      const tc = event.toolCall as { id: string; name: string; arguments: string };
      next.activeToolCalls = [
        ...state.activeToolCalls,
        { id: tc.id, name: tc.name, arguments: tc.arguments ?? "", status: "running" as ToolCallStatus },
      ];
      break;
    }

    case "tool_result": {
      const toolCallId = event.toolCallId as string;
      const result = event.result as string;
      const isError = event.isError as boolean;
      next.activeToolCalls = state.activeToolCalls.map((tc) =>
        tc.id === toolCallId
          ? { ...tc, status: (isError ? "error" : "done") as ToolCallStatus, result }
          : tc,
      );
      break;
    }

    case "turn_complete":
      next.lastTurnTokens = {
        in: (event.tokensIn as number) ?? 0,
        out: (event.tokensOut as number) ?? 0,
      };
      break;

    case "compaction":
      next.toasts = [
        ...state.toasts,
        { message: `Context compacted: ${event.beforeTokens} → ${event.afterTokens} tokens`, variant: "info" },
      ];
      break;

    case "error":
      next.toasts = [
        ...state.toasts,
        { message: event.message as string, variant: "error" },
      ];
      break;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Agent Event Processing", () => {
  describe("text_delta", () => {
    test("accumulates text content", () => {
      let state = createEmptyState();
      state = processEvent(state, { type: "text_delta", content: "Hello " });
      state = processEvent(state, { type: "text_delta", content: "world" });
      expect(state.streamingText).toBe("Hello world");
    });

    test("handles empty content", () => {
      let state = createEmptyState();
      state = processEvent(state, { type: "text_delta", content: "" });
      expect(state.streamingText).toBe("");
    });
  });

  describe("thinking", () => {
    test("accumulates thinking content", () => {
      let state = createEmptyState();
      state = processEvent(state, { type: "thinking", content: "Let me " });
      state = processEvent(state, { type: "thinking", content: "think..." });
      expect(state.thinkingText).toBe("Let me think...");
    });
  });

  describe("tool_call_start", () => {
    test("adds a new tool call with running status", () => {
      let state = createEmptyState();
      state = processEvent(state, {
        type: "tool_call_start",
        toolCall: { id: "tc1", name: "bash", arguments: '{"command":"ls"}' },
      });

      expect(state.activeToolCalls).toHaveLength(1);
      expect(state.activeToolCalls[0]!.id).toBe("tc1");
      expect(state.activeToolCalls[0]!.name).toBe("bash");
      expect(state.activeToolCalls[0]!.status).toBe("running");
    });

    test("accumulates multiple tool calls", () => {
      let state = createEmptyState();
      state = processEvent(state, {
        type: "tool_call_start",
        toolCall: { id: "tc1", name: "bash", arguments: "{}" },
      });
      state = processEvent(state, {
        type: "tool_call_start",
        toolCall: { id: "tc2", name: "read", arguments: "{}" },
      });

      expect(state.activeToolCalls).toHaveLength(2);
    });
  });

  describe("tool_result", () => {
    test("updates tool call status to done", () => {
      let state = createEmptyState();
      state = processEvent(state, {
        type: "tool_call_start",
        toolCall: { id: "tc1", name: "bash", arguments: "{}" },
      });
      state = processEvent(state, {
        type: "tool_result",
        toolCallId: "tc1",
        result: "output text",
        isError: false,
      });

      expect(state.activeToolCalls[0]!.status).toBe("done");
      expect(state.activeToolCalls[0]!.result).toBe("output text");
    });

    test("updates tool call status to error", () => {
      let state = createEmptyState();
      state = processEvent(state, {
        type: "tool_call_start",
        toolCall: { id: "tc1", name: "bash", arguments: "{}" },
      });
      state = processEvent(state, {
        type: "tool_result",
        toolCallId: "tc1",
        result: "command not found",
        isError: true,
      });

      expect(state.activeToolCalls[0]!.status).toBe("error");
    });

    test("only updates the matching tool call", () => {
      let state = createEmptyState();
      state = processEvent(state, {
        type: "tool_call_start",
        toolCall: { id: "tc1", name: "bash", arguments: "{}" },
      });
      state = processEvent(state, {
        type: "tool_call_start",
        toolCall: { id: "tc2", name: "read", arguments: "{}" },
      });
      state = processEvent(state, {
        type: "tool_result",
        toolCallId: "tc1",
        result: "done",
        isError: false,
      });

      expect(state.activeToolCalls[0]!.status).toBe("done");
      expect(state.activeToolCalls[1]!.status).toBe("running");
    });
  });

  describe("turn_complete", () => {
    test("records token usage", () => {
      let state = createEmptyState();
      state = processEvent(state, {
        type: "turn_complete",
        tokensIn: 500,
        tokensOut: 1200,
      });

      expect(state.lastTurnTokens.in).toBe(500);
      expect(state.lastTurnTokens.out).toBe(1200);
    });

    test("defaults to zero for missing token values", () => {
      let state = createEmptyState();
      state = processEvent(state, { type: "turn_complete" });

      expect(state.lastTurnTokens.in).toBe(0);
      expect(state.lastTurnTokens.out).toBe(0);
    });
  });

  describe("compaction", () => {
    test("creates an info toast", () => {
      let state = createEmptyState();
      state = processEvent(state, {
        type: "compaction",
        beforeTokens: 50000,
        afterTokens: 12000,
      });

      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0]!.variant).toBe("info");
      expect(state.toasts[0]!.message).toContain("50000");
      expect(state.toasts[0]!.message).toContain("12000");
    });
  });

  describe("error", () => {
    test("creates an error toast", () => {
      let state = createEmptyState();
      state = processEvent(state, {
        type: "error",
        message: "Rate limit exceeded",
      });

      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0]!.variant).toBe("error");
      expect(state.toasts[0]!.message).toBe("Rate limit exceeded");
    });
  });

  describe("full conversation flow", () => {
    test("processes a complete tool-use turn", () => {
      let state = createEmptyState();

      // Thinking
      state = processEvent(state, { type: "thinking", content: "Planning to list files..." });

      // Tool call
      state = processEvent(state, {
        type: "tool_call_start",
        toolCall: { id: "tc1", name: "bash", arguments: '{"command":"ls -la"}' },
      });

      // Tool result
      state = processEvent(state, {
        type: "tool_result",
        toolCallId: "tc1",
        result: "total 42\ndrwxr-xr-x ...",
        isError: false,
      });

      // Text response
      state = processEvent(state, { type: "text_delta", content: "The directory contains 42 items." });

      // Turn complete
      state = processEvent(state, {
        type: "turn_complete",
        tokensIn: 200,
        tokensOut: 800,
      });

      expect(state.thinkingText).toBe("Planning to list files...");
      expect(state.activeToolCalls).toHaveLength(1);
      expect(state.activeToolCalls[0]!.status).toBe("done");
      expect(state.streamingText).toBe("The directory contains 42 items.");
      expect(state.lastTurnTokens).toEqual({ in: 200, out: 800 });
    });
  });
});
