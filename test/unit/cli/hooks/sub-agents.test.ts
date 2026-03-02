/**
 * Tests for useSubAgents hook — derived state from sub-agent map.
 *
 * Tests the pure derivation function (no React needed) and agent type color mapping.
 */

import { describe, test, expect } from "bun:test";
import {
  deriveSubAgentState,
  getAgentTypeColor,
  AGENT_TYPE_COLORS,
} from "../../../../src/cli/hooks/useSubAgents.js";
import type { SubAgentState } from "../../../../src/cli/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<SubAgentState> = {}): SubAgentState {
  return {
    childSessionId: `child-${Math.random().toString(36).slice(2, 8)}`,
    parentSessionId: "parent-1",
    label: "Test task",
    agentType: "general",
    phase: "running",
    currentTool: null,
    streamPreview: "",
    toolCallCount: 0,
    startTime: Date.now(),
    ...overrides,
  };
}

function makeMap(...agents: SubAgentState[]): Map<string, SubAgentState> {
  const map = new Map<string, SubAgentState>();
  for (const agent of agents) {
    map.set(agent.childSessionId, agent);
  }
  return map;
}

// ---------------------------------------------------------------------------
// deriveSubAgentState — empty map
// ---------------------------------------------------------------------------

describe("deriveSubAgentState", () => {
  test("empty map returns zero counts", () => {
    const result = deriveSubAgentState(new Map());
    expect(result.sorted).toEqual([]);
    expect(result.runningCount).toBe(0);
    expect(result.completedCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.total).toBe(0);
    expect(result.hasRunning).toBe(false);
  });

  // ── Single agent ──────────────────────────────────────────────────

  test("single running agent", () => {
    const agent = makeAgent({ phase: "running" });
    const result = deriveSubAgentState(makeMap(agent));

    expect(result.sorted).toHaveLength(1);
    expect(result.runningCount).toBe(1);
    expect(result.completedCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.total).toBe(1);
    expect(result.hasRunning).toBe(true);
  });

  test("single completed agent", () => {
    const agent = makeAgent({ phase: "completed", status: "success", durationMs: 5000 });
    const result = deriveSubAgentState(makeMap(agent));

    expect(result.runningCount).toBe(0);
    expect(result.completedCount).toBe(1);
    expect(result.hasRunning).toBe(false);
  });

  test("single error agent", () => {
    const agent = makeAgent({ phase: "error", status: "error", durationMs: 1000 });
    const result = deriveSubAgentState(makeMap(agent));

    expect(result.errorCount).toBe(1);
    expect(result.hasRunning).toBe(false);
  });

  // ── Sorting ──────────────────────────────────────────────────

  test("sorts running before completed", () => {
    const completed = makeAgent({
      childSessionId: "a",
      phase: "completed",
      startTime: 1000,
    });
    const running = makeAgent({
      childSessionId: "b",
      phase: "running",
      startTime: 2000,
    });
    const result = deriveSubAgentState(makeMap(completed, running));

    expect(result.sorted[0].childSessionId).toBe("b"); // running first
    expect(result.sorted[1].childSessionId).toBe("a"); // completed second
  });

  test("sorts running before error", () => {
    const error = makeAgent({
      childSessionId: "err",
      phase: "error",
      startTime: 1000,
    });
    const running = makeAgent({
      childSessionId: "run",
      phase: "running",
      startTime: 2000,
    });
    const result = deriveSubAgentState(makeMap(error, running));

    expect(result.sorted[0].childSessionId).toBe("run");
    expect(result.sorted[1].childSessionId).toBe("err");
  });

  test("sorts completed before error", () => {
    const error = makeAgent({
      childSessionId: "err",
      phase: "error",
      startTime: 1000,
    });
    const completed = makeAgent({
      childSessionId: "done",
      phase: "completed",
      startTime: 2000,
    });
    const result = deriveSubAgentState(makeMap(error, completed));

    expect(result.sorted[0].childSessionId).toBe("done"); // completed first
    expect(result.sorted[1].childSessionId).toBe("err"); // error second
  });

  test("same-phase agents sorted by start time (oldest first)", () => {
    const newer = makeAgent({
      childSessionId: "newer",
      phase: "running",
      startTime: 2000,
    });
    const older = makeAgent({
      childSessionId: "older",
      phase: "running",
      startTime: 1000,
    });
    const result = deriveSubAgentState(makeMap(newer, older));

    expect(result.sorted[0].childSessionId).toBe("older");
    expect(result.sorted[1].childSessionId).toBe("newer");
  });

  // ── Mixed states ──────────────────────────────────────────────────

  test("mixed state counts", () => {
    const agents = makeMap(
      makeAgent({ childSessionId: "r1", phase: "running" }),
      makeAgent({ childSessionId: "r2", phase: "running" }),
      makeAgent({ childSessionId: "c1", phase: "completed" }),
      makeAgent({ childSessionId: "e1", phase: "error" }),
    );
    const result = deriveSubAgentState(agents);

    expect(result.runningCount).toBe(2);
    expect(result.completedCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.total).toBe(4);
    expect(result.hasRunning).toBe(true);
  });

  test("full sort order: running → completed → error", () => {
    const agents = makeMap(
      makeAgent({ childSessionId: "e1", phase: "error", startTime: 1 }),
      makeAgent({ childSessionId: "c1", phase: "completed", startTime: 2 }),
      makeAgent({ childSessionId: "r1", phase: "running", startTime: 3 }),
      makeAgent({ childSessionId: "c2", phase: "completed", startTime: 4 }),
      makeAgent({ childSessionId: "r2", phase: "running", startTime: 5 }),
    );
    const result = deriveSubAgentState(agents);

    const ids = result.sorted.map((a) => a.childSessionId);
    // Running first (by startTime), then completed (by startTime), then error
    expect(ids).toEqual(["r1", "r2", "c1", "c2", "e1"]);
  });

  // ── Sub-agent lifecycle through reducer actions ──────────────────

  test("lifecycle: started → text_delta → tool_call → complete", () => {
    // Phase 1: Agent starts
    const started = makeAgent({
      childSessionId: "lifecycle",
      phase: "running",
      agentType: "research",
      label: "Find authentication patterns",
      toolCallCount: 0,
      streamPreview: "",
    });
    let map = makeMap(started);
    let result = deriveSubAgentState(map);
    expect(result.runningCount).toBe(1);
    expect(result.sorted[0].agentType).toBe("research");

    // Phase 2: Text deltas arrive
    const withPreview = { ...started, streamPreview: "Found 12 files with auth" };
    map = makeMap(withPreview);
    result = deriveSubAgentState(map);
    expect(result.sorted[0].streamPreview).toBe("Found 12 files with auth");

    // Phase 3: Tool call happens
    const withTool = { ...withPreview, currentTool: "search_files", toolCallCount: 1 };
    map = makeMap(withTool);
    result = deriveSubAgentState(map);
    expect(result.sorted[0].currentTool).toBe("search_files");
    expect(result.sorted[0].toolCallCount).toBe(1);

    // Phase 4: More tool calls
    const moreCalls = { ...withTool, currentTool: "read_file", toolCallCount: 3 };
    map = makeMap(moreCalls);
    result = deriveSubAgentState(map);
    expect(result.sorted[0].toolCallCount).toBe(3);

    // Phase 5: Agent completes
    const completed = {
      ...moreCalls,
      phase: "completed" as const,
      status: "success" as const,
      durationMs: 8200,
      currentTool: null,
    };
    map = makeMap(completed);
    result = deriveSubAgentState(map);
    expect(result.runningCount).toBe(0);
    expect(result.completedCount).toBe(1);
    expect(result.sorted[0].durationMs).toBe(8200);
    expect(result.sorted[0].status).toBe("success");
  });

  // ── Parallel fan-out scenario ──────────────────────────────────

  test("parallel fan-out: multiple agents complete independently", () => {
    const research = makeAgent({
      childSessionId: "research-1",
      agentType: "research",
      phase: "completed",
      toolCallCount: 5,
      durationMs: 4600,
      startTime: 1,
    });
    const task = makeAgent({
      childSessionId: "task-1",
      agentType: "task",
      phase: "running",
      toolCallCount: 3,
      currentTool: "write_file",
      startTime: 2,
    });
    const explore = makeAgent({
      childSessionId: "explore-1",
      agentType: "explore",
      phase: "error",
      toolCallCount: 1,
      durationMs: 1200,
      startTime: 3,
    });

    const result = deriveSubAgentState(makeMap(research, task, explore));

    // Running first, then completed, then error
    expect(result.sorted[0].childSessionId).toBe("task-1");
    expect(result.sorted[1].childSessionId).toBe("research-1");
    expect(result.sorted[2].childSessionId).toBe("explore-1");
    expect(result.runningCount).toBe(1);
    expect(result.completedCount).toBe(1);
    expect(result.errorCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getAgentTypeColor
// ---------------------------------------------------------------------------

describe("getAgentTypeColor", () => {
  test("returns correct colors for known agent types", () => {
    expect(getAgentTypeColor("general")).toBe("text");
    expect(getAgentTypeColor("research")).toBe("cyan");
    expect(getAgentTypeColor("task")).toBe("green");
    expect(getAgentTypeColor("explore")).toBe("blue");
    expect(getAgentTypeColor("plan")).toBe("purple");
  });

  test("returns 'text' (general) for unknown agent types", () => {
    expect(getAgentTypeColor("custom")).toBe("text");
    expect(getAgentTypeColor("")).toBe("text");
    expect(getAgentTypeColor("nonexistent")).toBe("text");
  });
});

// ---------------------------------------------------------------------------
// AGENT_TYPE_COLORS constant
// ---------------------------------------------------------------------------

describe("AGENT_TYPE_COLORS", () => {
  test("has entries for all standard agent types", () => {
    expect(AGENT_TYPE_COLORS).toHaveProperty("general");
    expect(AGENT_TYPE_COLORS).toHaveProperty("research");
    expect(AGENT_TYPE_COLORS).toHaveProperty("task");
    expect(AGENT_TYPE_COLORS).toHaveProperty("explore");
    expect(AGENT_TYPE_COLORS).toHaveProperty("plan");
  });

  test("all values are non-empty strings", () => {
    for (const [, color] of Object.entries(AGENT_TYPE_COLORS)) {
      expect(typeof color).toBe("string");
      expect(color.length).toBeGreaterThan(0);
    }
  });
});
