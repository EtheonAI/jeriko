/**
 * Tests for TUI formatting utilities — tokens, cost, duration, context usage.
 */

import { describe, test, expect } from "bun:test";
import {
  formatTokens,
  estimateCost,
  formatCost,
  formatDuration,
  formatContextUsage,
} from "../../../src/cli/tui/lib/format.js";

// ---------------------------------------------------------------------------
// formatTokens
// ---------------------------------------------------------------------------

describe("formatTokens", () => {
  test("formats small numbers as-is", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(999)).toBe("999");
  });

  test("formats thousands with K suffix and one decimal under 10K", () => {
    expect(formatTokens(1000)).toBe("1.0K");
    expect(formatTokens(1200)).toBe("1.2K");
    expect(formatTokens(5500)).toBe("5.5K");
    expect(formatTokens(9999)).toBe("10.0K");
  });

  test("formats large numbers with K suffix, no decimal", () => {
    expect(formatTokens(10000)).toBe("10K");
    expect(formatTokens(15000)).toBe("15K");
    expect(formatTokens(150000)).toBe("150K");
    expect(formatTokens(1000000)).toBe("1000K");
  });
});

// ---------------------------------------------------------------------------
// estimateCost
// ---------------------------------------------------------------------------

describe("estimateCost", () => {
  test("zero tokens = zero cost", () => {
    expect(estimateCost(0, 0)).toBe(0);
  });

  test("calculates with default rates", () => {
    // $3/M input + $15/M output
    const cost = estimateCost(1_000_000, 1_000_000);
    expect(cost).toBe(18);
  });

  test("input-only cost", () => {
    const cost = estimateCost(1_000_000, 0);
    expect(cost).toBe(3);
  });

  test("output-only cost", () => {
    const cost = estimateCost(0, 1_000_000);
    expect(cost).toBe(15);
  });

  test("custom rates", () => {
    const cost = estimateCost(1_000_000, 1_000_000, 1, 5);
    expect(cost).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// formatCost
// ---------------------------------------------------------------------------

describe("formatCost", () => {
  test("formats zero", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  test("formats small amounts", () => {
    expect(formatCost(0.005)).toBe("$0.01");
    expect(formatCost(0.12)).toBe("$0.12");
  });

  test("formats larger amounts", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(99.99)).toBe("$99.99");
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  test("negative values return 0s", () => {
    expect(formatDuration(-100)).toBe("0s");
  });

  test("sub-second durations show one decimal", () => {
    expect(formatDuration(500)).toBe("0.5s");
    expect(formatDuration(100)).toBe("0.1s");
  });

  test("seconds under 10 show one decimal", () => {
    expect(formatDuration(2300)).toBe("2.3s");
    expect(formatDuration(9900)).toBe("9.9s");
  });

  test("seconds 10+ show rounded", () => {
    expect(formatDuration(10000)).toBe("10s");
    expect(formatDuration(45000)).toBe("45s");
  });

  test("minutes and seconds", () => {
    expect(formatDuration(60000)).toBe("1m");
    expect(formatDuration(65000)).toBe("1m 5s");
    expect(formatDuration(120000)).toBe("2m");
    expect(formatDuration(150000)).toBe("2m 30s");
  });

  test("hours and minutes", () => {
    expect(formatDuration(3600000)).toBe("1h");
    expect(formatDuration(3660000)).toBe("1h 1m");
    expect(formatDuration(7200000)).toBe("2h");
  });
});

// ---------------------------------------------------------------------------
// formatContextUsage
// ---------------------------------------------------------------------------

describe("formatContextUsage", () => {
  test("returns dash for zero context limit", () => {
    expect(formatContextUsage(100, 0)).toBe("—");
  });

  test("calculates percentage correctly", () => {
    expect(formatContextUsage(5000, 200000)).toBe("3%");
    expect(formatContextUsage(150000, 200000)).toBe("75%");
    expect(formatContextUsage(200000, 200000)).toBe("100%");
  });

  test("rounds to nearest integer", () => {
    expect(formatContextUsage(1, 3)).toBe("33%");
    expect(formatContextUsage(2, 3)).toBe("67%");
  });
});
