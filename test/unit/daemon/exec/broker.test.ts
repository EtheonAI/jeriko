/**
 * Tests for the PermissionBroker registry + default policy.
 *
 * These cover the *module-scope* behaviour (registerBroker / getActiveBroker)
 * and the pure classifier (defaultShouldAsk / brokerFromAsk) without
 * spinning up the gateway — gateway integration lives in gateway.test.ts.
 */

import { describe, test, expect, afterEach } from "bun:test";
import {
  brokerFromAsk,
  defaultShouldAsk,
  DEFAULT_BROKER_POLICY,
  getActiveBroker,
  registerBroker,
  type BrokerRequest,
  type PermissionBroker,
} from "../../../../src/daemon/exec/broker.js";
import type { ExecutionLease } from "../../../../src/daemon/exec/lease.js";
import type { RiskLevel } from "../../../../src/shared/types.js";

// Ensure tests never leak the registry state across iterations.
afterEach(() => { registerBroker(null); });

function lease(partial: Partial<ExecutionLease> = {}): ExecutionLease {
  return {
    agent: "test",
    command: "ls -la",
    risk: "low",
    scope: "read",
    network: "none",
    rw_mode: "readonly",
    timeout: 5_000,
    ...partial,
  };
}

describe("defaultShouldAsk", () => {
  test("low risk never asks", () => {
    expect(defaultShouldAsk(lease({ risk: "low" }))).toBe(false);
  });

  test("medium + high risk ask under the default policy", () => {
    expect(defaultShouldAsk(lease({ risk: "medium" }))).toBe(true);
    expect(defaultShouldAsk(lease({ risk: "high" }))).toBe(true);
  });

  test("critical risk also asks (gateway will still deny it)", () => {
    expect(defaultShouldAsk(lease({ risk: "critical" }))).toBe(true);
  });

  test("custom policies raise the threshold", () => {
    const policy = { askAtOrAbove: "high" as RiskLevel };
    expect(defaultShouldAsk(lease({ risk: "medium" }), policy)).toBe(false);
    expect(defaultShouldAsk(lease({ risk: "high" }), policy)).toBe(true);
  });

  test("DEFAULT_BROKER_POLICY threshold is medium", () => {
    expect(DEFAULT_BROKER_POLICY.askAtOrAbove).toBe("medium");
  });
});

describe("brokerFromAsk", () => {
  test("wraps a bare ask function + default policy", async () => {
    const seen: BrokerRequest[] = [];
    const broker = brokerFromAsk(async (req) => { seen.push(req); return true; });

    expect(broker.shouldAsk(lease({ risk: "medium" }))).toBe(true);
    expect(broker.shouldAsk(lease({ risk: "low" }))).toBe(false);

    const decision = await broker.ask({ lease: lease(), leaseId: "abc" });
    expect(decision).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.leaseId).toBe("abc");
  });
});

describe("registerBroker", () => {
  test("registry starts empty and round-trips the active broker", () => {
    expect(getActiveBroker()).toBeNull();

    const broker: PermissionBroker = {
      shouldAsk: () => true,
      ask: async () => true,
    };
    const prev = registerBroker(broker);
    expect(prev).toBeNull();
    expect(getActiveBroker()).toBe(broker);
  });

  test("registering another broker returns the previous one", () => {
    const a: PermissionBroker = { shouldAsk: () => true, ask: async () => true };
    const b: PermissionBroker = { shouldAsk: () => false, ask: async () => false };
    registerBroker(a);
    const prev = registerBroker(b);
    expect(prev).toBe(a);
    expect(getActiveBroker()).toBe(b);
  });

  test("registering null clears the registry", () => {
    registerBroker({ shouldAsk: () => true, ask: async () => true });
    registerBroker(null);
    expect(getActiveBroker()).toBeNull();
  });
});
