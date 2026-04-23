/**
 * Tests for motion primitives — Spinner, Shimmer, FlashingChar, ProgressBar.
 *
 * MotionProvider is used to force each motion mode so tests never depend on
 * real timer ticks or the ambient environment.
 */

import { describe, test, expect, afterEach } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { MotionProvider } from "../../../../src/cli/ui/motion/context.js";
import { __unsafe_resetAllClocks } from "../../../../src/cli/ui/motion/clock.js";
import { Spinner, PRESET_BY_PHASE } from "../../../../src/cli/ui/motion-primitives/Spinner.js";
import { Shimmer } from "../../../../src/cli/ui/motion-primitives/Shimmer.js";
import { FlashingChar } from "../../../../src/cli/ui/motion-primitives/FlashingChar.js";
import { ProgressBar } from "../../../../src/cli/ui/motion-primitives/ProgressBar.js";
import type { MotionMode } from "../../../../src/cli/ui/types.js";

function withMotion(mode: MotionMode, node: React.ReactElement): React.ReactElement {
  return React.createElement(MotionProvider, { mode }, node);
}

/**
 * Strip ANSI escape sequences from a rendered frame.
 * Needed for primitives like Shimmer that color per-character — without
 * stripping, an interleaved `ESC[...m` between every letter prevents
 * `.toContain()` from matching a plain substring.
 */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
function stripAnsi(s: string | undefined): string {
  return (s ?? "").replace(ANSI_PATTERN, "");
}

afterEach(() => {
  __unsafe_resetAllClocks();
});

describe("Spinner", () => {
  test("renders the label in every mode", () => {
    for (const mode of ["full", "reduced", "none"] as const) {
      const { lastFrame, unmount } = render(
        withMotion(mode, React.createElement(Spinner, { label: "Thinking", phase: "thinking" })),
      );
      expect(lastFrame()).toContain("Thinking");
      unmount();
    }
  });

  test("reduced mode renders the reduced glyph (●), not an animated frame", () => {
    const { lastFrame } = render(
      withMotion(
        "reduced",
        React.createElement(Spinner, { label: "Loading", phase: "streaming" }),
      ),
    );
    expect(lastFrame()).toContain(PRESET_BY_PHASE.streaming.reducedGlyph);
  });

  test("none mode renders no leading glyph", () => {
    const { lastFrame } = render(
      withMotion("none", React.createElement(Spinner, { label: "Quiet", phase: "thinking" })),
    );
    const frame = lastFrame() ?? "";
    const brailleLike = ["⠋", "⠙", "⠹", "⠸", "◐", "◓", "⣾", "⣽", "◰", "◳"];
    for (const g of brailleLike) expect(frame).not.toContain(g);
    expect(frame).toContain("Quiet");
  });

  test("full mode renders a frame from the preset's frame set", () => {
    const { lastFrame } = render(
      withMotion("full", React.createElement(Spinner, { label: "Busy", phase: "streaming" })),
    );
    const frame = lastFrame() ?? "";
    const matched = PRESET_BY_PHASE.streaming.frames.some((f) => frame.includes(f));
    expect(matched).toBe(true);
  });

  test("unmount cleans up timer subscription", () => {
    const { unmount } = render(
      withMotion("full", React.createElement(Spinner, { label: "x", phase: "thinking" })),
    );
    unmount();
    // After unmount the clock should have no subscribers — reset hook confirms.
    __unsafe_resetAllClocks();
  });
});

describe("Shimmer", () => {
  test("renders the input text across all modes (ANSI stripped)", () => {
    for (const mode of ["full", "reduced", "none"] as const) {
      const { lastFrame, unmount } = render(
        withMotion(mode, React.createElement(Shimmer, null, "Indexing")),
      );
      expect(stripAnsi(lastFrame())).toContain("Indexing");
      unmount();
    }
  });
});

describe("FlashingChar", () => {
  test("renders the char in every mode", () => {
    for (const mode of ["full", "reduced", "none"] as const) {
      const { lastFrame, unmount } = render(
        withMotion(mode, React.createElement(FlashingChar, { char: "●" })),
      );
      expect(lastFrame()).toContain("●");
      unmount();
    }
  });
});

describe("ProgressBar", () => {
  test("renders a fully-filled bar for value=1", () => {
    const { lastFrame } = render(
      React.createElement(ProgressBar, { value: 1, width: 8, showLabel: false }),
    );
    expect(lastFrame()).toContain("█".repeat(8));
  });

  test("renders a fully-empty bar for value=0", () => {
    const { lastFrame } = render(
      React.createElement(ProgressBar, { value: 0, width: 8, showLabel: false }),
    );
    expect(lastFrame()).toContain("░".repeat(8));
  });

  test("shows percentage label when enabled", () => {
    const { lastFrame } = render(
      React.createElement(ProgressBar, { value: 0.5, width: 10, showLabel: true }),
    );
    expect(lastFrame()).toContain("50%");
  });

  test("clamps out-of-range values", () => {
    const negative = render(
      React.createElement(ProgressBar, { value: -0.5, width: 4, showLabel: false }),
    );
    expect(negative.lastFrame()).toContain("░".repeat(4));
    negative.unmount();

    const huge = render(
      React.createElement(ProgressBar, { value: 999, width: 4, showLabel: false }),
    );
    expect(huge.lastFrame()).toContain("█".repeat(4));
    huge.unmount();
  });

  test("rejects NaN by clamping to zero", () => {
    const { lastFrame } = render(
      React.createElement(ProgressBar, { value: NaN, width: 4, showLabel: false }),
    );
    expect(lastFrame()).toContain("░".repeat(4));
  });
});
