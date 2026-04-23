/**
 * Daemon ↔ CLI permission bridge adapter.
 *
 * The daemon's execution gateway reaches for a {@link PermissionBroker}
 * before spawning medium+/high-risk commands. The CLI's permission
 * subsystem speaks {@link PermissionRequest} / {@link PermissionDecision}
 * — a higher-level vocabulary fit for rendering. This module is the
 * translator between the two.
 *
 * Design
 * ======
 *   - Stateless: the adapter holds no caches, no queues, no retries.
 *     Every `ask` maps one lease → one request → one decision.
 *   - One-way dependency: the adapter imports from both subsystems, but
 *     neither subsystem imports the adapter. This keeps the daemon
 *     gateway and the CLI store swappable in isolation.
 *   - Test-friendly: the kind classifier and the {@link leaseToRequest}
 *     mapper are exported as pure functions so tests can assert on the
 *     wire shape without registering a real broker.
 */

import { randomUUID } from "node:crypto";

import type { ExecutionLease } from "../../daemon/exec/lease.js";
import type { BrokerRequest, PermissionBroker } from "../../daemon/exec/broker.js";
import { defaultShouldAsk } from "../../daemon/exec/broker.js";

import type { InMemoryBridge } from "./bridge.js";
import type {
  BashRequestBody,
  PermissionRequest,
  RiskLevel,
} from "./types.js";

// ---------------------------------------------------------------------------
// Lease → PermissionRequest mapper
// ---------------------------------------------------------------------------

/**
 * Shape a lease as a {@link PermissionRequest} the CLI permission subsystem
 * can render. Every lease coming through the exec gateway is shell-shaped
 * today, so the body is always a {@link BashRequestBody}. The `id` is the
 * wait-handle the store uses to route the user's decision back — we prefer
 * the caller-supplied leaseId but fall back to a UUID so the mapper stays
 * safe if called outside the gateway.
 */
export function leaseToRequest(
  lease: ExecutionLease,
  leaseId: string = randomUUID(),
): PermissionRequest {
  const body: BashRequestBody = {
    kind: "bash",
    command: lease.command,
  };
  return {
    id: leaseId,
    agent: lease.agent,
    sessionId: lease.session ?? "",
    risk: lease.risk as RiskLevel,
    summary: summarize(lease),
    issuedAt: Date.now(),
    body,
  };
}

function summarize(lease: ExecutionLease): string {
  const head = lease.command.length > 120
    ? `${lease.command.slice(0, 117)}…`
    : lease.command;
  return head;
}

// ---------------------------------------------------------------------------
// Factory — wrap an {@link InMemoryBridge} as a {@link PermissionBroker}
// ---------------------------------------------------------------------------

/**
 * Build a broker that routes every consent request through the supplied
 * in-memory bridge. When no CLI handler is attached to the bridge,
 * `bridge.submit` resolves `false` — so the gateway deny-audits and
 * refuses execution, matching the "no UI available" policy.
 */
export function createBrokerFromBridge(bridge: InMemoryBridge): PermissionBroker {
  return {
    shouldAsk: defaultShouldAsk,
    async ask(request: BrokerRequest): Promise<boolean> {
      const dialogRequest = leaseToRequest(request.lease, request.leaseId);
      return bridge.submit(dialogRequest);
    },
  };
}
