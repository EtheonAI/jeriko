// Tests for the usage ledger — incremental recording, cost computation,
// and budget gate.

import { describe, it, expect } from "bun:test";
import {
  UsageLedger,
  BudgetExceededError,
  cacheSavingsRatio,
} from "../../../src/daemon/agent/usage/index.js";

describe("UsageLedger", () => {
  it("starts with zero totals", () => {
    const l = new UsageLedger({ backend: "anthropic", model: "claude-sonnet-4-6" });
    expect(l.totals.input_tokens).toBe(0);
    expect(l.totals.output_tokens).toBe(0);
    expect(l.totals.responses).toBe(0);
  });

  it("records deltas between cumulative snapshots", () => {
    const l = new UsageLedger({ backend: "anthropic", model: "claude-sonnet-4-6" });
    l.startResponse();
    l.record({ input_tokens: 100, output_tokens: 10 });
    l.record({ input_tokens: 100, output_tokens: 50 });
    expect(l.totals.input_tokens).toBe(100); // cumulative, not summed
    expect(l.totals.output_tokens).toBe(50);
    expect(l.totals.responses).toBe(1);
  });

  it("accumulates across responses", () => {
    const l = new UsageLedger({ backend: "anthropic", model: "claude-sonnet-4-6" });
    l.startResponse();
    l.record({ input_tokens: 200, output_tokens: 30 });
    l.startResponse();
    l.record({ input_tokens: 100, output_tokens: 20 });
    expect(l.totals.input_tokens).toBe(300);
    expect(l.totals.output_tokens).toBe(50);
    expect(l.totals.responses).toBe(2);
  });

  it("tracks cache read/write separately from regular input", () => {
    const l = new UsageLedger({ backend: "anthropic", model: "claude-sonnet-4-6" });
    l.startResponse();
    l.record({
      input_tokens: 100,
      output_tokens: 10,
      cache_creation_input_tokens: 500,
      cache_read_input_tokens: 200,
    });
    expect(l.totals.cache_creation_input_tokens).toBe(500);
    expect(l.totals.cache_read_input_tokens).toBe(200);
  });

  it("enforces maxBudgetUsd and throws BudgetExceededError", () => {
    const l = new UsageLedger({
      backend: "anthropic",
      model: "claude-sonnet-4-6",
      maxBudgetUsd: 0.00001, // absurdly low — trips on any real tokens
    });
    l.startResponse();
    expect(() => l.record({ input_tokens: 100_000, output_tokens: 50_000 })).toThrow(
      BudgetExceededError,
    );
  });

  it("computes positive cache savings when cache_read > cache_create", () => {
    const l = new UsageLedger({ backend: "anthropic", model: "claude-sonnet-4-6" });
    l.startResponse();
    l.record({
      input_tokens: 100,
      output_tokens: 10,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 900,
    });
    const savings = cacheSavingsRatio(l.cost());
    // Heavy read + light create → high savings vs paying full rate on all 1000 cache tokens
    expect(savings).toBeGreaterThan(0.5);
  });

  it("ignores empty usage snapshots", () => {
    const l = new UsageLedger({ backend: "anthropic", model: "claude-sonnet-4-6" });
    l.startResponse();
    l.record({});
    expect(l.totals.input_tokens).toBe(0);
  });

  it("exposes model descriptor for statusline", () => {
    const l = new UsageLedger({ backend: "anthropic", model: "claude-sonnet-4-6" });
    const m = l.describeModel();
    expect(typeof m.provider).toBe("string");
    expect(typeof m.id).toBe("string");
  });
});
