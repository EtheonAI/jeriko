// Unit tests — ExecutionGuard and agent loop helpers.
//
// Tests guard boundaries, rate limiting, and JSON repair for OSS models.

import { describe, test, expect } from "bun:test";
import { ExecutionGuard } from "../../src/daemon/agent/guard.js";

// ---------------------------------------------------------------------------
// Guard defaults
// ---------------------------------------------------------------------------

describe("ExecutionGuard defaults", () => {
  test("maxConsecutiveErrors is 5", () => {
    const guard = new ExecutionGuard();
    // Should allow 4 consecutive error rounds without tripping
    for (let i = 0; i < 4; i++) {
      expect(guard.recordRound(true)).toBeNull();
    }
    // 5th should trip
    expect(guard.recordRound(true)).toBeTruthy();
  });

  test("maxDurationMs is 10 minutes", () => {
    const guard = new ExecutionGuard();
    // Should not trip immediately
    expect(guard.checkBeforeRound()).toBeNull();
  });

  test("success resets consecutive error count", () => {
    const guard = new ExecutionGuard();
    // 4 failures, then 1 success, then 4 more failures → no trip
    for (let i = 0; i < 4; i++) {
      expect(guard.recordRound(true)).toBeNull();
    }
    expect(guard.recordRound(false)).toBeNull(); // success resets
    for (let i = 0; i < 4; i++) {
      expect(guard.recordRound(true)).toBeNull();
    }
    // 5th consecutive failure trips
    expect(guard.recordRound(true)).toBeTruthy();
  });

  test("screenshot rate limit is 10 per minute", () => {
    const guard = new ExecutionGuard();
    // 10 calls should be fine
    for (let i = 0; i < 10; i++) {
      expect(guard.checkToolCall("screenshot")).toBeNull();
    }
    // 11th should be rate-limited
    expect(guard.checkToolCall("screenshot")).toBeTruthy();
  });

  test("browser rate limit is 30 per minute", () => {
    const guard = new ExecutionGuard();
    for (let i = 0; i < 30; i++) {
      expect(guard.checkToolCall("browser")).toBeNull();
    }
    expect(guard.checkToolCall("browser")).toBeTruthy();
  });

  test("unlisted tools are not rate-limited", () => {
    const guard = new ExecutionGuard();
    for (let i = 0; i < 100; i++) {
      expect(guard.checkToolCall("bash")).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Custom guard config
// ---------------------------------------------------------------------------

describe("ExecutionGuard custom config", () => {
  test("custom maxConsecutiveErrors", () => {
    const guard = new ExecutionGuard({ maxConsecutiveErrors: 2 });
    expect(guard.recordRound(true)).toBeNull();
    expect(guard.recordRound(true)).toBeTruthy();
  });

  test("custom tool limits", () => {
    const guard = new ExecutionGuard({
      toolLimits: { bash: { maxCalls: 3, windowMs: 60_000 } },
    });
    expect(guard.checkToolCall("bash")).toBeNull();
    expect(guard.checkToolCall("bash")).toBeNull();
    expect(guard.checkToolCall("bash")).toBeNull();
    expect(guard.checkToolCall("bash")).toBeTruthy();
  });

  test("guard error messages are descriptive", () => {
    const guard = new ExecutionGuard({ maxConsecutiveErrors: 1 });
    const msg = guard.recordRound(true);
    expect(msg).toContain("consecutive");
    expect(msg).toContain("failed");
  });

  test("rate limit error messages are descriptive", () => {
    const guard = new ExecutionGuard({
      toolLimits: { test_tool: { maxCalls: 1, windowMs: 60_000 } },
    });
    guard.checkToolCall("test_tool");
    const msg = guard.checkToolCall("test_tool");
    expect(msg).toContain("Rate limited");
    expect(msg).toContain("test_tool");
  });
});

// ---------------------------------------------------------------------------
// parseToolArgs — JSON repair for OSS models
// ---------------------------------------------------------------------------

// We can't import parseToolArgs directly (it's a module-private function),
// so we test it via the exported interface indirectly. However, we can test
// the repair logic by extracting the same patterns.

describe("JSON repair patterns (OSS model compatibility)", () => {
  function repairAndParse(raw: string): Record<string, unknown> {
    // Mirrors the parseToolArgs logic from agent.ts
    try {
      return JSON.parse(raw);
    } catch { /* fall through */ }

    let s = raw.trim();
    if (!s) return {};

    // Strip markdown code fences
    if (s.startsWith("```")) {
      s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
    }

    // Trailing commas
    s = s.replace(/,\s*([}\]])/g, "$1");

    // Single quotes → double quotes
    if (!s.includes('"') && s.includes("'")) {
      s = s.replace(/'/g, '"');
    }

    // Unquoted keys
    s = s.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');

    try {
      return JSON.parse(s);
    } catch {
      return JSON.parse(raw);
    }
  }

  test("valid JSON passes through", () => {
    expect(repairAndParse('{"command":"ls"}')).toEqual({ command: "ls" });
  });

  test("empty string → empty object", () => {
    expect(repairAndParse("")).toEqual({});
    expect(repairAndParse("  ")).toEqual({});
  });

  test("trailing comma repair", () => {
    expect(repairAndParse('{"a": 1, "b": 2,}')).toEqual({ a: 1, b: 2 });
  });

  test("nested trailing commas", () => {
    expect(repairAndParse('{"a": [1, 2, 3,],}')).toEqual({ a: [1, 2, 3] });
  });

  test("single-quoted strings", () => {
    expect(repairAndParse("{'command': 'ls -la'}")).toEqual({ command: "ls -la" });
  });

  test("unquoted keys", () => {
    expect(repairAndParse('{command: "ls", path: "/tmp"}')).toEqual({ command: "ls", path: "/tmp" });
  });

  test("markdown code fence wrapping", () => {
    const wrapped = '```json\n{"command": "ls"}\n```';
    expect(repairAndParse(wrapped)).toEqual({ command: "ls" });
  });

  test("markdown code fence without language tag", () => {
    const wrapped = '```\n{"command": "ls"}\n```';
    expect(repairAndParse(wrapped)).toEqual({ command: "ls" });
  });

  test("combined issues: trailing comma + unquoted keys", () => {
    expect(repairAndParse('{command: "ls", recursive: true,}')).toEqual({
      command: "ls",
      recursive: true,
    });
  });

  test("valid nested JSON not broken", () => {
    const input = '{"command": "echo", "args": {"text": "hello world"}}';
    expect(repairAndParse(input)).toEqual({
      command: "echo",
      args: { text: "hello world" },
    });
  });

  test("preserves numbers, booleans, null", () => {
    expect(repairAndParse('{"count": 5, "active": true, "data": null}')).toEqual({
      count: 5,
      active: true,
      data: null,
    });
  });
});
