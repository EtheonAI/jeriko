// Tests for the default cache-breakpoint strategy. Pure functions — no DB,
// no network. We verify marker placement under the documented rules.

import { describe, it, expect } from "bun:test";
import { defaultCacheStrategy } from "../../../src/daemon/agent/cache/strategy.js";
import {
  ANTHROPIC_MAX_CACHE_BREAKPOINTS,
  type StrategyInput,
} from "../../../src/daemon/agent/cache/types.js";
import type { AnthropicMessage, AnthropicToolDef } from "../../../src/daemon/agent/drivers/anthropic-shared.js";

function input(partial: Partial<StrategyInput> = {}): StrategyInput {
  return {
    system: "You are a helpful assistant.".repeat(50), // > 512 chars
    tools: undefined,
    messages: [],
    maxBreakpoints: ANTHROPIC_MAX_CACHE_BREAKPOINTS,
    ...partial,
  };
}

function bigTool(name: string): AnthropicToolDef {
  return {
    name,
    description: "x".repeat(200),
    input_schema: { type: "object", properties: { a: { type: "string", description: "y".repeat(200) } } },
  };
}

describe("defaultCacheStrategy", () => {
  it("returns no markers when system is too short and there are no tools or messages", () => {
    const result = defaultCacheStrategy.compute(input({ system: "hi" }));
    expect(result).toEqual([]);
  });

  it("caches system when it is long enough", () => {
    const result = defaultCacheStrategy.compute(input());
    expect(result.some((m) => m.position.kind === "end_of_system")).toBe(true);
  });

  it("caches tools when their combined schema is sizeable", () => {
    const result = defaultCacheStrategy.compute(
      input({ tools: [bigTool("a"), bigTool("b")] }),
    );
    expect(result.some((m) => m.position.kind === "end_of_tools")).toBe(true);
  });

  it("skips tools when the combined schema is tiny", () => {
    const tiny: AnthropicToolDef = { name: "x", description: "y", input_schema: {} };
    const result = defaultCacheStrategy.compute(input({ tools: [tiny] }));
    expect(result.some((m) => m.position.kind === "end_of_tools")).toBe(false);
  });

  it("places a message marker on the last stable assistant turn", () => {
    const messages: AnthropicMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "do a thing" },
    ];
    const result = defaultCacheStrategy.compute(input({ messages }));
    const mm = result.find((m) => m.position.kind === "end_of_message");
    expect(mm).toBeDefined();
    if (mm && mm.position.kind === "end_of_message") {
      expect(mm.position.messageIndex).toBe(1); // the assistant turn
    }
  });

  it("skips message marker when the last assistant turn has a pending tool_use", () => {
    const messages: AnthropicMessage[] = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "looking..." },
          { type: "tool_use", id: "t1", name: "bash", input: {} },
        ],
      },
      // no tool_result yet
    ];
    const result = defaultCacheStrategy.compute(input({ messages }));
    expect(result.some((m) => m.position.kind === "end_of_message")).toBe(false);
  });

  it("respects maxBreakpoints cap", () => {
    const messages: AnthropicMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const result = defaultCacheStrategy.compute(
      input({ maxBreakpoints: 1, tools: [bigTool("a")], messages }),
    );
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("returns zero markers when maxBreakpoints is 0", () => {
    const result = defaultCacheStrategy.compute(
      input({ maxBreakpoints: 0, tools: [bigTool("a")] }),
    );
    expect(result).toEqual([]);
  });
});
