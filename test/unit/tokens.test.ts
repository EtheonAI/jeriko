import { describe, expect, it } from "bun:test";
import {
  estimateTokens,
  shouldCompact,
  COMPACTION_CONTEXT_RATIO,
  DEFAULT_CONTEXT_LIMIT,
  PRE_TRIM_CONTEXT_RATIO,
  COMPACT_TARGET_RATIO,
  MIN_MESSAGES_FOR_COMPACTION,
} from "../../src/shared/tokens.js";

describe("estimateTokens", () => {
  it("returns a positive number for text", () => {
    const tokens = estimateTokens("Hello, world! This is a test message.");
    expect(tokens).toBeGreaterThan(0);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("longer text produces more tokens", () => {
    const short = estimateTokens("Hello");
    const long = estimateTokens("Hello, this is a much longer message that should produce more tokens");
    expect(long).toBeGreaterThan(short);
  });
});

describe("shouldCompact", () => {
  it("returns false when below compaction threshold", () => {
    // 70% of 10000 = 7000 — below COMPACTION_CONTEXT_RATIO (75%)
    expect(shouldCompact(7000, 10_000)).toBe(false);
  });

  it("returns true when at compaction threshold", () => {
    // Exactly at COMPACTION_CONTEXT_RATIO (75%)
    expect(shouldCompact(7500, 10_000)).toBe(true);
  });

  it("returns true when above compaction threshold", () => {
    expect(shouldCompact(8000, 10_000)).toBe(true);
  });

  it("returns false for zero context limit", () => {
    expect(shouldCompact(1000, 0)).toBe(false);
  });

  it("uses COMPACTION_CONTEXT_RATIO constant", () => {
    const limit = 10_000;
    const threshold = limit * COMPACTION_CONTEXT_RATIO;
    expect(shouldCompact(threshold - 1, limit)).toBe(false);
    expect(shouldCompact(threshold, limit)).toBe(true);
  });
});

describe("context management constants", () => {
  it("exports all required constants", () => {
    expect(DEFAULT_CONTEXT_LIMIT).toBeDefined();
    expect(PRE_TRIM_CONTEXT_RATIO).toBeDefined();
    expect(COMPACTION_CONTEXT_RATIO).toBeDefined();
    expect(COMPACT_TARGET_RATIO).toBeDefined();
    expect(MIN_MESSAGES_FOR_COMPACTION).toBeDefined();
  });
});
