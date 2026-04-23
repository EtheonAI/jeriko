/**
 * provider-defaults — typed wire-protocol contract for cache telemetry.
 *
 * Asserting the table values directly keeps the billing-sensitive
 * constants from silently changing. If a provider updates its pricing
 * or adopts a different usage shape, a failing test here is the
 * clearest early signal.
 */

import { describe, test, expect } from "bun:test";
import {
  UNKNOWN_PROVIDER_DEFAULTS,
  getProviderDefaults,
} from "../../../src/daemon/agent/drivers/provider-defaults.js";

describe("provider-defaults", () => {
  test("anthropic — 0.10× cache read, 1.25× cache write, anthropic shape", () => {
    const d = getProviderDefaults("anthropic");
    expect(d.cacheReadRatio).toBe(0.1);
    expect(d.cacheWriteRatio).toBe(1.25);
    expect(d.usageShape).toBe("anthropic");
  });

  test("openai — 0.50× cache read (not Anthropic's 0.10×)", () => {
    const d = getProviderDefaults("openai");
    expect(d.cacheReadRatio).toBe(0.5);
    expect(d.cacheWriteRatio).toBe(1);
    expect(d.usageShape).toBe("openai-inclusive");
  });

  test("openai-compat — safe 1× ratios + OpenAI wire shape", () => {
    const d = getProviderDefaults("openai-compat");
    expect(d.cacheReadRatio).toBe(1);
    expect(d.cacheWriteRatio).toBe(1);
    expect(d.usageShape).toBe("openai-inclusive");
  });

  test("claude-code — inherits Anthropic ratios + shape", () => {
    const d = getProviderDefaults("claude-code");
    expect(d.cacheReadRatio).toBe(0.1);
    expect(d.cacheWriteRatio).toBe(1.25);
    expect(d.usageShape).toBe("anthropic");
  });

  test("local — zeros + no cache telemetry", () => {
    const d = getProviderDefaults("local");
    expect(d.cacheReadRatio).toBe(0);
    expect(d.cacheWriteRatio).toBe(0);
    expect(d.usageShape).toBe("none");
  });

  test("unknown provider returns safe fallback (1× ratios, no normalization)", () => {
    const d = getProviderDefaults("made-up-provider");
    expect(d).toBe(UNKNOWN_PROVIDER_DEFAULTS);
    expect(d.cacheReadRatio).toBe(1);
    expect(d.cacheWriteRatio).toBe(1);
    expect(d.usageShape).toBe("none");
  });
});
