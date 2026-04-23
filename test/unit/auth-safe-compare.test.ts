// Tests for the HMAC-based constant-time string comparison used by the API
// auth middleware. Verifies equality semantics and length independence.

import { describe, it, expect } from "bun:test";
import { safeCompare } from "../../src/daemon/api/middleware/auth.js";

describe("safeCompare", () => {
  it("returns true for identical strings", () => {
    expect(safeCompare("secret123", "secret123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(safeCompare("secret123", "secret124")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(safeCompare("secret", "secret123")).toBe(false);
    expect(safeCompare("secret123", "secret")).toBe(false);
  });

  it("returns false for an empty vs non-empty string", () => {
    expect(safeCompare("", "x")).toBe(false);
    expect(safeCompare("x", "")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(safeCompare("", "")).toBe(true);
  });

  it("handles long strings (bearer tokens)", () => {
    const a = "a".repeat(512);
    const b = "a".repeat(512);
    const c = "a".repeat(511) + "b";
    expect(safeCompare(a, b)).toBe(true);
    expect(safeCompare(a, c)).toBe(false);
  });

  it("handles multi-byte UTF-8 identically", () => {
    expect(safeCompare("héllo-🚀", "héllo-🚀")).toBe(true);
    expect(safeCompare("héllo-🚀", "héllo-🎯")).toBe(false);
  });
});
