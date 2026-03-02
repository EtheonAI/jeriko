/**
 * Tests for CLI Spinner component — frame presets, rendering, and cleanup.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { Spinner, SPINNER_PRESETS } from "../../../../src/cli/components/Spinner.js";

// ---------------------------------------------------------------------------
// Rendering — default (no preset)
// ---------------------------------------------------------------------------

describe("Spinner component", () => {
  test("renders with label text", () => {
    const { lastFrame } = render(React.createElement(Spinner, { label: "Thinking" }));
    const frame = lastFrame();
    expect(frame).toContain("Thinking");
    expect(frame).toContain("…");
  });

  test("renders with a default braille spinner frame", () => {
    const { lastFrame } = render(React.createElement(Spinner, { label: "Loading" }));
    const frame = lastFrame();
    // Default preset is "streaming" which uses braille dots
    const brailleChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const containsBraille = brailleChars.some((char) => frame?.includes(char));
    expect(containsBraille).toBe(true);
  });

  test("cleans up on unmount", () => {
    const { unmount } = render(
      React.createElement(Spinner, { label: "Test" }),
    );
    expect(() => unmount()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Presets — phase-specific frame sets
// ---------------------------------------------------------------------------

describe("Spinner presets", () => {
  test("thinking preset renders with quarter-circle frames", () => {
    const { lastFrame } = render(
      React.createElement(Spinner, { label: "Thinking", preset: "thinking" }),
    );
    const frame = lastFrame();
    expect(frame).toContain("Thinking");
    const thinkingFrames = ["◐", "◓", "◑", "◒"];
    const containsThinking = thinkingFrames.some((c) => frame?.includes(c));
    expect(containsThinking).toBe(true);
  });

  test("tool-executing preset renders with block frames", () => {
    const { lastFrame } = render(
      React.createElement(Spinner, { label: "Running bash", preset: "tool-executing" }),
    );
    const frame = lastFrame();
    expect(frame).toContain("Running bash");
    const toolFrames = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
    const containsTool = toolFrames.some((c) => frame?.includes(c));
    expect(containsTool).toBe(true);
  });

  test("sub-executing preset renders with square frames", () => {
    const { lastFrame } = render(
      React.createElement(Spinner, { label: "Delegating", preset: "sub-executing" }),
    );
    const frame = lastFrame();
    expect(frame).toContain("Delegating");
    const subFrames = ["◰", "◳", "◲", "◱"];
    const containsSub = subFrames.some((c) => frame?.includes(c));
    expect(containsSub).toBe(true);
  });

  test("unknown preset falls back to default", () => {
    const { lastFrame } = render(
      React.createElement(Spinner, { label: "Test", preset: "nonexistent" }),
    );
    const frame = lastFrame();
    const brailleChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const containsBraille = brailleChars.some((c) => frame?.includes(c));
    expect(containsBraille).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SPINNER_PRESETS constant
// ---------------------------------------------------------------------------

describe("SPINNER_PRESETS", () => {
  test("has all four phase presets", () => {
    expect(SPINNER_PRESETS).toHaveProperty("thinking");
    expect(SPINNER_PRESETS).toHaveProperty("streaming");
    expect(SPINNER_PRESETS).toHaveProperty("tool-executing");
    expect(SPINNER_PRESETS).toHaveProperty("sub-executing");
  });

  test("all presets have frames, intervalMs, and color", () => {
    for (const [, preset] of Object.entries(SPINNER_PRESETS)) {
      expect(preset.frames.length).toBeGreaterThan(0);
      expect(preset.intervalMs).toBeGreaterThan(0);
      expect(typeof preset.color).toBe("string");
      expect(preset.color.length).toBeGreaterThan(0);
    }
  });

  test("thinking preset has longer interval than streaming", () => {
    expect(SPINNER_PRESETS.thinking.intervalMs).toBeGreaterThan(
      SPINNER_PRESETS.streaming.intervalMs,
    );
  });

  test("sub-executing preset has longest interval", () => {
    expect(SPINNER_PRESETS["sub-executing"].intervalMs).toBeGreaterThanOrEqual(
      SPINNER_PRESETS.thinking.intervalMs,
    );
  });
});
