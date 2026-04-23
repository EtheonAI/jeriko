// Tests for fork-mode prompt construction — the byte-identical-prefix
// optimization that lets the child's API request reuse the parent's
// prompt cache entry.

import { describe, it, expect } from "bun:test";
import { buildForkPrompt } from "../../../src/daemon/agent/subagent/fork.js";
import type { DriverMessage } from "../../../src/daemon/agent/drivers/index.js";

describe("buildForkPrompt", () => {
  it("inherits the supplied system prompt byte-for-byte", () => {
    const systemPrompt = "You are the parent. Your cache key depends on this string.";
    const result = buildForkPrompt({
      childPrompt: "do the task",
      systemPrompt,
      parentMessages: [],
    });
    expect(result.systemPrompt).toBe(systemPrompt);
  });

  it("appends the child prompt wrapped in the fork directive", () => {
    const result = buildForkPrompt({
      childPrompt: "analyze the logs",
      systemPrompt: "x",
      parentMessages: [],
    });
    expect(result.history).toHaveLength(1);
    const last = result.history[0]!;
    expect(last.role).toBe("user");
    expect(String(last.content)).toContain("FORK SUBAGENT TASK");
    expect(String(last.content)).toContain("analyze the logs");
  });

  it("clones parent messages (non-system) into the history", () => {
    const parent: DriverMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    const result = buildForkPrompt({
      childPrompt: "continue",
      systemPrompt: undefined,
      parentMessages: parent,
    });
    expect(result.history.length).toBe(3); // 2 parent + child user turn
    expect(result.history[0]!.role).toBe("user");
    expect(result.history[0]!.content).toBe("hello");
    expect(result.history[1]!.role).toBe("assistant");
  });

  it("deep-clones parent messages so later mutations don't leak", () => {
    const parent: DriverMessage[] = [{ role: "user", content: "original" }];
    const result = buildForkPrompt({
      childPrompt: "x",
      systemPrompt: undefined,
      parentMessages: parent,
    });
    // Mutate the source — the fork's copy must not change.
    parent[0]!.content = "mutated";
    expect(result.history[0]!.content).toBe("original");
  });

  it("produces empty parent-message prefix when none provided and no active context", () => {
    const result = buildForkPrompt({
      childPrompt: "solo",
      systemPrompt: "s",
      parentMessages: [],
    });
    expect(result.history).toHaveLength(1);
  });
});
