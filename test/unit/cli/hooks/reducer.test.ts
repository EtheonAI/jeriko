/**
 * Tests for the CLI app reducer — every action type transition.
 *
 * The reducer is a pure function: (state, action) → state.
 * These tests verify every action produces correct state without side effects.
 */

import { describe, test, expect } from "bun:test";
import { appReducer } from "../../../../src/cli/hooks/useAppReducer.js";
import { createInitialState } from "../../../../src/cli/types.js";
import type { AppState, AppAction, DisplayToolCall, DisplayMessage } from "../../../../src/cli/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides?: Partial<AppState>): AppState {
  return { ...createInitialState({}), ...overrides };
}

function makeMessage(overrides?: Partial<DisplayMessage>): DisplayMessage {
  return {
    id: "msg-1",
    role: "user",
    content: "hello",
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeToolCall(overrides?: Partial<DisplayToolCall>): DisplayToolCall {
  return {
    id: "tc-1",
    name: "read",
    args: { file_path: "test.ts" },
    status: "running",
    startTime: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SET_PHASE
// ---------------------------------------------------------------------------

describe("SET_PHASE", () => {
  test("transitions from idle to thinking", () => {
    const state = makeState({ phase: "idle" });
    const next = appReducer(state, { type: "SET_PHASE", phase: "thinking" });
    expect(next.phase).toBe("thinking");
  });

  test("transitions from thinking to streaming", () => {
    const state = makeState({ phase: "thinking" });
    const next = appReducer(state, { type: "SET_PHASE", phase: "streaming" });
    expect(next.phase).toBe("streaming");
  });

  test("transitions to sub-executing", () => {
    const state = makeState({ phase: "tool-executing" });
    const next = appReducer(state, { type: "SET_PHASE", phase: "sub-executing" });
    expect(next.phase).toBe("sub-executing");
  });

  test("does not mutate other state fields", () => {
    const state = makeState({ phase: "idle", model: "gpt4" });
    const next = appReducer(state, { type: "SET_PHASE", phase: "thinking" });
    expect(next.model).toBe("gpt4");
    expect(next.messages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ADD_MESSAGE / CLEAR_MESSAGES
// ---------------------------------------------------------------------------

describe("ADD_MESSAGE", () => {
  test("appends a message to the list", () => {
    const state = makeState();
    const msg = makeMessage();
    const next = appReducer(state, { type: "ADD_MESSAGE", message: msg });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toBe(msg);
  });

  test("preserves existing messages", () => {
    const existing = makeMessage({ id: "msg-0" });
    const state = makeState({ messages: [existing] });
    const next = appReducer(state, { type: "ADD_MESSAGE", message: makeMessage({ id: "msg-1" }) });
    expect(next.messages).toHaveLength(2);
    expect(next.messages[0]!.id).toBe("msg-0");
    expect(next.messages[1]!.id).toBe("msg-1");
  });
});

describe("CLEAR_MESSAGES", () => {
  test("empties the message list", () => {
    const state = makeState({ messages: [makeMessage()] });
    const next = appReducer(state, { type: "CLEAR_MESSAGES" });
    expect(next.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// APPEND_STREAM_TEXT / CLEAR_STREAM
// ---------------------------------------------------------------------------

describe("APPEND_STREAM_TEXT", () => {
  test("appends content to stream text", () => {
    const state = makeState({ streamText: "Hello" });
    const next = appReducer(state, { type: "APPEND_STREAM_TEXT", content: " world" });
    expect(next.streamText).toBe("Hello world");
  });

  test("starts from empty", () => {
    const state = makeState();
    const next = appReducer(state, { type: "APPEND_STREAM_TEXT", content: "start" });
    expect(next.streamText).toBe("start");
  });
});

describe("CLEAR_STREAM", () => {
  test("resets stream text to empty", () => {
    const state = makeState({ streamText: "some text" });
    const next = appReducer(state, { type: "CLEAR_STREAM" });
    expect(next.streamText).toBe("");
  });
});

// ---------------------------------------------------------------------------
// TOOL_CALL_START / TOOL_CALL_RESULT / CLEAR_TOOL_CALLS
// ---------------------------------------------------------------------------

describe("TOOL_CALL_START", () => {
  test("adds a tool call to the live list", () => {
    const state = makeState();
    const tc = makeToolCall();
    const next = appReducer(state, { type: "TOOL_CALL_START", toolCall: tc });
    expect(next.liveToolCalls).toHaveLength(1);
    expect(next.liveToolCalls[0]!.name).toBe("read");
  });

  test("preserves existing tool calls", () => {
    const existing = makeToolCall({ id: "tc-0" });
    const state = makeState({ liveToolCalls: [existing] });
    const next = appReducer(state, { type: "TOOL_CALL_START", toolCall: makeToolCall({ id: "tc-1" }) });
    expect(next.liveToolCalls).toHaveLength(2);
  });
});

describe("TOOL_CALL_RESULT", () => {
  test("updates matching tool call with result", () => {
    const tc = makeToolCall({ id: "tc-1", startTime: Date.now() - 1000 });
    const state = makeState({ liveToolCalls: [tc] });
    const next = appReducer(state, {
      type: "TOOL_CALL_RESULT",
      id: "tc-1",
      result: "file contents",
      isError: false,
    });
    expect(next.liveToolCalls[0]!.status).toBe("completed");
    expect(next.liveToolCalls[0]!.result).toBe("file contents");
    expect(next.liveToolCalls[0]!.isError).toBe(false);
    expect(next.liveToolCalls[0]!.durationMs).toBeGreaterThan(0);
  });

  test("does not modify non-matching tool calls", () => {
    const tc1 = makeToolCall({ id: "tc-1" });
    const tc2 = makeToolCall({ id: "tc-2" });
    const state = makeState({ liveToolCalls: [tc1, tc2] });
    const next = appReducer(state, {
      type: "TOOL_CALL_RESULT",
      id: "tc-1",
      result: "done",
      isError: false,
    });
    expect(next.liveToolCalls[1]!.status).toBe("running");
  });

  test("marks error results", () => {
    const tc = makeToolCall({ id: "tc-err" });
    const state = makeState({ liveToolCalls: [tc] });
    const next = appReducer(state, {
      type: "TOOL_CALL_RESULT",
      id: "tc-err",
      result: "command failed",
      isError: true,
    });
    expect(next.liveToolCalls[0]!.isError).toBe(true);
  });
});

describe("CLEAR_TOOL_CALLS", () => {
  test("empties the tool call list", () => {
    const state = makeState({ liveToolCalls: [makeToolCall()] });
    const next = appReducer(state, { type: "CLEAR_TOOL_CALLS" });
    expect(next.liveToolCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SET_CURRENT_TOOL
// ---------------------------------------------------------------------------

describe("SET_CURRENT_TOOL", () => {
  test("sets the current tool name", () => {
    const state = makeState();
    const next = appReducer(state, { type: "SET_CURRENT_TOOL", name: "Read" });
    expect(next.currentTool).toBe("Read");
  });

  test("clears the current tool when undefined", () => {
    const state = makeState({ currentTool: "Bash" });
    const next = appReducer(state, { type: "SET_CURRENT_TOOL", name: undefined });
    expect(next.currentTool).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// FREEZE_ASSISTANT_MESSAGE
// ---------------------------------------------------------------------------

describe("FREEZE_ASSISTANT_MESSAGE", () => {
  test("adds assistant message with text and tool calls", () => {
    const state = makeState();
    const tcs = [makeToolCall({ id: "tc-1", status: "completed", result: "ok" })];
    const next = appReducer(state, {
      type: "FREEZE_ASSISTANT_MESSAGE",
      id: "msg-asst",
      text: "Here is the result",
      toolCalls: tcs,
    });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]!.role).toBe("assistant");
    expect(next.messages[0]!.content).toBe("Here is the result");
    expect(next.messages[0]!.toolCalls).toHaveLength(1);
  });

  test("skips when both text and toolCalls are empty", () => {
    const state = makeState();
    const next = appReducer(state, {
      type: "FREEZE_ASSISTANT_MESSAGE",
      id: "msg-empty",
      text: "",
      toolCalls: [],
    });
    expect(next.messages).toHaveLength(0);
  });

  test("includes message with only text", () => {
    const state = makeState();
    const next = appReducer(state, {
      type: "FREEZE_ASSISTANT_MESSAGE",
      id: "msg-text",
      text: "Just text",
      toolCalls: [],
    });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]!.toolCalls).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UPDATE_STATS / RESET_STATS
// ---------------------------------------------------------------------------

describe("UPDATE_STATS", () => {
  test("accumulates token counts and turns", () => {
    const state = makeState();
    const next = appReducer(state, {
      type: "UPDATE_STATS",
      tokensIn: 1200,
      tokensOut: 340,
      durationMs: 2300,
    });
    expect(next.stats.tokensIn).toBe(1200);
    expect(next.stats.tokensOut).toBe(340);
    expect(next.stats.turns).toBe(1);
    expect(next.stats.durationMs).toBe(2300);
  });

  test("accumulates across multiple turns", () => {
    const state = makeState({
      stats: { tokensIn: 1000, tokensOut: 200, turns: 2, durationMs: 5000 },
    });
    const next = appReducer(state, {
      type: "UPDATE_STATS",
      tokensIn: 500,
      tokensOut: 100,
      durationMs: 1000,
    });
    expect(next.stats.tokensIn).toBe(1500);
    expect(next.stats.tokensOut).toBe(300);
    expect(next.stats.turns).toBe(3);
    expect(next.stats.durationMs).toBe(6000);
  });
});

describe("RESET_STATS", () => {
  test("resets all stats to zero", () => {
    const state = makeState({
      stats: { tokensIn: 1000, tokensOut: 500, turns: 5, durationMs: 10000 },
    });
    const next = appReducer(state, { type: "RESET_STATS" });
    expect(next.stats.tokensIn).toBe(0);
    expect(next.stats.tokensOut).toBe(0);
    expect(next.stats.turns).toBe(0);
    expect(next.stats.durationMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SET_MODEL / SET_SESSION_SLUG
// ---------------------------------------------------------------------------

describe("SET_MODEL", () => {
  test("updates the model name", () => {
    const state = makeState({ model: "claude" });
    const next = appReducer(state, { type: "SET_MODEL", model: "gpt4" });
    expect(next.model).toBe("gpt4");
  });
});

describe("SET_SESSION_SLUG", () => {
  test("updates the session slug", () => {
    const state = makeState({ sessionSlug: "new" });
    const next = appReducer(state, { type: "SET_SESSION_SLUG", slug: "bold-nexus-001" });
    expect(next.sessionSlug).toBe("bold-nexus-001");
  });
});

// ---------------------------------------------------------------------------
// UPDATE_CONTEXT / CONTEXT_COMPACTED
// ---------------------------------------------------------------------------

describe("UPDATE_CONTEXT", () => {
  test("updates total token count", () => {
    const state = makeState();
    const next = appReducer(state, { type: "UPDATE_CONTEXT", totalTokens: 45000 });
    expect(next.context.totalTokens).toBe(45000);
  });
});

describe("CONTEXT_COMPACTED", () => {
  test("updates tokens and increments compaction count", () => {
    const state = makeState();
    const next = appReducer(state, { type: "CONTEXT_COMPACTED", before: 120000, after: 40000 });
    expect(next.context.totalTokens).toBe(40000);
    expect(next.context.compactionCount).toBe(1);
    expect(next.context.lastCompactedAt).toBeDefined();
  });

  test("accumulates compaction count", () => {
    const state = makeState();
    state.context.compactionCount = 2;
    const next = appReducer(state, { type: "CONTEXT_COMPACTED", before: 100000, after: 30000 });
    expect(next.context.compactionCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Sub-agent lifecycle
// ---------------------------------------------------------------------------

describe("SUB_AGENT_STARTED", () => {
  test("adds a new sub-agent to the map", () => {
    const state = makeState();
    const next = appReducer(state, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "child-1",
      parentSessionId: "parent-1",
      label: "Search for patterns",
      agentType: "research",
    });
    expect(next.subAgents.size).toBe(1);
    const agent = next.subAgents.get("child-1")!;
    expect(agent.phase).toBe("running");
    expect(agent.agentType).toBe("research");
    expect(agent.label).toBe("Search for patterns");
    expect(agent.toolCallCount).toBe(0);
    expect(agent.currentTool).toBeNull();
  });
});

describe("SUB_AGENT_TEXT_DELTA", () => {
  test("appends to stream preview", () => {
    const state = makeState();
    const agents = new Map();
    agents.set("child-1", {
      childSessionId: "child-1",
      parentSessionId: "p",
      label: "test",
      agentType: "research",
      phase: "running",
      currentTool: null,
      streamPreview: "Hello",
      toolCallCount: 0,
      startTime: Date.now(),
    });
    const withAgents = { ...state, subAgents: agents };
    const next = appReducer(withAgents, {
      type: "SUB_AGENT_TEXT_DELTA",
      childSessionId: "child-1",
      content: " world",
    });
    expect(next.subAgents.get("child-1")!.streamPreview).toBe("Hello world");
  });

  test("truncates preview at 120 chars", () => {
    const state = makeState();
    const agents = new Map();
    agents.set("child-1", {
      childSessionId: "child-1",
      parentSessionId: "p",
      label: "test",
      agentType: "research",
      phase: "running",
      currentTool: null,
      streamPreview: "a".repeat(115),
      toolCallCount: 0,
      startTime: Date.now(),
    });
    const withAgents = { ...state, subAgents: agents };
    const next = appReducer(withAgents, {
      type: "SUB_AGENT_TEXT_DELTA",
      childSessionId: "child-1",
      content: "b".repeat(20),
    });
    expect(next.subAgents.get("child-1")!.streamPreview.length).toBe(120);
  });

  test("ignores unknown child session", () => {
    const state = makeState();
    const next = appReducer(state, {
      type: "SUB_AGENT_TEXT_DELTA",
      childSessionId: "unknown",
      content: "text",
    });
    expect(next).toBe(state);
  });
});

describe("SUB_AGENT_TOOL_CALL", () => {
  test("sets current tool and increments count", () => {
    const state = makeState();
    const agents = new Map();
    agents.set("child-1", {
      childSessionId: "child-1",
      parentSessionId: "p",
      label: "test",
      agentType: "task",
      phase: "running",
      currentTool: null,
      streamPreview: "",
      toolCallCount: 2,
      startTime: Date.now(),
    });
    const withAgents = { ...state, subAgents: agents };
    const next = appReducer(withAgents, {
      type: "SUB_AGENT_TOOL_CALL",
      childSessionId: "child-1",
      toolName: "bash",
    });
    const agent = next.subAgents.get("child-1")!;
    expect(agent.currentTool).toBe("bash");
    expect(agent.toolCallCount).toBe(3);
  });
});

describe("SUB_AGENT_TOOL_RESULT", () => {
  test("clears current tool", () => {
    const state = makeState();
    const agents = new Map();
    agents.set("child-1", {
      childSessionId: "child-1",
      parentSessionId: "p",
      label: "test",
      agentType: "task",
      phase: "running",
      currentTool: "bash",
      streamPreview: "",
      toolCallCount: 3,
      startTime: Date.now(),
    });
    const withAgents = { ...state, subAgents: agents };
    const next = appReducer(withAgents, {
      type: "SUB_AGENT_TOOL_RESULT",
      childSessionId: "child-1",
      toolCallId: "tc-1",
      isError: false,
    });
    expect(next.subAgents.get("child-1")!.currentTool).toBeNull();
  });
});

describe("SUB_AGENT_COMPLETE", () => {
  test("marks agent as completed with success", () => {
    const state = makeState();
    const agents = new Map();
    agents.set("child-1", {
      childSessionId: "child-1",
      parentSessionId: "p",
      label: "test",
      agentType: "research",
      phase: "running",
      currentTool: "search",
      streamPreview: "Found patterns...",
      toolCallCount: 5,
      startTime: Date.now() - 5000,
    });
    const withAgents = { ...state, subAgents: agents };
    const next = appReducer(withAgents, {
      type: "SUB_AGENT_COMPLETE",
      childSessionId: "child-1",
      status: "success",
      durationMs: 5000,
    });
    const agent = next.subAgents.get("child-1")!;
    expect(agent.phase).toBe("completed");
    expect(agent.status).toBe("success");
    expect(agent.durationMs).toBe(5000);
    expect(agent.currentTool).toBeNull();
  });

  test("marks agent as error", () => {
    const state = makeState();
    const agents = new Map();
    agents.set("child-1", {
      childSessionId: "child-1",
      parentSessionId: "p",
      label: "test",
      agentType: "task",
      phase: "running",
      currentTool: null,
      streamPreview: "",
      toolCallCount: 1,
      startTime: Date.now(),
    });
    const withAgents = { ...state, subAgents: agents };
    const next = appReducer(withAgents, {
      type: "SUB_AGENT_COMPLETE",
      childSessionId: "child-1",
      status: "error",
      durationMs: 2000,
    });
    expect(next.subAgents.get("child-1")!.phase).toBe("error");
    expect(next.subAgents.get("child-1")!.status).toBe("error");
  });
});

describe("CLEAR_SUB_AGENTS", () => {
  test("empties the sub-agents map", () => {
    const state = makeState();
    const agents = new Map();
    agents.set("child-1", {
      childSessionId: "child-1",
      parentSessionId: "p",
      label: "test",
      agentType: "research",
      phase: "completed" as const,
      currentTool: null,
      streamPreview: "",
      toolCallCount: 0,
      startTime: Date.now(),
    });
    const withAgents = { ...state, subAgents: agents };
    const next = appReducer(withAgents, { type: "CLEAR_SUB_AGENTS" });
    expect(next.subAgents.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RESET_TURN (compound action)
// ---------------------------------------------------------------------------

describe("RESET_TURN", () => {
  test("resets phase, stream, tool calls, current tool, and sub-agents", () => {
    const agents = new Map();
    agents.set("child-1", {
      childSessionId: "child-1",
      parentSessionId: "p",
      label: "test",
      agentType: "research",
      phase: "running" as const,
      currentTool: null,
      streamPreview: "",
      toolCallCount: 0,
      startTime: Date.now(),
    });
    const state = makeState({
      phase: "streaming",
      streamText: "some text",
      liveToolCalls: [makeToolCall()],
      currentTool: "Read",
      subAgents: agents,
    });
    const next = appReducer(state, { type: "RESET_TURN" });
    expect(next.phase).toBe("idle");
    expect(next.streamText).toBe("");
    expect(next.liveToolCalls).toHaveLength(0);
    expect(next.currentTool).toBeUndefined();
    expect(next.subAgents.size).toBe(0);
  });

  test("preserves messages and stats", () => {
    const msg = makeMessage();
    const state = makeState({
      phase: "tool-executing",
      messages: [msg],
      stats: { tokensIn: 1000, tokensOut: 500, turns: 3, durationMs: 8000 },
    });
    const next = appReducer(state, { type: "RESET_TURN" });
    expect(next.messages).toHaveLength(1);
    expect(next.stats.tokensIn).toBe(1000);
    expect(next.stats.turns).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe("immutability", () => {
  test("reducer does not mutate the original state", () => {
    const state = makeState({ phase: "idle" });
    const messagesBefore = state.messages;
    const statsBefore = state.stats;

    appReducer(state, { type: "SET_PHASE", phase: "thinking" });
    appReducer(state, { type: "ADD_MESSAGE", message: makeMessage() });
    appReducer(state, { type: "UPDATE_STATS", tokensIn: 100, tokensOut: 50, durationMs: 1000 });

    expect(state.phase).toBe("idle");
    expect(state.messages).toBe(messagesBefore);
    expect(state.stats).toBe(statsBefore);
  });

  test("default case returns the same state reference", () => {
    const state = makeState();
    // @ts-expect-error — testing unknown action
    const next = appReducer(state, { type: "UNKNOWN_ACTION" });
    expect(next).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// createInitialState
// ---------------------------------------------------------------------------

describe("createInitialState", () => {
  test("creates state with defaults", () => {
    const state = createInitialState({});
    expect(state.phase).toBe("idle");
    expect(state.model).toBe("claude");
    expect(state.sessionSlug).toBe("new");
    expect(state.messages).toHaveLength(0);
    expect(state.subAgents.size).toBe(0);
  });

  test("respects provided options", () => {
    const state = createInitialState({ phase: "wizard", model: "gpt4", sessionSlug: "my-session" });
    expect(state.phase).toBe("wizard");
    expect(state.model).toBe("gpt4");
    expect(state.sessionSlug).toBe("my-session");
  });
});
