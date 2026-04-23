// Compaction module tests — threshold detection, truncation path, reactive
// recognition. Summarization is exercised through a stubbed driver so we
// never hit the network.

import { describe, it, expect } from "bun:test";
import {
  autoCompact,
  shouldAutoCompact,
  isOversizedError,
  reactiveCompact,
  mergePolicy,
  DEFAULT_COMPACTION_POLICY,
} from "../../../src/daemon/agent/compaction/index.js";
import type { DriverMessage } from "../../../src/daemon/agent/drivers/index.js";

function buildHistory(turnCount: number, bytesPerTurn: number): DriverMessage[] {
  const filler = "x".repeat(bytesPerTurn);
  const out: DriverMessage[] = [{ role: "system", content: "sys prompt" }];
  for (let i = 0; i < turnCount; i++) {
    out.push({ role: "user", content: `user turn ${i} ${filler}` });
    out.push({ role: "assistant", content: `assistant turn ${i} ${filler}` });
  }
  return out;
}

describe("shouldAutoCompact", () => {
  it("returns false when below the threshold", () => {
    const messages = buildHistory(3, 20);
    expect(shouldAutoCompact(messages, 10_000, DEFAULT_COMPACTION_POLICY)).toBe(false);
  });

  it("returns true when above the threshold", () => {
    const messages = buildHistory(40, 800);
    const result = shouldAutoCompact(messages, 4_000, DEFAULT_COMPACTION_POLICY);
    expect(result).toBe(true);
  });

  it("respects minMessages gate", () => {
    const messages = buildHistory(1, 5000); // very few messages
    const policy = { ...DEFAULT_COMPACTION_POLICY, minMessages: 10 };
    expect(shouldAutoCompact(messages, 4000, policy)).toBe(false);
  });
});

describe("autoCompact (truncation only, summarize=false)", () => {
  it("trims oldest turns and returns turnsRemoved > 0", async () => {
    const messages = buildHistory(25, 400);
    const policy = mergePolicy({ summarize: false });
    const result = await autoCompact({
      messages,
      contextLimit: 4_000,
      policy,
      backend: "anthropic",
      model: "claude-sonnet-4-6",
    });
    expect(result.turnsRemoved).toBeGreaterThan(0);
    expect(result.strategy).toBe("truncate");
    expect(result.afterTokens).toBeLessThan(result.beforeTokens);
  });

  it("no-ops when nothing needs to be dropped", async () => {
    const messages = buildHistory(2, 10);
    const policy = mergePolicy({ summarize: false });
    const result = await autoCompact({
      messages,
      contextLimit: 100_000,
      policy,
      backend: "anthropic",
      model: "claude-sonnet-4-6",
    });
    expect(result.turnsRemoved).toBe(0);
    expect(result.strategy).toBe("none");
  });
});

describe("reactiveCompact", () => {
  it("uses a tighter target ratio than auto", async () => {
    const messages = buildHistory(30, 400);
    const policy = mergePolicy({ summarize: false });
    const result = await reactiveCompact({
      messages,
      contextLimit: 16_000,
      policy,
      backend: "anthropic",
      model: "claude-sonnet-4-6",
    });
    expect(result.strategy).toBe("reactive");
    // Aggressive squeeze — afterTokens should be ≤ 25% of contextLimit.
    expect(result.afterTokens).toBeLessThanOrEqual(Math.floor(16_000 * 0.25));
  });
});

describe("isOversizedError", () => {
  it("matches HTTP 413 substrings", () => {
    expect(isOversizedError(new Error("Anthropic API error 413: Request too large"))).toBe(true);
    expect(isOversizedError(new Error("HTTP 500: internal server error"))).toBe(false);
  });

  it("matches OpenAI context-length messages", () => {
    expect(
      isOversizedError(new Error("context length would be exceeded: 200000 tokens")),
    ).toBe(true);
  });

  it("matches Anthropic prompt-too-long messages", () => {
    expect(isOversizedError(new Error("prompt is too long: 200000 tokens"))).toBe(true);
  });

  it("returns false for non-errors", () => {
    expect(isOversizedError(undefined)).toBe(false);
    expect(isOversizedError(null)).toBe(false);
    expect(isOversizedError("")).toBe(false);
  });
});
