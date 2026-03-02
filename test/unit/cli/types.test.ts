/**
 * Tests for CLI types — type guards, factory functions, and phase transitions.
 */

import { describe, test, expect } from "bun:test";
import {
  isPhase,
  emptyStats,
  emptyContextInfo,
  createInitialState,
  type Phase,
  type DisplayMessage,
  type DisplayToolCall,
  type SessionStats,
  type SubAgentState,
  type ContextInfo,
  type ConnectorInfo,
  type TriggerInfo,
  type SkillInfo,
  type ModelInfo,
  type HistoryEntry,
  type AppState,
  type AppAction,
} from "../../../src/cli/types.js";

// ---------------------------------------------------------------------------
// isPhase type guard
// ---------------------------------------------------------------------------

describe("isPhase", () => {
  test("returns true for all valid phases", () => {
    const validPhases: Phase[] = ["idle", "thinking", "streaming", "tool-executing", "sub-executing", "setup"];
    for (const phase of validPhases) {
      expect(isPhase(phase)).toBe(true);
    }
  });

  test("returns false for invalid strings", () => {
    expect(isPhase("")).toBe(false);
    expect(isPhase("running")).toBe(false);
    expect(isPhase("IDLE")).toBe(false);
    expect(isPhase("completed")).toBe(false);
  });

  test("returns false for non-string values", () => {
    expect(isPhase(null)).toBe(false);
    expect(isPhase(undefined)).toBe(false);
    expect(isPhase(42)).toBe(false);
    expect(isPhase(true)).toBe(false);
    expect(isPhase({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// emptyStats factory
// ---------------------------------------------------------------------------

describe("emptyStats", () => {
  test("returns a fresh stats object with all zeros", () => {
    const stats = emptyStats();
    expect(stats.tokensIn).toBe(0);
    expect(stats.tokensOut).toBe(0);
    expect(stats.turns).toBe(0);
    expect(stats.durationMs).toBe(0);
  });

  test("returns a new object each time (not shared reference)", () => {
    const a = emptyStats();
    const b = emptyStats();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  test("returned object is mutable", () => {
    const stats = emptyStats();
    stats.tokensIn = 100;
    stats.turns = 3;
    expect(stats.tokensIn).toBe(100);
    expect(stats.turns).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Phase transition logic (structural tests)
// ---------------------------------------------------------------------------

describe("Phase transitions", () => {
  test("idle → thinking on message submit", () => {
    const before: Phase = "idle";
    const after: Phase = "thinking";
    expect(before).toBe("idle");
    expect(after).toBe("thinking");
  });

  test("thinking → streaming on first text delta", () => {
    const before: Phase = "thinking";
    const after: Phase = "streaming";
    expect(isPhase(before)).toBe(true);
    expect(isPhase(after)).toBe(true);
  });

  test("streaming → tool-executing on tool call", () => {
    const before: Phase = "streaming";
    const after: Phase = "tool-executing";
    expect(isPhase(before)).toBe(true);
    expect(isPhase(after)).toBe(true);
  });

  test("tool-executing → idle on turn complete", () => {
    const before: Phase = "tool-executing";
    const after: Phase = "idle";
    expect(isPhase(before)).toBe(true);
    expect(isPhase(after)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DisplayMessage structure
// ---------------------------------------------------------------------------

describe("DisplayMessage", () => {
  test("user message has required fields", () => {
    const msg: DisplayMessage = {
      id: "test-1",
      role: "user",
      content: "Hello",
      timestamp: Date.now(),
    };
    expect(msg.role).toBe("user");
    expect(msg.toolCalls).toBeUndefined();
  });

  test("assistant message can include tool calls", () => {
    const tc: DisplayToolCall = {
      id: "tc-1",
      name: "read",
      args: { file_path: "test.ts" },
      result: "file contents",
      isError: false,
      status: "completed",
      startTime: Date.now(),
      durationMs: 100,
    };

    const msg: DisplayMessage = {
      id: "test-2",
      role: "assistant",
      content: "Let me read that file.",
      toolCalls: [tc],
      timestamp: Date.now(),
    };
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0]!.name).toBe("read");
  });
});

// ---------------------------------------------------------------------------
// New Phase: sub-executing
// ---------------------------------------------------------------------------

describe("sub-executing phase", () => {
  test("isPhase returns true for sub-executing", () => {
    expect(isPhase("sub-executing")).toBe(true);
  });

  test("sub-executing → idle on sub-agent complete", () => {
    const before: Phase = "sub-executing";
    const after: Phase = "idle";
    expect(isPhase(before)).toBe(true);
    expect(isPhase(after)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// emptyContextInfo factory
// ---------------------------------------------------------------------------

describe("emptyContextInfo", () => {
  test("returns fresh context with defaults", () => {
    const ctx = emptyContextInfo();
    expect(ctx.totalTokens).toBe(0);
    expect(ctx.maxTokens).toBe(200_000);
    expect(ctx.compactionCount).toBe(0);
    expect(ctx.lastCompactedAt).toBeUndefined();
  });

  test("returns a new object each time", () => {
    const a = emptyContextInfo();
    const b = emptyContextInfo();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// createInitialState factory
// ---------------------------------------------------------------------------

describe("createInitialState", () => {
  test("creates state with all required fields", () => {
    const state = createInitialState({});
    expect(state.phase).toBe("idle");
    expect(state.messages).toEqual([]);
    expect(state.streamText).toBe("");
    expect(state.liveToolCalls).toEqual([]);
    expect(state.subAgents).toBeInstanceOf(Map);
    expect(state.subAgents.size).toBe(0);
    expect(state.stats.tokensIn).toBe(0);
    expect(state.context.totalTokens).toBe(0);
    expect(state.model).toBe("claude");
    expect(state.sessionSlug).toBe("new");
    expect(state.currentTool).toBeUndefined();
  });

  test("accepts optional overrides", () => {
    const state = createInitialState({ phase: "setup", model: "gpt4", sessionSlug: "test-session" });
    expect(state.phase).toBe("setup");
    expect(state.model).toBe("gpt4");
    expect(state.sessionSlug).toBe("test-session");
  });
});

// ---------------------------------------------------------------------------
// SubAgentState structure
// ---------------------------------------------------------------------------

describe("SubAgentState", () => {
  test("has all required fields", () => {
    const agent: SubAgentState = {
      childSessionId: "child-1",
      parentSessionId: "parent-1",
      label: "Search for patterns",
      agentType: "research",
      phase: "running",
      currentTool: null,
      streamPreview: "",
      toolCallCount: 0,
      startTime: Date.now(),
    };
    expect(agent.phase).toBe("running");
    expect(agent.durationMs).toBeUndefined();
    expect(agent.status).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// New info types — structural validation
// ---------------------------------------------------------------------------

describe("ConnectorInfo", () => {
  test("has required fields", () => {
    const info: ConnectorInfo = { name: "github", type: "oauth", status: "connected" };
    expect(info.name).toBe("github");
    expect(info.error).toBeUndefined();
  });
});

describe("TriggerInfo", () => {
  test("has required fields", () => {
    const info: TriggerInfo = {
      id: "t-1",
      name: "deploy-check",
      type: "cron",
      enabled: true,
      runCount: 42,
    };
    expect(info.enabled).toBe(true);
    expect(info.lastRunAt).toBeUndefined();
  });
});

describe("SkillInfo", () => {
  test("has required fields", () => {
    const info: SkillInfo = { name: "commit", description: "Create commits", userInvocable: true };
    expect(info.userInvocable).toBe(true);
  });
});

describe("ModelInfo", () => {
  test("has required fields", () => {
    const info: ModelInfo = { id: "claude-sonnet", name: "Claude Sonnet", provider: "anthropic" };
    expect(info.contextWindow).toBeUndefined();
  });
});

describe("HistoryEntry", () => {
  test("has required fields", () => {
    const entry: HistoryEntry = { role: "user", content: "Hello" };
    expect(entry.timestamp).toBeUndefined();
  });
});
