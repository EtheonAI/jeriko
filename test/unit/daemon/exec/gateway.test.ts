/**
 * Gateway ↔ broker integration tests.
 *
 * These exercise the exec gateway *end-to-end*: lease creation → sandbox
 * check → policy validation → broker consent → sanitized spawn. Every
 * test runs a benign shell command so there's no hidden environmental
 * coupling — just short, side-effect-free calls that a CI box can
 * execute deterministically.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { exec } from "../../../../src/daemon/exec/gateway.js";
import {
  defaultShouldAsk,
  registerBroker,
  type BrokerRequest,
  type PermissionBroker,
} from "../../../../src/daemon/exec/broker.js";
import type { ExecutionLease } from "../../../../src/daemon/exec/lease.js";
import type { RiskLevel } from "../../../../src/shared/types.js";

// Always release the broker after each test — the module-scope registry
// is shared across the suite.
afterEach(() => { registerBroker(null); });

// ---------------------------------------------------------------------------
// Helpers — force lease attributes so the classifier doesn't fight us
// ---------------------------------------------------------------------------

function runAtRisk(command: string, risk: RiskLevel) {
  return exec("test", command, { lease_overrides: { risk, timeout: 5_000 } });
}

interface RecordingBroker {
  readonly broker: PermissionBroker;
  readonly seen: BrokerRequest[];
  setDecision(verdict: boolean | "throw"): void;
}

function recordingBroker(initial: boolean | "throw" = true): RecordingBroker {
  const state = { verdict: initial };
  const seen: BrokerRequest[] = [];
  // Uses the default (medium+) policy so tests exercise the same logic
  // production does. Individual tests override shouldAsk when needed.
  const broker: PermissionBroker = {
    shouldAsk: defaultShouldAsk,
    async ask(req) {
      seen.push(req);
      if (state.verdict === "throw") throw new Error("broker crashed");
      return state.verdict;
    },
  };
  return {
    broker,
    seen,
    setDecision(v) { state.verdict = v; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("gateway + broker — low-risk leases run without consent", () => {
  test("broker is not consulted for low-risk reads", async () => {
    const rec = recordingBroker(false); // would deny if asked
    registerBroker(rec.broker);

    const result = await runAtRisk("true", "low");
    expect(result.exit_code).toBe(0);
    expect(rec.seen).toEqual([]);
  });
});

describe("gateway + broker — medium+ leases consult the broker", () => {
  test("allow verdict proceeds to spawn", async () => {
    const rec = recordingBroker(true);
    registerBroker(rec.broker);

    const result = await runAtRisk("true", "medium");
    expect(result.exit_code).toBe(0);
    expect(rec.seen).toHaveLength(1);
    expect(rec.seen[0]!.lease.risk).toBe("medium");
    expect(rec.seen[0]!.leaseId).toBeTruthy();
  });

  test("deny verdict short-circuits to exit 126", async () => {
    const rec = recordingBroker(false);
    registerBroker(rec.broker);

    const result = await runAtRisk("true", "medium");
    expect(result.exit_code).toBe(126);
    expect(result.stderr.toLowerCase()).toContain("denied");
    expect(rec.seen).toHaveLength(1);
  });

  test("broker exception is treated as deny, not a crash", async () => {
    const rec = recordingBroker("throw");
    registerBroker(rec.broker);

    const result = await runAtRisk("true", "high");
    expect(result.exit_code).toBe(126);
    expect(rec.seen).toHaveLength(1);
  });

  test("lease_id stays stable between the broker prompt and the exec result", async () => {
    const rec = recordingBroker(true);
    registerBroker(rec.broker);

    const result = await runAtRisk("true", "medium");
    expect(result.lease_id).toBe(rec.seen[0]!.leaseId);
  });

  test("broker receives the full lease so the dialog has context", async () => {
    const rec = recordingBroker(true);
    registerBroker(rec.broker);

    await runAtRisk("echo hello", "medium");

    const request = rec.seen[0]!;
    expect(request.lease.command).toBe("echo hello");
    expect(request.lease.agent).toBe("test");
    expect(request.lease.risk).toBe("medium");
  });
});

describe("gateway — no broker registered", () => {
  test("medium risk still runs when no broker is attached (headless default)", async () => {
    const result = await runAtRisk("true", "medium");
    expect(result.exit_code).toBe(0);
  });
});

describe("gateway — shouldAsk short-circuits the ask path", () => {
  test("broker that declines to ask (shouldAsk=false) never runs ask()", async () => {
    let asked = 0;
    const broker: PermissionBroker = {
      shouldAsk: (lease: ExecutionLease) => lease.risk === "high",
      async ask() { asked++; return true; },
    };
    registerBroker(broker);

    await runAtRisk("true", "medium");
    expect(asked).toBe(0);

    await runAtRisk("true", "high");
    expect(asked).toBe(1);
  });
});
