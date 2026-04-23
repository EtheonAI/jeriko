/**
 * Permission Broker — daemon-side consent surface for interactive leases.
 *
 * The broker is the single seam between the execution gateway and an
 * external consent UI (the CLI permission dialog, a future MCP prompt,
 * etc). It answers one question per lease: *should this command run?*
 *
 * Design contract
 * ===============
 *   - The broker is **injected**, not imported by the gateway. The gateway
 *     reads the active instance through {@link getActiveBroker}; callers
 *     register one via {@link registerBroker}. When no broker is
 *     registered the gateway runs leases unchanged — preserving the
 *     headless / test / CI default.
 *   - Only leases for which `broker.shouldAsk(lease)` returns true are
 *     forwarded. This keeps low-risk read commands (listing files,
 *     printing env, etc.) off the consent path so agents don't thrash the
 *     user with noise.
 *   - `broker.ask(lease, lease_id)` returns a Promise<boolean>. It is
 *     up to the broker implementation to decide *how* to obtain consent
 *     (polling a store, routing over WebSocket, reading a policy file…)
 *     and how long to wait. Gateways treat a rejected promise the same
 *     as `false` — deny and audit.
 *
 * The module exports only pure factories and a tiny module-scope registry;
 * no React, no I/O, no daemon-internal imports beyond `ExecutionLease`.
 */

import type { RiskLevel } from "../../shared/types.js";
import type { ExecutionLease } from "./lease.js";
import {
  defaultClassifier,
  type CommandClassifier,
} from "./classifier.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Everything the broker needs to render a consent prompt. Intentionally a
 * stable pair of (lease, lease_id); extending it should be done via a
 * discriminated union rather than optional fields to keep call sites honest.
 */
export interface BrokerRequest {
  readonly lease: ExecutionLease;
  readonly leaseId: string;
}

/**
 * External consent provider. Must be side-effect-free on construction;
 * all I/O happens inside `ask`.
 */
export interface PermissionBroker {
  /** Decide whether this lease needs a consent round trip. */
  shouldAsk(lease: ExecutionLease): boolean;
  /** Collect a decision; resolve `true` to allow, `false` to deny. */
  ask(request: BrokerRequest): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Default policy
// ---------------------------------------------------------------------------

/**
 * Ask thresholds + opt-in auto-approval. Kept as a typed record (not a
 * bare predicate) so future knobs — per-agent overrides, scope-based
 * escalation, allow-lists — have a natural home.
 */
export interface BrokerPolicy {
  /** Minimum risk level at which the broker will prompt the user. */
  readonly askAtOrAbove: RiskLevel;
  /**
   * Command classifier — when the classifier reports an intent in
   * {@link autoApproveIntents}, the lease is auto-approved regardless
   * of its risk level. This removes prompt fatigue on obvious-safe
   * commands (`ls`, `git status`, `cat`, …) without lowering the
   * baseline for anything else.
   *
   * Defaults to the module's {@link defaultClassifier}. Pass a custom
   * classifier (or an empty-rule one) to disable auto-approval entirely.
   */
  readonly classifier: CommandClassifier;
  /** Intents that auto-approve without prompting. */
  readonly autoApproveIntents: ReadonlySet<import("./classifier.js").CommandIntent>;
}

export const DEFAULT_BROKER_POLICY: BrokerPolicy = {
  askAtOrAbove: "medium",
  classifier: defaultClassifier,
  autoApproveIntents: new Set(["read"]),
};

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Pure "should I ask?" predicate matching {@link DEFAULT_BROKER_POLICY}.
 * Exported so broker implementations can delegate to the default and
 * layer additional rules on top without re-implementing the comparison.
 *
 * Precedence (first rule that fires wins):
 *   1. Lease's risk is below `askAtOrAbove`        → don't ask.
 *   2. Classifier recognizes the command as an
 *      auto-approve intent (default: `read`)      → don't ask.
 *   3. Otherwise                                   → ask.
 */
export function defaultShouldAsk(
  lease: ExecutionLease,
  policy: BrokerPolicy = DEFAULT_BROKER_POLICY,
): boolean {
  if (RISK_ORDER[lease.risk] < RISK_ORDER[policy.askAtOrAbove]) return false;

  const intent = policy.classifier.classify(lease.command);
  if (intent !== null && policy.autoApproveIntents.has(intent)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Module-scope registry
// ---------------------------------------------------------------------------
//
// A single active broker per process. The gateway is stateless w.r.t. the
// broker; routing changes are expressed by re-registering. The registry
// is deliberately mutable module state rather than a DI container — the
// gateway must stay reachable from pure tool code that cannot carry a
// context object around.

let activeBroker: PermissionBroker | null = null;

/**
 * Install a broker. Pass `null` to remove the active broker (used on
 * shutdown / test teardown). Returns the previously active broker so the
 * caller can restore it when their ownership ends.
 */
export function registerBroker(broker: PermissionBroker | null): PermissionBroker | null {
  const previous = activeBroker;
  activeBroker = broker;
  return previous;
}

/** Read the active broker, if any. */
export function getActiveBroker(): PermissionBroker | null {
  return activeBroker;
}

// ---------------------------------------------------------------------------
// Convenience — lift an ask(fn) into a {@link PermissionBroker}
// ---------------------------------------------------------------------------

/**
 * Lift a bare `(request) => Promise<boolean>` into a full {@link PermissionBroker}
 * using {@link DEFAULT_BROKER_POLICY}. Most production callers (CLI bridge,
 * remote consent service) only need this — the full interface exists for
 * bespoke shouldAsk rules.
 */
export function brokerFromAsk(
  ask: (request: BrokerRequest) => Promise<boolean>,
  policy: BrokerPolicy = DEFAULT_BROKER_POLICY,
): PermissionBroker {
  return {
    shouldAsk: (lease) => defaultShouldAsk(lease, policy),
    ask,
  };
}
