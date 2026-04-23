/**
 * Tests for the CLI ↔ daemon permission-broker adapter.
 *
 * Covers the pure lease→request mapper and the bridge-round-trip through
 * the in-memory bridge. No React, no network, no actual gateway.
 */

import { describe, test, expect } from "bun:test";
import {
  createBrokerFromBridge,
  leaseToRequest,
} from "../../../../src/cli/permission/daemon-broker.js";
import { createInMemoryBridge } from "../../../../src/cli/permission/bridge.js";
import type { ExecutionLease } from "../../../../src/daemon/exec/lease.js";
import type { BrokerRequest } from "../../../../src/daemon/exec/broker.js";
import type { PermissionRequest } from "../../../../src/cli/permission/types.js";

function lease(partial: Partial<ExecutionLease> = {}): ExecutionLease {
  return {
    agent: "agent:claude",
    command: "echo hi",
    risk: "medium",
    scope: "read",
    network: "none",
    rw_mode: "readonly",
    timeout: 5_000,
    ...partial,
  };
}

function brokerReq(lease: ExecutionLease, leaseId = "lease-123"): BrokerRequest {
  return { lease, leaseId };
}

// ---------------------------------------------------------------------------
// leaseToRequest — pure mapper
// ---------------------------------------------------------------------------

describe("leaseToRequest", () => {
  test("copies the core fields into a bash-kinded request", () => {
    const req = leaseToRequest(lease({ command: "ls -la", risk: "high" }), "id-1");
    expect(req.id).toBe("id-1");
    expect(req.body.kind).toBe("bash");
    if (req.body.kind !== "bash") throw new Error("unexpected kind");
    expect(req.body.command).toBe("ls -la");
    expect(req.risk).toBe("high");
    expect(req.agent).toBe("agent:claude");
  });

  test("truncates long commands in the summary field", () => {
    const longCmd = "echo " + "a".repeat(500);
    const req = leaseToRequest(lease({ command: longCmd }), "id-2");
    expect(req.summary.length).toBeLessThanOrEqual(120);
    expect(req.summary.endsWith("…")).toBe(true);
  });

  test("passes through the session id when present", () => {
    const req = leaseToRequest(lease({ session: "sess-99" }), "id-3");
    expect(req.sessionId).toBe("sess-99");
  });

  test("falls back to an empty session id when the lease has none", () => {
    const req = leaseToRequest(lease({ session: undefined }), "id-4");
    expect(req.sessionId).toBe("");
  });

  test("generates a stable-but-unique id when none supplied", () => {
    const a = leaseToRequest(lease());
    const b = leaseToRequest(lease());
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// createBrokerFromBridge — bridge round-trip
// ---------------------------------------------------------------------------

describe("createBrokerFromBridge", () => {
  test("ask routes through the bridge and forwards the handler's decision", async () => {
    const bridge = createInMemoryBridge();
    const broker = createBrokerFromBridge(bridge);

    const received: PermissionRequest[] = [];
    bridge.attach(async (req) => {
      received.push(req);
      return true;
    });

    const allowed = await broker.ask(brokerReq(lease({ command: "npm install" })));
    expect(allowed).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]!.body.kind).toBe("bash");
    if (received[0]!.body.kind !== "bash") return;
    expect(received[0]!.body.command).toBe("npm install");
  });

  test("forwards a deny verdict", async () => {
    const bridge = createInMemoryBridge();
    const broker = createBrokerFromBridge(bridge);
    bridge.attach(async () => false);

    const allowed = await broker.ask(brokerReq(lease()));
    expect(allowed).toBe(false);
  });

  test("resolves false when no CLI handler is attached (no-UI policy)", async () => {
    const bridge = createInMemoryBridge();
    const broker = createBrokerFromBridge(bridge);

    const allowed = await broker.ask(brokerReq(lease()));
    expect(allowed).toBe(false);
  });

  test("adopts the default (medium+) shouldAsk policy", () => {
    const bridge = createInMemoryBridge();
    const broker = createBrokerFromBridge(bridge);

    // Pick a command the default classifier cannot categorize as
    // read-intent, otherwise the auto-approve shortcut bypasses the
    // risk check we're actually trying to exercise here.
    const cmd = "my-custom-binary --run";
    expect(broker.shouldAsk(lease({ command: cmd, risk: "low" }))).toBe(false);
    expect(broker.shouldAsk(lease({ command: cmd, risk: "medium" }))).toBe(true);
    expect(broker.shouldAsk(lease({ command: cmd, risk: "high" }))).toBe(true);
  });

  test("end-to-end: broker + store + bridge produces a single round trip", async () => {
    const bridge = createInMemoryBridge();
    const broker = createBrokerFromBridge(bridge);

    // A handler that resolves the request by id.
    const decisions = new Map<string, boolean>();
    bridge.attach(async (req) => decisions.get(req.id) ?? false);

    // Pre-seed a decision for a specific lease.
    decisions.set("lease-seed", true);

    const allowed = await broker.ask(brokerReq(lease(), "lease-seed"));
    expect(allowed).toBe(true);
  });
});
