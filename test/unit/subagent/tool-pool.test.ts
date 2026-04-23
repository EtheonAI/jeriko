// Tests for per-agent tool pool assembly.
//
// Uses a dedicated set of mock tools registered/cleared per test, so the
// tool-registry state from other test files can't bleed into assertions.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  clearTools,
  registerTool,
  type ToolDefinition,
} from "../../../src/daemon/agent/tools/registry.js";

const TOOL_IDS = [
  "bash",
  "read_file",
  "write_file",
  "edit_file",
  "list_files",
  "search_files",
  "web_search",
  "browser",
  "use_skill",
  "delegate",
  "parallel_tasks",
  "camera",
  "screenshot",
  "connector",
] as const;

function mockTool(id: string): ToolDefinition {
  return {
    id,
    name: id,
    description: `mock tool ${id}`,
    parameters: { type: "object", properties: {} },
    execute: async () => "ok",
  };
}

beforeEach(() => {
  clearTools();
  for (const id of TOOL_IDS) registerTool(mockTool(id));
});

afterEach(() => {
  clearTools();
});

import { assembleToolPoolForAgent } from "../../../src/daemon/agent/subagent/tool-pool.js";
import { MAX_DEPTH } from "../../../src/daemon/agent/orchestrator.js";

describe("assembleToolPoolForAgent", () => {
  it("general agent at depth 1 sees all non-internal tools", () => {
    const result = assembleToolPoolForAgent({ agentType: "general", childDepth: 1 });
    expect(result.toolIds).toContain("bash");
    expect(result.toolIds).toContain("read_file");
    expect(result.toolIds).toContain("delegate");
  });

  it("research agent is restricted to read-only + web tools", () => {
    const result = assembleToolPoolForAgent({ agentType: "research", childDepth: 1 });
    expect(result.toolIds).toContain("read_file");
    expect(result.toolIds).toContain("list_files");
    expect(result.toolIds).toContain("search_files");
    expect(result.toolIds).toContain("web_search");
    expect(result.toolIds).not.toContain("bash");
    expect(result.toolIds).not.toContain("write_file");
    expect(result.toolIds).not.toContain("edit_file");
  });

  it("explore agent is read-only (no bash, no web)", () => {
    const result = assembleToolPoolForAgent({ agentType: "explore", childDepth: 1 });
    expect(result.toolIds).toContain("read_file");
    expect(result.toolIds).toContain("list_files");
    expect(result.toolIds).not.toContain("bash");
    expect(result.toolIds).not.toContain("web_search");
    expect(result.toolIds).not.toContain("delegate");
  });

  it("orchestrator tools are stripped at MAX_DEPTH", () => {
    const atMax = assembleToolPoolForAgent({ agentType: "general", childDepth: MAX_DEPTH });
    expect(atMax.toolIds).not.toContain("delegate");
    expect(atMax.toolIds).not.toContain("parallel_tasks");
  });

  it("explicit tool list overrides agent preset", () => {
    const result = assembleToolPoolForAgent({
      agentType: "research",
      childDepth: 1,
      explicitToolIds: ["bash", "read_file"],
    });
    expect(result.toolIds).toEqual(expect.arrayContaining(["bash", "read_file"]));
    expect(result.toolIds).not.toContain("web_search");
  });

  it("disallowedToolIds subtracts after the preset is applied", () => {
    const result = assembleToolPoolForAgent({
      agentType: "task",
      childDepth: 1,
      disallowedToolIds: ["bash"],
    });
    expect(result.toolIds).not.toContain("bash");
    expect(result.toolIds).toContain("read_file");
  });

  it("an unknown tool in the preset is gracefully skipped", () => {
    // `task` preset includes "generate_image" (not registered here) — make sure
    // we don't crash and only return tools that actually exist.
    const result = assembleToolPoolForAgent({ agentType: "task", childDepth: 1 });
    expect(result.tools.every((t) => TOOL_IDS.includes(t.id as typeof TOOL_IDS[number]))).toBe(true);
  });
});
