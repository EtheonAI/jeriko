import { describe, expect, it, beforeEach } from "bun:test";

import {
  setActiveContext,
  getActiveContext,
  getActiveSystemPrompt,
  getActiveParentMessages,
  getActiveDepth,
  getActiveBackend,
  getActiveModel,
  clearActiveContext,
  type ActiveContext,
} from "../../src/daemon/agent/orchestrator-context.js";
import type { DriverMessage } from "../../src/daemon/agent/drivers/index.js";

// ─── Reset state between tests ─────────────────────────────────────────────

beforeEach(() => {
  clearActiveContext();
});

// ─── setActiveContext / getActiveSystemPrompt ────────────────────────────────

describe("setActiveContext / getActiveSystemPrompt", () => {
  it("returns undefined when no context is set", () => {
    expect(getActiveSystemPrompt()).toBeUndefined();
  });

  it("returns the system prompt after setting context", () => {
    setActiveContext({
      systemPrompt: "You are Jeriko.",
      messages: [],
      depth: 0,
    });
    expect(getActiveSystemPrompt()).toBe("You are Jeriko.");
  });

  it("returns undefined when system prompt is not provided", () => {
    setActiveContext({
      systemPrompt: undefined,
      messages: [],
      depth: 0,
    });
    expect(getActiveSystemPrompt()).toBeUndefined();
  });

  it("overwrites previous context on second set", () => {
    setActiveContext({ systemPrompt: "first", messages: [], depth: 0 });
    setActiveContext({ systemPrompt: "second", messages: [], depth: 1 });
    expect(getActiveSystemPrompt()).toBe("second");
  });
});

// ─── getActiveParentMessages ────────────────────────────────────────────────

describe("getActiveParentMessages", () => {
  it("returns empty array when no context is set", () => {
    expect(getActiveParentMessages()).toEqual([]);
  });

  it("returns non-system messages", () => {
    const messages: DriverMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
      { role: "user", content: "do something" },
    ];
    setActiveContext({ systemPrompt: "test", messages, depth: 0 });

    const result = getActiveParentMessages();
    expect(result).toHaveLength(3);
    expect(result.every((m) => m.role !== "system")).toBe(true);
    expect(result[0]!.content).toBe("hello");
    expect(result[1]!.content).toBe("hi there");
    expect(result[2]!.content).toBe("do something");
  });

  it("caps at maxMessages parameter", () => {
    const messages: DriverMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as DriverMessage["role"],
      content: `message ${i}`,
    }));
    setActiveContext({ systemPrompt: "test", messages, depth: 0 });

    const result = getActiveParentMessages(5);
    expect(result).toHaveLength(5);
    // Should be the last 5 messages
    expect(result[0]!.content).toBe("message 15");
    expect(result[4]!.content).toBe("message 19");
  });

  it("returns all messages when fewer than maxMessages", () => {
    const messages: DriverMessage[] = [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
    ];
    setActiveContext({ systemPrompt: "test", messages, depth: 0 });

    const result = getActiveParentMessages(10);
    expect(result).toHaveLength(2);
  });

  it("returns a copy, not a reference to the original array", () => {
    const messages: DriverMessage[] = [
      { role: "user", content: "hello" },
    ];
    setActiveContext({ systemPrompt: "test", messages, depth: 0 });

    const a = getActiveParentMessages();
    const b = getActiveParentMessages();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it("filters out system messages when counting", () => {
    const messages: DriverMessage[] = [
      { role: "system", content: "sys1" },
      { role: "user", content: "msg1" },
      { role: "system", content: "sys2" },
      { role: "assistant", content: "msg2" },
      { role: "user", content: "msg3" },
    ];
    setActiveContext({ systemPrompt: "test", messages, depth: 0 });

    const result = getActiveParentMessages(2);
    expect(result).toHaveLength(2);
    expect(result[0]!.content).toBe("msg2");
    expect(result[1]!.content).toBe("msg3");
  });
});

// ─── getActiveDepth ─────────────────────────────────────────────────────────

describe("getActiveDepth", () => {
  it("returns 0 when no context is set", () => {
    expect(getActiveDepth()).toBe(0);
  });

  it("returns the depth value from context", () => {
    setActiveContext({ systemPrompt: "test", messages: [], depth: 3 });
    expect(getActiveDepth()).toBe(3);
  });

  it("returns 0 when depth is explicitly 0", () => {
    setActiveContext({ systemPrompt: "test", messages: [], depth: 0 });
    expect(getActiveDepth()).toBe(0);
  });
});

// ─── clearActiveContext ─────────────────────────────────────────────────────

