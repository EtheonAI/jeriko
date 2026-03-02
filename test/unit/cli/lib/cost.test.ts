/**
 * Tests for model-aware cost estimation.
 */

import { describe, test, expect } from "bun:test";
import {
  getModelRates,
  estimateModelCost,
  formatModelCost,
} from "../../../../src/cli/lib/cost.js";

// ---------------------------------------------------------------------------
// getModelRates
// ---------------------------------------------------------------------------

describe("getModelRates", () => {
  test("returns Claude Sonnet 4 rates", () => {
    const rates = getModelRates("claude-sonnet-4-20250514");
    expect(rates.inputPerMillion).toBe(3);
    expect(rates.outputPerMillion).toBe(15);
  });

  test("returns Claude Opus 4 rates", () => {
    const rates = getModelRates("claude-opus-4-20250514");
    expect(rates.inputPerMillion).toBe(15);
    expect(rates.outputPerMillion).toBe(75);
  });

  test("returns Claude 3.5 Haiku rates", () => {
    const rates = getModelRates("claude-3.5-haiku-20241022");
    expect(rates.inputPerMillion).toBe(0.8);
    expect(rates.outputPerMillion).toBe(4);
  });

  test("returns GPT-4o rates", () => {
    const rates = getModelRates("gpt-4o-2024-11-20");
    expect(rates.inputPerMillion).toBe(2.5);
    expect(rates.outputPerMillion).toBe(10);
  });

  test("returns GPT-4o-mini rates", () => {
    const rates = getModelRates("gpt-4o-mini");
    expect(rates.inputPerMillion).toBe(0.15);
    expect(rates.outputPerMillion).toBe(0.6);
  });

  test("returns DeepSeek rates", () => {
    const rates = getModelRates("deepseek-v3");
    expect(rates.inputPerMillion).toBe(0.27);
    expect(rates.outputPerMillion).toBe(1.1);
  });

  test("returns zero for local/ollama models", () => {
    expect(getModelRates("ollama/llama3").inputPerMillion).toBe(0);
    expect(getModelRates("local-model").inputPerMillion).toBe(0);
  });

  test("generic 'claude' falls back to Sonnet-tier pricing", () => {
    const rates = getModelRates("claude");
    expect(rates.inputPerMillion).toBe(3);
    expect(rates.outputPerMillion).toBe(15);
  });

  test("'claude-code' falls back to Sonnet-tier pricing", () => {
    const rates = getModelRates("claude-code");
    expect(rates.inputPerMillion).toBe(3);
    expect(rates.outputPerMillion).toBe(15);
  });

  test("unknown model returns default rates", () => {
    const rates = getModelRates("some-unknown-model-xyz");
    expect(rates.inputPerMillion).toBe(3);
    expect(rates.outputPerMillion).toBe(15);
  });

  test("case-insensitive matching", () => {
    const rates = getModelRates("Claude-Sonnet-4-Latest");
    expect(rates.inputPerMillion).toBe(3);
  });

  test("o-series reasoning models", () => {
    expect(getModelRates("o3-mini").inputPerMillion).toBe(1.1);
    expect(getModelRates("o3").inputPerMillion).toBe(10);
    expect(getModelRates("o1-mini").inputPerMillion).toBe(3);
    expect(getModelRates("o1").inputPerMillion).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// estimateModelCost
// ---------------------------------------------------------------------------

describe("estimateModelCost", () => {
  test("zero tokens = zero cost", () => {
    expect(estimateModelCost(0, 0, "claude-sonnet-4")).toBe(0);
  });

  test("1M input tokens for Claude Sonnet = $3", () => {
    expect(estimateModelCost(1_000_000, 0, "claude-sonnet-4")).toBeCloseTo(3, 2);
  });

  test("1M output tokens for Claude Sonnet = $15", () => {
    expect(estimateModelCost(0, 1_000_000, "claude-sonnet-4")).toBeCloseTo(15, 2);
  });

  test("combined input+output for Opus", () => {
    // 10k in ($0.15) + 5k out ($0.375) = $0.525
    const cost = estimateModelCost(10_000, 5_000, "claude-opus-4");
    expect(cost).toBeCloseTo(0.525, 3);
  });

  test("free for local models", () => {
    expect(estimateModelCost(100_000, 50_000, "ollama/llama3")).toBe(0);
  });

  test("uses model-specific rates", () => {
    const sonnetCost = estimateModelCost(10_000, 5_000, "claude-sonnet-4");
    const opusCost = estimateModelCost(10_000, 5_000, "claude-opus-4");
    expect(opusCost).toBeGreaterThan(sonnetCost);
  });
});

// ---------------------------------------------------------------------------
// formatModelCost
// ---------------------------------------------------------------------------

describe("formatModelCost", () => {
  test("zero → '$0.00'", () => {
    expect(formatModelCost(0)).toBe("$0.00");
  });

  test("normal cost → 2 decimals", () => {
    expect(formatModelCost(1.50)).toBe("$1.50");
    expect(formatModelCost(0.12)).toBe("$0.12");
  });

  test("very small cost → 4 decimals", () => {
    expect(formatModelCost(0.0023)).toBe("$0.0023");
    expect(formatModelCost(0.001)).toBe("$0.0010");
  });

  test("boundary: exactly $0.01 → 2 decimals", () => {
    expect(formatModelCost(0.01)).toBe("$0.01");
  });

  test("large cost → 2 decimals", () => {
    expect(formatModelCost(42.7)).toBe("$42.70");
  });
});
