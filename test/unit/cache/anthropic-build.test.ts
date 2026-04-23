// Tests for the cache-aware Anthropic request builder. Verifies end-to-end
// that a typical agent request emerges with cache_control markers in the
// expected places.

import { describe, it, expect } from "bun:test";
import { buildCachedAnthropicRequest } from "../../../src/daemon/agent/cache/anthropic-build.js";
import type { DriverMessage, DriverConfig } from "../../../src/daemon/agent/drivers/index.js";

function config(overrides: Partial<DriverConfig> = {}): DriverConfig {
  return {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    temperature: 0.3,
    system_prompt: "You are Jeriko, a Unix-first AI agent.".repeat(40),
    tools: [
      {
        name: "bash",
        description: "execute a shell command".repeat(30),
        parameters: { type: "object", properties: { cmd: { type: "string" } } },
      },
      {
        name: "read_file",
        description: "read a file".repeat(30),
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    ],
    ...overrides,
  };
}

describe("buildCachedAnthropicRequest", () => {
  it("adds cache_control to the last tool when tools are large enough", () => {
    const messages: DriverMessage[] = [{ role: "user", content: "hi" }];
    const { body } = buildCachedAnthropicRequest({ messages, config: config() });

    const tools = body.tools as Array<{ name: string; cache_control?: unknown }>;
    expect(tools.at(-1)?.cache_control).toEqual({ type: "ephemeral" });
    expect(tools[0]?.cache_control).toBeUndefined();
  });

  it("converts system to block form with cache_control", () => {
    const messages: DriverMessage[] = [{ role: "user", content: "hi" }];
    const { body } = buildCachedAnthropicRequest({ messages, config: config() });

    expect(Array.isArray(body.system)).toBe(true);
    const blocks = body.system as Array<{ type: string; cache_control?: unknown }>;
    expect(blocks.at(-1)?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("leaves raw-string system when caching is disabled (maxBreakpoints=0)", () => {
    const messages: DriverMessage[] = [{ role: "user", content: "hi" }];
    const { body } = buildCachedAnthropicRequest({
      messages,
      config: config(),
      maxBreakpoints: 0,
    });
    expect(typeof body.system).toBe("string");
    const tools = body.tools as Array<{ cache_control?: unknown }>;
    expect(tools.every((t) => t.cache_control === undefined)).toBe(true);
  });

  it("marks the prior assistant turn as a cache boundary", () => {
    const messages: DriverMessage[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "first response" },
      { role: "user", content: "second" },
    ];
    const { body, markers } = buildCachedAnthropicRequest({ messages, config: config() });
    expect(markers.some((m) => m.position.kind === "end_of_message")).toBe(true);

    const converted = body.messages as Array<{
      role: string;
      content: string | Array<{ type: string; text?: string; cache_control?: unknown }>;
    }>;
    const assistant = converted.find((m) => m.role === "assistant")!;
    // Block-promoted to carry cache_control.
    expect(Array.isArray(assistant.content)).toBe(true);
    const blocks = assistant.content as Array<{ cache_control?: unknown }>;
    expect(blocks[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("is idempotent — same inputs yield the same marker set", () => {
    const messages: DriverMessage[] = [{ role: "user", content: "hi" }];
    const r1 = buildCachedAnthropicRequest({ messages, config: config() });
    const r2 = buildCachedAnthropicRequest({ messages, config: config() });
    expect(r1.markers).toEqual(r2.markers);
  });
});
