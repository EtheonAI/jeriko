/**
 * Tests for Messages component — static history rendering.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { Messages, StreamingText } from "../../../../src/cli/components/Messages.js";
import type { DisplayMessage } from "../../../../src/cli/types.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: "msg-1",
    role: "user",
    content: "Hello",
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Messages (Static)
// ---------------------------------------------------------------------------

describe("Messages", () => {
  test("renders user message with prompt marker", () => {
    const msgs = [makeMessage({ content: "Hello world" })];
    const { lastFrame } = render(React.createElement(Messages, { messages: msgs }));
    expect(lastFrame()).toContain("Hello world");
    expect(lastFrame()).toContain(">");
  });

  test("renders assistant message content", () => {
    const msgs = [makeMessage({ role: "assistant", content: "I can help with that." })];
    const { lastFrame } = render(React.createElement(Messages, { messages: msgs }));
    expect(lastFrame()).toContain("I can help with that.");
  });

  test("renders system message dimmed", () => {
    const msgs = [makeMessage({ role: "system", content: "Session resumed." })];
    const { lastFrame } = render(React.createElement(Messages, { messages: msgs }));
    expect(lastFrame()).toContain("Session resumed.");
  });

  test("renders multiple messages in order", () => {
    const msgs = [
      makeMessage({ id: "1", role: "user", content: "First" }),
      makeMessage({ id: "2", role: "assistant", content: "Second" }),
      makeMessage({ id: "3", role: "system", content: "Third" }),
    ];
    const { lastFrame } = render(React.createElement(Messages, { messages: msgs }));
    const frame = lastFrame()!;
    expect(frame).toContain("First");
    expect(frame).toContain("Second");
    expect(frame).toContain("Third");
  });

  test("renders empty message list without error", () => {
    const { lastFrame } = render(React.createElement(Messages, { messages: [] }));
    // Should render without crashing — output may be empty
    expect(lastFrame()).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// StreamingText
// ---------------------------------------------------------------------------

describe("StreamingText", () => {
  test("renders text with cursor during streaming", () => {
    const { lastFrame } = render(
      React.createElement(StreamingText, { text: "Partial response", phase: "streaming" }),
    );
    expect(lastFrame()).toContain("Partial response");
    expect(lastFrame()).toContain("▊");
  });

  test("returns null when phase is not streaming", () => {
    const { lastFrame } = render(
      React.createElement(StreamingText, { text: "Some text", phase: "idle" }),
    );
    expect(lastFrame()).toBe("");
  });

  test("returns null when text is empty", () => {
    const { lastFrame } = render(
      React.createElement(StreamingText, { text: "", phase: "streaming" }),
    );
    expect(lastFrame()).toBe("");
  });
});