describe("clearActiveContext", () => {
  it("resets system prompt to undefined", () => {
    setActiveContext({ systemPrompt: "test", messages: [], depth: 0 });
    expect(getActiveSystemPrompt()).toBe("test");

    clearActiveContext();
    expect(getActiveSystemPrompt()).toBeUndefined();
  });

  it("resets parent messages to empty array", () => {
    const messages: DriverMessage[] = [{ role: "user", content: "hello" }];
    setActiveContext({ systemPrompt: "test", messages, depth: 0 });
    expect(getActiveParentMessages()).toHaveLength(1);

    clearActiveContext();
    expect(getActiveParentMessages()).toEqual([]);
  });

  it("resets depth to 0", () => {
    setActiveContext({ systemPrompt: "test", messages: [], depth: 5 });
    expect(getActiveDepth()).toBe(5);

    clearActiveContext();
    expect(getActiveDepth()).toBe(0);
  });

  it("is idempotent", () => {
    clearActiveContext();
    clearActiveContext();
    expect(getActiveSystemPrompt()).toBeUndefined();
    expect(getActiveParentMessages()).toEqual([]);
    expect(getActiveDepth()).toBe(0);
  });
});

// ─── getActiveBackend / getActiveModel ──────────────────────────────────────

describe("getActiveBackend / getActiveModel", () => {
  it("returns undefined when no context is set", () => {
    expect(getActiveBackend()).toBeUndefined();
    expect(getActiveModel()).toBeUndefined();
  });

  it("returns backend and model after setting context", () => {
    setActiveContext({
      systemPrompt: "test",
      messages: [],
      depth: 0,
      backend: "local",
      model: "gpt-oss:120b-cloud",
    });
    expect(getActiveBackend()).toBe("local");
    expect(getActiveModel()).toBe("gpt-oss:120b-cloud");
  });

  it("returns undefined when backend/model not provided", () => {
    setActiveContext({ systemPrompt: "test", messages: [], depth: 0 });
    expect(getActiveBackend()).toBeUndefined();
    expect(getActiveModel()).toBeUndefined();
  });
});

// ─── Re-entrancy: getActiveContext / save-restore pattern ───────────────────

describe("re-entrancy (save/restore)", () => {
  it("getActiveContext returns the full snapshot", () => {
    setActiveContext({
      systemPrompt: "parent prompt",
      messages: [{ role: "user", content: "hello" }],
      depth: 0,
      backend: "local",
      model: "gpt-oss:120b-cloud",
    });

    const snapshot = getActiveContext();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.systemPrompt).toBe("parent prompt");
    expect(snapshot!.depth).toBe(0);
    expect(snapshot!.backend).toBe("local");
    expect(snapshot!.model).toBe("gpt-oss:120b-cloud");
  });

  it("getActiveContext returns null when cleared", () => {
    clearActiveContext();
    expect(getActiveContext()).toBeNull();
  });

  it("simulates re-entrant delegate: save parent → child runs → restore parent", () => {
    // Parent sets context
    setActiveContext({
      systemPrompt: "parent",
      messages: [],
      depth: 0,
      backend: "local",
      model: "gpt-oss:120b-cloud",
    });

    // Save parent's context (what delegate() does)
    const parentCtx = getActiveContext();

    // Child runAgent() overwrites context
    setActiveContext({
      systemPrompt: "child",
      messages: [],
      depth: 1,
      backend: "local",
      model: "gpt-oss:120b-cloud",
    });
    expect(getActiveDepth()).toBe(1);
    expect(getActiveSystemPrompt()).toBe("child");

    // Child runAgent() clears context on exit
    clearActiveContext();
    expect(getActiveDepth()).toBe(0);
    expect(getActiveBackend()).toBeUndefined();

    // Restore parent's context (what delegate() does after child completes)
    if (parentCtx) setActiveContext(parentCtx);

    // Verify parent's context is back
    expect(getActiveDepth()).toBe(0);
    expect(getActiveSystemPrompt()).toBe("parent");
    expect(getActiveBackend()).toBe("local");
    expect(getActiveModel()).toBe("gpt-oss:120b-cloud");
  });

  it("handles sequential delegates: each restore preserves parent state", () => {
    // Parent
    setActiveContext({
      systemPrompt: "parent",
      messages: [],
      depth: 0,
      backend: "local",
      model: "qwen2.5:7b",
    });

    // First delegate
    const saved1 = getActiveContext();
    setActiveContext({ systemPrompt: "child1", messages: [], depth: 1 });
    clearActiveContext();
    if (saved1) setActiveContext(saved1);
    expect(getActiveModel()).toBe("qwen2.5:7b");

    // Second delegate (sequential) — parent state should still be intact
    const saved2 = getActiveContext();
    setActiveContext({ systemPrompt: "child2", messages: [], depth: 1 });
    clearActiveContext();
    if (saved2) setActiveContext(saved2);
    expect(getActiveModel()).toBe("qwen2.5:7b");
    expect(getActiveBackend()).toBe("local");
    expect(getActiveDepth()).toBe(0);
  });
});
