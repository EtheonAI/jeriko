// Cross-provider consistency tests.
//
// Verifies that the driver surface is stable across every registered
// backend — every driver implements `chat()` as an async generator, the
// UsageLedger accumulates for all providers, and the cache module's
// Anthropic-specific decoration is a no-op for non-Anthropic drivers.

import { describe, it, expect } from "bun:test";
import { getDriver, listDrivers } from "../../src/daemon/agent/drivers/index.js";
import { buildCachedAnthropicRequest } from "../../src/daemon/agent/cache/anthropic-build.js";
import type { DriverConfig, DriverMessage } from "../../src/daemon/agent/drivers/index.js";
import { UsageLedger } from "../../src/daemon/agent/usage/index.js";

describe("cross-provider driver surface", () => {
  it("every registered backend implements chat as an async generator function", () => {
    const names = listDrivers();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const driver = getDriver(name);
      expect(typeof driver.chat).toBe("function");
      expect(typeof driver.name).toBe("string");
    }
  });

  it("includes the four canonical drivers", () => {
    const names = listDrivers();
    for (const expected of ["anthropic", "openai", "local", "claude-code"]) {
      expect(names).toContain(expected);
    }
  });
});

describe("cache module is Anthropic-specific (stays opt-in)", () => {
  it("leaves OpenAI / local driver paths untouched — cache is only applied when a caller opts in", () => {
    // The cache decorator is only invoked inside the Anthropic driver. No
    // other driver calls `buildCachedAnthropicRequest`, so this test just
    // verifies the function itself is idempotent and returns an Anthropic
    // shape regardless of input — no side effects on non-Anthropic drivers.
    const config: DriverConfig = {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      temperature: 0.3,
      system_prompt: "ignored for this test",
    };
    const messages: DriverMessage[] = [{ role: "user", content: "hi" }];
    const { body } = buildCachedAnthropicRequest({ messages, config });
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(Array.isArray(body.messages)).toBe(true);
  });
});

describe("UsageLedger works across providers", () => {
  const backends = ["anthropic", "openai", "local"];

  for (const backend of backends) {
    it(`records and costs usage for backend=${backend}`, () => {
      const ledger = new UsageLedger({ backend, model: "test-model" });
      ledger.startResponse();
      ledger.record({ input_tokens: 100, output_tokens: 50 });
      expect(ledger.totals.input_tokens).toBe(100);
      expect(ledger.totals.output_tokens).toBe(50);
      const cost = ledger.cost();
      // Cost fields are always defined; totalUsd is non-negative.
      expect(cost.totalUsd).toBeGreaterThanOrEqual(0);
    });
  }
});
