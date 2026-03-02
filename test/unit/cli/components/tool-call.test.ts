/**
 * Tests for ToolCall component — tool call rendering with status and results.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ToolCallView } from "../../../../src/cli/components/ToolCall.js";
import type { DisplayToolCall } from "../../../../src/cli/types.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeToolCall(overrides: Partial<DisplayToolCall> = {}): DisplayToolCall {
  return {
    id: "tc-1",
    name: "read",
    args: { file_path: "src/cli/chat.tsx" },
    status: "completed",
    startTime: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("ToolCallView", () => {
  test("renders tool name capitalized", () => {
    const tc = makeToolCall({ name: "read" });
    const { lastFrame } = render(React.createElement(ToolCallView, { toolCall: tc }));
    expect(lastFrame()).toContain("Read");
  });

  test("renders ⏺ marker", () => {
    const tc = makeToolCall();
    const { lastFrame } = render(React.createElement(ToolCallView, { toolCall: tc }));
    expect(lastFrame()).toContain("⏺");
  });

  test("extracts file_path from args as summary", () => {
    const tc = makeToolCall({
      args: { file_path: "src/test.ts" },
    });
    const { lastFrame } = render(React.createElement(ToolCallView, { toolCall: tc }));
    expect(lastFrame()).toContain("src/test.ts");
  });

  test("extracts command from bash tool args", () => {
    const tc = makeToolCall({
      name: "bash",
      args: { command: "npm test" },
    });
    const { lastFrame } = render(React.createElement(ToolCallView, { toolCall: tc }));
    expect(lastFrame()).toContain("Bash");
    expect(lastFrame()).toContain("npm test");
  });

  test("renders result with ⎿ connector", () => {
    const tc = makeToolCall({
      result: "file contents here",
    });
    const { lastFrame } = render(React.createElement(ToolCallView, { toolCall: tc }));
    expect(lastFrame()).toContain("⎿");
    expect(lastFrame()).toContain("file contents here");
  });

  test("renders error result with error indication", () => {
    const tc = makeToolCall({
      result: "File not found",
      isError: true,
    });
    const { lastFrame } = render(React.createElement(ToolCallView, { toolCall: tc }));
    expect(lastFrame()).toContain("File not found");
  });

  test("does not render result when undefined", () => {
    const tc = makeToolCall({ result: undefined });
    const { lastFrame } = render(React.createElement(ToolCallView, { toolCall: tc }));
    const frame = lastFrame()!;
    // Should have the header but no ⎿ connector
    expect(frame).toContain("⏺");
    expect(frame).not.toContain("⎿");
  });

  test("handles empty args", () => {
    const tc = makeToolCall({ args: {} });
    const { lastFrame } = render(React.createElement(ToolCallView, { toolCall: tc }));
    expect(lastFrame()).toContain("⏺");
    expect(lastFrame()).toContain("Read");
  });
});
