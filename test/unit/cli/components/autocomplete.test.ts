/**
 * Tests for Autocomplete component and its scroll window logic.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { Autocomplete, computeVisibleWindow } from "../../../../src/cli/components/Autocomplete.js";
import type { AutocompleteItem } from "../../../../src/cli/lib/autocomplete.js";

// ---------------------------------------------------------------------------
// computeVisibleWindow
// ---------------------------------------------------------------------------

describe("computeVisibleWindow", () => {
  test("returns full range when items fit", () => {
    expect(computeVisibleWindow(5, 2, 8)).toEqual({ start: 0, end: 5 });
  });

  test("returns full range when items equal max", () => {
    expect(computeVisibleWindow(8, 4, 8)).toEqual({ start: 0, end: 8 });
  });

  test("centers selected item when possible", () => {
    // 15 items, max 8 visible, selected index 7
    const result = computeVisibleWindow(15, 7, 8);
    expect(result.end - result.start).toBe(8);
    expect(result.start).toBeLessThanOrEqual(7);
    expect(result.end).toBeGreaterThan(7);
  });

  test("clamps to start when selected near beginning", () => {
    const result = computeVisibleWindow(15, 1, 8);
    expect(result.start).toBe(0);
    expect(result.end).toBe(8);
  });

  test("clamps to end when selected near end", () => {
    const result = computeVisibleWindow(15, 14, 8);
    expect(result.end).toBe(15);
    expect(result.start).toBe(7);
  });

  test("handles 0 total items", () => {
    expect(computeVisibleWindow(0, -1, 8)).toEqual({ start: 0, end: 0 });
  });

  test("handles single item", () => {
    expect(computeVisibleWindow(1, 0, 8)).toEqual({ start: 0, end: 1 });
  });
});

// ---------------------------------------------------------------------------
// Autocomplete component rendering
// ---------------------------------------------------------------------------

const sampleItems: AutocompleteItem[] = [
  { name: "/help", description: "Show available commands" },
  { name: "/history", description: "Show message history" },
  { name: "/health", description: "Check connector health" },
];

describe("Autocomplete component", () => {
  test("renders nothing when items is empty", () => {
    const { lastFrame } = render(
      React.createElement(Autocomplete, { items: [], selectedIndex: -1 }),
    );
    expect(lastFrame()).toBe("");
  });

  test("renders all items", () => {
    const { lastFrame } = render(
      React.createElement(Autocomplete, { items: sampleItems, selectedIndex: 0 }),
    );
    const frame = lastFrame();
    expect(frame).toContain("/help");
    expect(frame).toContain("/history");
    expect(frame).toContain("/health");
  });

  test("shows descriptions", () => {
    const { lastFrame } = render(
      React.createElement(Autocomplete, { items: sampleItems, selectedIndex: 0 }),
    );
    expect(lastFrame()).toContain("Show available commands");
    expect(lastFrame()).toContain("Check connector health");
  });

  test("highlights selected item with ▸", () => {
    const { lastFrame } = render(
      React.createElement(Autocomplete, { items: sampleItems, selectedIndex: 1 }),
    );
    const frame = lastFrame()!;
    const lines = frame.split("\n");
    // The selected item (index 1 = /history) should have ▸
    const historyLine = lines.find((l) => l.includes("/history"));
    expect(historyLine).toContain("▸");
    // Non-selected items should not have ▸
    const helpLine = lines.find((l) => l.includes("/help"));
    expect(helpLine).not.toContain("▸");
  });

  test("renders without crash when selectedIndex is -1", () => {
    const { lastFrame } = render(
      React.createElement(Autocomplete, { items: sampleItems, selectedIndex: -1 }),
    );
    expect(lastFrame()).toContain("/help");
    // No item should have ▸ when selectedIndex is -1
    const frame = lastFrame()!;
    const linesWithArrow = frame.split("\n").filter((l) => l.includes("▸"));
    expect(linesWithArrow).toHaveLength(0);
  });
});
