/**
 * Tests for ContextBar — visual context usage indicator.
 *
 * Tests the pure computation function (computeContextBar) for correctness
 * and the React component for rendering behavior.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ContextBar, computeContextBar } from "../../../../src/cli/components/ContextBar.js";
import type { ContextInfo } from "../../../../src/cli/types.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<ContextInfo> = {}): ContextInfo {
  return {
    totalTokens: 0,
    maxTokens: 200_000,
    compactionCount: 0,
    ...overrides,
  };
}

function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

// ---------------------------------------------------------------------------
// computeContextBar — pure computation
// ---------------------------------------------------------------------------

describe("computeContextBar", () => {
  test("hidden when usage below 50%", () => {
    const result = computeContextBar(50_000, makeContext());
    expect(result.visible).toBe(false);
  });

  test("hidden when maxTokens is 0", () => {
    const result = computeContextBar(100_000, makeContext({ maxTokens: 0 }));
    expect(result.visible).toBe(false);
  });

  test("visible when usage at 50%", () => {
    const result = computeContextBar(100_000, makeContext());
    expect(result.visible).toBe(true);
  });

  test("visible when usage above 50%", () => {
    const result = computeContextBar(140_000, makeContext());
    expect(result.visible).toBe(true);
    expect(result.percentage).toBeCloseTo(0.7, 1);
  });

  test("yellow color below 80%", () => {
    const result = computeContextBar(120_000, makeContext());
    expect(result.visible).toBe(true);
    // Should use yellow (not red) at 60%
    expect(result.color).not.toContain("f7768e"); // not red
  });

  test("red color at 80%+", () => {
    const result = computeContextBar(170_000, makeContext());
    expect(result.visible).toBe(true);
    expect(result.percentage).toBeGreaterThanOrEqual(0.8);
    // Should use red
    expect(result.color).toContain("f7768e"); // PALETTE.red
  });

  test("percentage capped at 100%", () => {
    const result = computeContextBar(300_000, makeContext());
    expect(result.percentage).toBe(1);
    expect(result.filledWidth).toBe(30); // full bar
    expect(result.emptyWidth).toBe(0);
  });

  test("label includes token counts", () => {
    const result = computeContextBar(140_000, makeContext());
    expect(result.label).toContain("140k");
    expect(result.label).toContain("200k");
  });

  test("label includes percentage", () => {
    const result = computeContextBar(140_000, makeContext());
    expect(result.label).toContain("70%");
  });

  test("label includes compaction count when > 0", () => {
    const result = computeContextBar(140_000, makeContext({ compactionCount: 3 }));
    expect(result.label).toContain("compacted 3x");
  });

  test("label omits compaction count when 0", () => {
    const result = computeContextBar(140_000, makeContext({ compactionCount: 0 }));
    expect(result.label).not.toContain("compacted");
  });

  test("filled and empty widths sum to bar width (30)", () => {
    const result = computeContextBar(140_000, makeContext());
    expect(result.filledWidth + result.emptyWidth).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Component rendering
// ---------------------------------------------------------------------------

describe("ContextBar component", () => {
  test("renders nothing when below threshold", () => {
    const { lastFrame } = render(
      React.createElement(ContextBar, {
        totalUsed: 50_000,
        context: makeContext(),
      }),
    );
    expect(lastFrame()).toBe("");
  });

  test("renders bar when above threshold", () => {
    const { lastFrame } = render(
      React.createElement(ContextBar, {
        totalUsed: 140_000,
        context: makeContext(),
      }),
    );
    const frame = lastFrame();
    expect(frame.length).toBeGreaterThan(0);
    const plain = stripAnsi(frame);
    expect(plain).toContain("70%");
    expect(plain).toContain("█");
    expect(plain).toContain("░");
  });

  test("shows compaction count in output", () => {
    const { lastFrame } = render(
      React.createElement(ContextBar, {
        totalUsed: 140_000,
        context: makeContext({ compactionCount: 2 }),
      }),
    );
    const plain = stripAnsi(lastFrame());
    expect(plain).toContain("compacted 2x");
  });
});
