/**
 * Tests for mascot ASCII art builder (Jeriko owl logo).
 */

import { describe, test, expect } from "bun:test";
import { buildMascot, buildMascotCompact } from "../../../../src/cli/lib/mascot.js";
import { stripAnsi } from "../../../../src/cli/format.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Get visual widths of all lines (ANSI-stripped). */
function lineWidths(lines: string[]): number[] {
  return lines.map((l) => stripAnsi(l).length);
}

// ---------------------------------------------------------------------------
// buildMascot
// ---------------------------------------------------------------------------

describe("buildMascot", () => {
  test("returns non-empty array", () => {
    const result = buildMascot();
    expect(result.length).toBeGreaterThan(0);
  });

  test("all lines have uniform visual width", () => {
    const result = buildMascot();
    const widths = lineWidths(result);
    const maxWidth = Math.max(...widths);
    for (const w of widths) {
      expect(w).toBe(maxWidth);
    }
  });

  test("contains ANSI color codes", () => {
    const result = buildMascot();
    const joined = result.join("\n");
    expect(/\u001b\[[0-9;]*m/.test(joined)).toBe(true);
  });

  test("contains block characters from the owl logo", () => {
    const result = buildMascot();
    const plain = result.map(stripAnsi).join("\n");
    // Owl logo uses full-block and half-block characters
    expect(plain).toContain("█");
    expect(plain).toContain("▄");
  });

  test("contains foot detail with half-block characters", () => {
    const result = buildMascot();
    const plain = result.map(stripAnsi).join("\n");
    // The owl's feet use ▀ characters
    expect(plain).toContain("▀");
  });

  test("consistent between calls", () => {
    const a = buildMascot();
    const b = buildMascot();
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// buildMascotCompact
// ---------------------------------------------------------------------------

describe("buildMascotCompact", () => {
  test("returns non-empty array", () => {
    const result = buildMascotCompact();
    expect(result.length).toBeGreaterThan(0);
  });

  test("fewer lines than full mascot", () => {
    const full = buildMascot();
    const compact = buildMascotCompact();
    expect(compact.length).toBeLessThan(full.length);
  });

  test("all lines have uniform visual width", () => {
    const result = buildMascotCompact();
    const widths = lineWidths(result);
    const maxWidth = Math.max(...widths);
    for (const w of widths) {
      expect(w).toBe(maxWidth);
    }
  });

  test("contains ANSI color codes", () => {
    const result = buildMascotCompact();
    const joined = result.join("\n");
    expect(/\u001b\[[0-9;]*m/.test(joined)).toBe(true);
  });

  test("contains block characters", () => {
    const result = buildMascotCompact();
    const plain = result.map(stripAnsi).join("\n");
    expect(plain).toContain("█");
  });
});
