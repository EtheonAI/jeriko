/**
 * SubAgent component tests — verifies tree rendering, static views,
 * and helper functions for sub-agent display.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { SubAgentList, SubAgentView, LiveSubAgent } from "../../../../src/cli/components/SubAgent.js";
import type { SubAgentState, DisplayToolCall } from "../../../../src/cli/types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<SubAgentState> = {}): SubAgentState {
  return {
    childSessionId: "child-1",
    parentSessionId: "parent-1",
    label: "Test Agent",
    agentType: "research",
    phase: "running",
    currentTool: "search_files",
    streamPreview: "",
    toolCallCount: 3,
    startTime: Date.now() - 5000,
    ...overrides,
  };
}

function makeToolCall(overrides: Partial<DisplayToolCall> = {}): DisplayToolCall {
  return {
    id: "tc-1",
    name: "delegate",
    args: { agent_type: "research", prompt: "Search for auth patterns" },
    status: "completed",
    startTime: Date.now() - 5000,
    durationMs: 5000,
    result: JSON.stringify({
      ok: true,
      context: { toolCalls: [1, 2, 3] },
      tokensIn: 1500,
      tokensOut: 500,
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SubAgentList — tree view
// ---------------------------------------------------------------------------

describe("SubAgentList", () => {
  test("renders nothing when empty", () => {
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents: [] }),
    );
    expect(lastFrame()).toBe("");
  });

  test("renders orchestrator header", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    const frame = lastFrame();
    expect(frame).toContain("Orchestrating");
  });

  test("renders agent type label", () => {
    const agents = [makeAgent({ agentType: "research" })];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    expect(lastFrame()).toContain("Research");
  });

  test("renders tree connector for last agent", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    // Last agent should use └── connector
    expect(lastFrame()).toContain("└──");
  });

  test("renders branch connector for non-last agents", () => {
    const agents = [
      makeAgent({ childSessionId: "c1", agentType: "research" }),
      makeAgent({ childSessionId: "c2", agentType: "explore" }),
    ];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    // First agent should use ├── connector
    expect(lastFrame()).toContain("├──");
    expect(lastFrame()).toContain("└──");
  });

  test("renders agent count in header", () => {
    const agents = [
      makeAgent({ childSessionId: "c1" }),
      makeAgent({ childSessionId: "c2" }),
      makeAgent({ childSessionId: "c3" }),
    ];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    expect(lastFrame()).toContain("3/3 agents");
  });

  test("renders mixed running/completed counts", () => {
    const agents = [
      makeAgent({ childSessionId: "c1", phase: "running" }),
      makeAgent({ childSessionId: "c2", phase: "completed" }),
    ];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    expect(lastFrame()).toContain("1/2 agents");
  });

  test("renders tool call count", () => {
    const agents = [makeAgent({ toolCallCount: 7 })];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    expect(lastFrame()).toContain("7 calls");
  });

  test("renders completed agent with check mark", () => {
    const agents = [makeAgent({ phase: "completed", durationMs: 3000 })];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    expect(lastFrame()).toContain("✓");
    expect(lastFrame()).toContain("done");
  });

  test("renders failed agent with cross mark", () => {
    const agents = [makeAgent({ phase: "error", durationMs: 1000 })];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    expect(lastFrame()).toContain("✗");
    expect(lastFrame()).toContain("failed");
  });

  test("renders current tool for running agent", () => {
    const agents = [makeAgent({ currentTool: "read_file" })];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    expect(lastFrame()).toContain("read_file");
  });

  test("renders 'working' when no current tool", () => {
    const agents = [makeAgent({ currentTool: null })];
    const { lastFrame } = render(
      React.createElement(SubAgentList, { agents }),
    );
    expect(lastFrame()).toContain("working");
  });
});

// ---------------------------------------------------------------------------
// LiveSubAgent — single agent view
// ---------------------------------------------------------------------------

describe("LiveSubAgent", () => {
  test("renders agent type and tool", () => {
    const agent = makeAgent({ agentType: "explore", currentTool: "grep" });
    const { lastFrame } = render(
      React.createElement(LiveSubAgent, { agent }),
    );
    const frame = lastFrame();
    expect(frame).toContain("Explore");
    expect(frame).toContain("grep");
  });

  test("renders tool call count", () => {
    const agent = makeAgent({ toolCallCount: 12 });
    const { lastFrame } = render(
      React.createElement(LiveSubAgent, { agent }),
    );
    expect(lastFrame()).toContain("12 calls");
  });
});

// ---------------------------------------------------------------------------
// SubAgentView — static display from DisplayToolCall
// ---------------------------------------------------------------------------

describe("SubAgentView", () => {
  test("renders delegate tool call", () => {
    const tc = makeToolCall();
    const { lastFrame } = render(
      React.createElement(SubAgentView, { toolCall: tc }),
    );
    const frame = lastFrame();
    expect(frame).toContain("Research");
    expect(frame).toContain("Search for auth patterns");
  });

  test("renders delegate result summary", () => {
    const tc = makeToolCall();
    const { lastFrame } = render(
      React.createElement(SubAgentView, { toolCall: tc }),
    );
    const frame = lastFrame();
    expect(frame).toContain("Done");
    expect(frame).toContain("3 tool calls");
  });

  test("renders parallel tool call", () => {
    const tc = makeToolCall({
      name: "parallel_tasks",
      args: {
        tasks: [
          { label: "search", agent_type: "research", prompt: "find files" },
          { label: "review", agent_type: "task", prompt: "review code" },
        ],
      },
      result: JSON.stringify({
        ok: true,
        results: [
          { label: "search", status: "success", agentType: "research", tokensIn: 100, tokensOut: 50, durationMs: 2000, context: { toolCalls: [1, 2] } },
          { label: "review", status: "success", agentType: "task", tokensIn: 200, tokensOut: 100, durationMs: 3000, context: { toolCalls: [1] } },
        ],
      }),
    });
    const { lastFrame } = render(
      React.createElement(SubAgentView, { toolCall: tc }),
    );
    const frame = lastFrame();
    expect(frame).toContain("Parallel");
    expect(frame).toContain("2 tasks");
    expect(frame).toContain("Research");
    expect(frame).toContain("Task");
  });

  test("renders parallel with tree connectors", () => {
    const tc = makeToolCall({
      name: "parallel_tasks",
      args: { tasks: [{ a: 1 }, { a: 2 }] },
      result: JSON.stringify({
        ok: true,
        results: [
          { label: "a", status: "success", agentType: "research", tokensIn: 100, tokensOut: 50, durationMs: 1000, context: { toolCalls: [1] } },
          { label: "b", status: "error", agentType: "task", tokensIn: 50, tokensOut: 25, durationMs: 500, context: { toolCalls: [] } },
        ],
      }),
    });
    const { lastFrame } = render(
      React.createElement(SubAgentView, { toolCall: tc }),
    );
    const frame = lastFrame();
    expect(frame).toContain("├──");
    expect(frame).toContain("└──");
    expect(frame).toContain("✓");
    expect(frame).toContain("✗");
  });

  test("renders delegate error", () => {
    const tc = makeToolCall({
      result: JSON.stringify({ ok: false, error: "Model timed out" }),
    });
    const { lastFrame } = render(
      React.createElement(SubAgentView, { toolCall: tc }),
    );
    expect(lastFrame()).toContain("Model timed out");
  });

  test("renders running delegate without result", () => {
    const tc = makeToolCall({
      status: "running",
      result: undefined,
    });
    const { lastFrame } = render(
      React.createElement(SubAgentView, { toolCall: tc }),
    );
    const frame = lastFrame();
    expect(frame).toContain("Research");
    expect(frame).toContain("Search for auth patterns");
    // No result line
    expect(frame).not.toContain("Done");
  });

  test("truncates long prompts", () => {
    const longPrompt = "A".repeat(100);
    const tc = makeToolCall({
      args: { agent_type: "research", prompt: longPrompt },
    });
    const { lastFrame } = render(
      React.createElement(SubAgentView, { toolCall: tc }),
    );
    expect(lastFrame()).toContain("…");
  });
});
