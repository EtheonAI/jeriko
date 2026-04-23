// Hook matcher tests — pure functions, verify the filter semantics.

import { describe, it, expect } from "bun:test";
import { matchHooks } from "../../../src/daemon/services/hooks/matcher.js";
import type { HookConfigEntry, HookPayload } from "../../../src/daemon/services/hooks/types.js";

const entries: HookConfigEntry[] = [
  { event: "pre_tool_use", command: "echo any" },
  { event: "pre_tool_use", command: "echo bash-only", matcher: { tool: "bash" } },
  { event: "pre_tool_use", command: "echo rm-pattern", matcher: { tool: "bash", argumentsPattern: "rm\\s+-rf" } },
  { event: "post_tool_use", command: "echo post" },
];

function pre(toolName: string, args: Record<string, unknown>): HookPayload {
  return {
    event: "pre_tool_use",
    sessionId: "s1",
    toolName,
    toolCallId: "tc1",
    arguments: args,
  };
}

describe("matchHooks", () => {
  it("returns only matching events", () => {
    const matched = matchHooks(entries, "session_start", pre("bash", {}));
    expect(matched).toHaveLength(0);
  });

  it("tool-less matcher fires for every pre_tool_use", () => {
    const matched = matchHooks(entries, "pre_tool_use", pre("read_file", {}));
    expect(matched.map((e) => e.command)).toContain("echo any");
    expect(matched.map((e) => e.command)).not.toContain("echo bash-only");
  });

  it("tool-scoped matcher fires only when the name matches", () => {
    const matched = matchHooks(entries, "pre_tool_use", pre("bash", { cmd: "ls" }));
    expect(matched.map((e) => e.command)).toContain("echo bash-only");
    expect(matched.map((e) => e.command)).not.toContain("echo rm-pattern");
  });

  it("argumentsPattern narrows further", () => {
    const matched = matchHooks(entries, "pre_tool_use", pre("bash", { cmd: "rm -rf /" }));
    expect(matched.map((e) => e.command)).toContain("echo rm-pattern");
  });

  it("invalid regex is treated as non-match (no crash)", () => {
    const badEntries: HookConfigEntry[] = [
      {
        event: "pre_tool_use",
        command: "echo broken",
        matcher: { argumentsPattern: "(" },
      },
    ];
    const matched = matchHooks(badEntries, "pre_tool_use", pre("bash", { cmd: "ls" }));
    expect(matched).toHaveLength(0);
  });
});
