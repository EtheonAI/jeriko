/**
 * Tests for mascot ASCII art builder (Jeriko cat head).
 *
 * Validates structure (dimensions, uniformity),
 * theme integration (ANSI coloring), and API stability.
 */

import { describe, test, expect } from "bun:test";
import { buildMascot, buildMascotCompact, MASCOT_HEIGHT } from "../../../../src/cli/lib/mascot.js";
import { stripAnsi } from "../../../../src/cli/format.js";

// ---------------------------------------------------------------------------
// buildMascotCompact
// ---------------------------------------------------------------------------

describe("buildMascotCompact", () => {
  test("returns non-empty array matching MASCOT_HEIGHT", () => {
    const result = buildMascotCompact();
    expect(result.length).toBe(MASCOT_HEIGHT);
    expect(result.length).toBeGreaterThan(0);
  });

  test("all lines have uniform visual width", () => {
    const result = buildMascotCompact();
    const widths = result.map((l) => stripAnsi(l).length);
    const maxWidth = Math.max(...widths);
    for (const w of widths) {
      expect(w).toBe(maxWidth);
    }
  });

  test("contains ANSI color codes from theme", () => {
    const result = buildMascotCompact();
    const joined = result.join("\n");
    expect(/\u001b\[[0-9;]*m/.test(joined)).toBe(true);
  });

  test("renders block characters for cat face", () => {
    const result = buildMascotCompact();
    const plain = result.map(stripAnsi).join("");
    // Cat face uses half-block and full-block characters
    expect(plain).toContain("█");
    expect(plain).toContain("▀");
    expect(plain).toContain("▄");
  });

  test("consistent between calls", () => {
    const a = buildMascotCompact();
    const b = buildMascotCompact();
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// buildMascot (alias)
// ---------------------------------------------------------------------------

describe("buildMascot", () => {
  test("returns same output as buildMascotCompact", () => {
    expect(buildMascot()).toEqual(buildMascotCompact());
  });
});
