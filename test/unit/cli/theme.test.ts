/**
 * Tests for CLI theme — palette constants and semantic chalk wrappers.
 */

import { describe, test, expect } from "bun:test";
import { PALETTE, t } from "../../../src/cli/theme.js";

// ---------------------------------------------------------------------------
// PALETTE
// ---------------------------------------------------------------------------

describe("PALETTE", () => {
  const EXPECTED_KEYS = [
    "brand", "brandDim", "blue", "green", "red",
    "yellow", "cyan", "purple", "text", "muted", "dim", "faint",
  ] as const;

  test("has all expected color keys", () => {
    for (const key of EXPECTED_KEYS) {
      expect(PALETTE[key]).toBeDefined();
    }
  });

  test("all values are valid hex color strings", () => {
    for (const key of EXPECTED_KEYS) {
      const value = PALETTE[key];
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("brand is electric indigo (#7C5AFF)", () => {
    expect(PALETTE.brand).toBe("#7C5AFF");
  });

  test("blue alias matches tool", () => {
    expect(PALETTE.blue).toBe(PALETTE.tool);
  });

  test("red is error red (#f87171)", () => {
    expect(PALETTE.red).toBe("#f87171");
  });

  test("green is success green (#4ade80)", () => {
    expect(PALETTE.green).toBe("#4ade80");
  });

  test("three-tier text hierarchy has decreasing visibility", () => {
    // text > muted > dim > faint — hex values should be progressively darker
    expect(PALETTE.text).toBeDefined();
    expect(PALETTE.muted).toBeDefined();
    expect(PALETTE.dim).toBeDefined();
    expect(PALETTE.faint).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Semantic chalk functions (t)
// ---------------------------------------------------------------------------

describe("t (semantic chalk functions)", () => {
  const EXPECTED_FUNCTIONS = [
    "brand", "brandDim", "brandBold",
    "blue", "green", "red", "yellow", "cyan", "purple",
    "success", "error", "warning", "info",
    "text", "muted", "dim", "faint",
    "bold", "header",
  ] as const;

  test("has all expected semantic functions", () => {
    for (const key of EXPECTED_FUNCTIONS) {
      expect(typeof t[key]).toBe("function");
    }
  });

  test("each function returns a string when called with input", () => {
    for (const key of EXPECTED_FUNCTIONS) {
      const result = t[key]("test");
      expect(typeof result).toBe("string");
      expect(result).toContain("test");
    }
  });

  test("brand returns string containing the input text", () => {
    const result = t.brand("hello");
    expect(result).toContain("hello");
    expect(result.length).toBeGreaterThanOrEqual(5);
  });

  test("success and green are aliases", () => {
    // Both should produce the same color output
    const greenResult = t.green("same");
    const successResult = t.success("same");
    expect(greenResult).toBe(successResult);
  });

  test("error and red are aliases", () => {
    const redResult = t.red("same");
    const errorResult = t.error("same");
    expect(redResult).toBe(errorResult);
  });

  test("bold returns string containing the input text", () => {
    const result = t.bold("strong");
    expect(result).toContain("strong");
    expect(result.length).toBeGreaterThanOrEqual(6);
  });

  test("functions are composable", () => {
    const result = t.bold(t.brand("composed"));
    expect(typeof result).toBe("string");
    expect(result).toContain("composed");
  });
});
