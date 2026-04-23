/**
 * computeCost() and the cache-multiplier contract.
 *
 * The two guarantees exercised here:
 *
 *   1. Cache read + cache write multipliers come from
 *      `ModelCapabilities.cacheReadRatio` / `.cacheWriteRatio`, not from
 *      a hardcoded constant. Passing a different provider must yield
 *      a different cost.
 *   2. When the capability lookup returns defaults (unknown provider,
 *      local model), cost math stays finite — no NaN, no Infinity,
 *      zero when rates are zero.
 */

import { describe, test, expect, spyOn, afterEach } from "bun:test";
import { computeCost } from "../../../src/daemon/agent/usage/cost.js";
import * as models from "../../../src/daemon/agent/drivers/models.js";
import type { ModelCapabilities } from "../../../src/daemon/agent/drivers/models.js";

function caps(overrides: Partial<ModelCapabilities>): ModelCapabilities {
  return {
    id: "test",
    provider: "test",
    family: "test",
    context: 200_000,
    maxOutput: 8_192,
    toolCall: true,
    reasoning: false,
    vision: false,
    structuredOutput: true,
    costInput: 3,
    costOutput: 15,
    cacheReadRatio: 0.1,
    cacheWriteRatio: 1.25,
    usageShape: "anthropic",
    ...overrides,
  };
}

describe("computeCost", () => {
  let spy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    spy?.mockRestore();
    spy = undefined;
  });

  function stubCaps(c: ModelCapabilities) {
    spy = spyOn(models, "getCapabilities").mockReturnValue(c);
  }

  test("anthropic-style: cache_read at 0.10×, cache_write at 1.25×", () => {
    stubCaps(caps({ provider: "anthropic", cacheReadRatio: 0.1, cacheWriteRatio: 1.25 }));

    const cost = computeCost({
      backend: "anthropic",
      model: "claude-sonnet-4-6",
      totals: {
        input_tokens: 1_000_000,
        output_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
      },
    });

    // input: 1M * 3$ / 1M = 3
    // cache_creation: 1M * 3 * 1.25 = 3.75
    // cache_read: 1M * 3 * 0.10 = 0.30
    expect(cost.inputUsd).toBeCloseTo(3, 6);
    expect(cost.cacheCreationUsd).toBeCloseTo(3.75, 6);
    expect(cost.cacheReadUsd).toBeCloseTo(0.3, 6);
    expect(cost.totalUsd).toBeCloseTo(7.05, 6);
  });

  test("openai-style: cache_read at 0.50× (not 0.10×)", () => {
    stubCaps(caps({ provider: "openai", cacheReadRatio: 0.5, cacheWriteRatio: 1 }));

    const cost = computeCost({
      backend: "openai",
      model: "gpt-4o",
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 1_000_000,
      },
    });

    // cache_read: 1M * 3 * 0.50 = 1.50
    // If the old hardcoded 0.10 were still in play, this would be 0.30.
    expect(cost.cacheReadUsd).toBeCloseTo(1.5, 6);
  });

  test("local / unknown: zero rates produce zero cost, no NaN", () => {
    stubCaps(caps({
      provider: "local",
      costInput: 0,
      costOutput: 0,
      cacheReadRatio: 0,
      cacheWriteRatio: 0,
      usageShape: "none",
    }));

    const cost = computeCost({
      backend: "local",
      model: "llama3",
      totals: {
        input_tokens: 10_000,
        output_tokens: 2_000,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 500,
      },
    });

    expect(cost.inputUsd).toBe(0);
    expect(cost.outputUsd).toBe(0);
    expect(cost.cacheCreationUsd).toBe(0);
    expect(cost.cacheReadUsd).toBe(0);
    expect(cost.totalUsd).toBe(0);
    expect(Number.isNaN(cost.totalUsd)).toBe(false);
  });

  test("uncachedReferenceUsd counts cached tokens at full input rate", () => {
    stubCaps(caps({ provider: "anthropic" }));

    const cost = computeCost({
      backend: "anthropic",
      model: "claude-sonnet-4-6",
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
      },
    });

    // Without cache: 2M tokens * 3$ / 1M = 6$
    expect(cost.uncachedReferenceUsd).toBeCloseTo(6, 6);
  });
});
