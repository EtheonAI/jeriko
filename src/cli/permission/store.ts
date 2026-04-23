/**
 * Permission Subsystem — reactive store.
 *
 * A per-app instance (not a global singleton) that owns:
 *   - a FIFO queue of pending PermissionRequests.
 *   - the in-memory session rule list (grows from `allow-session` choices).
 *   - the persistent rule list (seeded at construction; mutated when users
 *     pick `allow-always` / `deny-always`).
 *   - a pending-resolver map: each enqueue returns a Promise the caller
 *     awaits for the final "allow" / "deny" boolean.
 *
 * On enqueue:
 *   1. Run matcher.evaluate — auto-resolve from existing rules if possible.
 *   2. Otherwise add to queue, create a pending promise, return it.
 *
 * On resolve:
 *   - Update rule lists per decision lifetime (session / always).
 *   - Fire the pending resolver with the allow/deny boolean.
 *   - If the resolved request created a new rule, re-run auto-matching
 *     across everyone else still in the queue — subsequent requests
 *     matching the fresh rule resolve automatically.
 *
 * Nothing about persistence to disk — callers hand a persister callback
 * at construction (`onPersistentChange`) so the store remains pure.
 */

import type {
  PermissionDecision,
  PermissionRequest,
  PermissionRule,
  PermissionSnapshot,
} from "./types.js";
import { isAllow, persistsToDisk } from "./types.js";
import { evaluate, targetFor } from "./matcher.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PermissionStore {
  /**
   * Enqueue a request. Returns a promise that resolves to true (allow)
   * or false (deny) once the user (or an existing rule) decides.
   */
  enqueue(request: PermissionRequest): Promise<boolean>;
  /** Resolve the request at the head of the queue. */
  resolve(requestId: string, decision: PermissionDecision): void;
  /** Snapshot of queue + rules for UI consumers. */
  snapshot(): PermissionSnapshot;
  /** Subscribe to any change (queue or rules). */
  subscribe(listener: () => void): () => void;
  /** Drop every pending request as deny-once — used on app shutdown. */
  rejectAllPending(reason?: string): void;
}

export interface StoreOptions {
  /** Persistent rules loaded from disk at startup. */
  readonly initialPersistentRules?: readonly PermissionRule[];
  /** Called whenever the persistent rule list changes — the caller persists. */
  readonly onPersistentChange?: (rules: readonly PermissionRule[]) => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPermissionStore(opts: StoreOptions = {}): PermissionStore {
  type Pending = {
    readonly request: PermissionRequest;
    readonly resolve: (allowed: boolean) => void;
  };

  const queue: Pending[] = [];
  let sessionRules: PermissionRule[] = [];
  let persistentRules: PermissionRule[] = [...(opts.initialPersistentRules ?? [])];
  const subscribers = new Set<() => void>();

  // Snapshot caching: useSyncExternalStore expects a stable reference when
  // the underlying state has not changed. We rebuild the snapshot once per
  // state change and hand the same object out until the next change.
  let cachedSnapshot: PermissionSnapshot | null = null;
  const invalidateSnapshot = (): void => { cachedSnapshot = null; };

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  const notify = (): void => {
    invalidateSnapshot();
    for (const listener of [...subscribers]) listener();
  };

  const emitPersistentChange = (): void => {
    if (opts.onPersistentChange !== undefined) {
      opts.onPersistentChange([...persistentRules]);
    }
  };

  /** Apply an allow/deny decision's persistence semantics to rule state. */
  const applyDecisionToRules = (request: PermissionRequest, decision: PermissionDecision): void => {
    const rule: PermissionRule = {
      kind: request.body.kind,
      target: targetFor(request),
      decision: isAllow(decision) ? "allow" : "deny",
      origin: persistsToDisk(decision) ? "persistent" : "session",
    };
    if (persistsToDisk(decision)) {
      persistentRules = [...persistentRules, rule];
      emitPersistentChange();
    } else if (decision === "allow-session") {
      sessionRules = [...sessionRules, rule];
    }
    // deny-once: no rule stored; next identical request asks again.
    // allow-once: no rule stored.
  };

  /**
   * Drain any queued requests that now match an existing rule. Called after
   * a new rule was added — lets a batch of identical pending requests all
   * resolve from a single user decision.
   */
  const drainAutoMatches = (): void => {
    if (queue.length === 0) return;

    const stillWaiting: Pending[] = [];
    const autoResolved: Array<{ pending: Pending; allowed: boolean }> = [];

    for (const pending of queue) {
      const auto = evaluate({
        request: pending.request,
        sessionRules,
        persistentRules,
      });
      if (auto === null) {
        stillWaiting.push(pending);
      } else {
        autoResolved.push({ pending, allowed: auto === "allow" });
      }
    }

    if (autoResolved.length === 0) return;

    queue.length = 0;
    queue.push(...stillWaiting);
    for (const { pending, allowed } of autoResolved) pending.resolve(allowed);
    // Listeners are notified by the outer `resolve` path.
  };

  // -------------------------------------------------------------------------
  // Public surface
  // -------------------------------------------------------------------------

  const enqueue: PermissionStore["enqueue"] = (request) => {
    const auto = evaluate({ request, sessionRules, persistentRules });
    if (auto !== null) {
      // No state change — skip notify.
      return Promise.resolve(auto === "allow");
    }

    return new Promise<boolean>((resolveFn) => {
      queue.push({ request, resolve: resolveFn });
      notify();
    });
  };

  const resolve: PermissionStore["resolve"] = (requestId, decision) => {
    const idx = queue.findIndex((p) => p.request.id === requestId);
    if (idx === -1) return;

    const pending = queue[idx]!;
    queue.splice(idx, 1);

    applyDecisionToRules(pending.request, decision);
    pending.resolve(isAllow(decision));

    // A newly-added rule may cover other pending requests.
    drainAutoMatches();
    notify();
  };

  const snapshot: PermissionStore["snapshot"] = () => {
    if (cachedSnapshot !== null) return cachedSnapshot;
    cachedSnapshot = {
      queue: queue.map((p) => p.request),
      sessionRules: [...sessionRules],
      persistentRules: [...persistentRules],
    };
    return cachedSnapshot;
  };

  const subscribe: PermissionStore["subscribe"] = (listener) => {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  };

  const rejectAllPending: PermissionStore["rejectAllPending"] = () => {
    const pending = [...queue];
    queue.length = 0;
    for (const p of pending) p.resolve(false);
    if (pending.length > 0) notify();
  };

  return { enqueue, resolve, snapshot, subscribe, rejectAllPending };
}
