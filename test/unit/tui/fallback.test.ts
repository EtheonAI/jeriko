/**
 * Tests for TUI fallback logic — verifies that non-TTY and JERIKO_NO_TUI
 * environments fall back to the plain readline REPL.
 *
 * These tests check the shouldFallback logic directly without starting
 * the actual TUI or REPL (those require interactive terminals).
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// Helpers — extract the fallback logic for direct testing
// ---------------------------------------------------------------------------

/**
 * Mirrors the shouldFallback() logic from render.tsx.
 * We duplicate it here to avoid importing the actual render module
 * (which would try to load @opentui in test environments).
 */
function shouldFallback(env: Record<string, string | undefined>, isTTY: boolean): boolean {
  if (!isTTY) return true;
  if (env.JERIKO_NO_TUI === "1") return true;
  if (env.TERM === "dumb") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TUI Fallback", () => {
  test("falls back when stdin is not a TTY", () => {
    expect(shouldFallback({}, false)).toBe(true);
  });

  test("falls back when JERIKO_NO_TUI=1", () => {
    expect(shouldFallback({ JERIKO_NO_TUI: "1" }, true)).toBe(true);
  });

  test("falls back when TERM=dumb", () => {
    expect(shouldFallback({ TERM: "dumb" }, true)).toBe(true);
  });

  test("does NOT fall back for normal TTY", () => {
    expect(shouldFallback({}, true)).toBe(false);
  });

  test("does NOT fall back when JERIKO_NO_TUI is unset", () => {
    expect(shouldFallback({ JERIKO_NO_TUI: undefined }, true)).toBe(false);
  });

  test("does NOT fall back when JERIKO_NO_TUI is 0", () => {
    expect(shouldFallback({ JERIKO_NO_TUI: "0" }, true)).toBe(false);
  });

  test("does NOT fall back for xterm-256color terminal", () => {
    expect(shouldFallback({ TERM: "xterm-256color" }, true)).toBe(false);
  });

  test("multiple fallback conditions — non-TTY takes priority", () => {
    expect(shouldFallback({ JERIKO_NO_TUI: "0", TERM: "xterm" }, false)).toBe(true);
  });
});
