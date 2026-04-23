/**
 * Permission Subsystem — daemon bridge contract.
 *
 * The CLI does not talk directly to the daemon exec-gateway. A thin adapter
 * (the "bridge") translates between the daemon's ExecutionLease protocol
 * and this subsystem's PermissionRequest/PermissionDecision vocabulary.
 *
 * This module defines the bridge *interface only* — the concrete adapter
 * lives in the backend layer (daemon-IPC) and is supplied to the
 * PermissionProvider at construction time. Keeping the interface here
 * means:
 *
 *   1. The CLI subsystem is self-contained — no reach into daemon
 *      internals.
 *   2. Tests and the in-process backend can mock the bridge trivially.
 *   3. The daemon adapter is the single integration point that needs to
 *      change if the lease wire protocol evolves.
 *
 * Responsibility split:
 *   - Daemon adapter: listens for pending-lease events, maps ExecutionLease
 *     → PermissionRequest, calls `bridge.onRequest(request)`. When the
 *     bridge consumer (PermissionProvider) hands back a decision, the
 *     adapter maps it back to LeaseDecision and resolves the daemon-side
 *     waiter.
 *   - CLI subsystem: receives requests via `onRequest`, presents UI,
 *     invokes the resolver the adapter attached to each request.
 *
 * The daemon-side emission of pending lease events is OUT OF SCOPE for
 * this ADR — that change belongs to the exec-gateway. This bridge is the
 * waiting plug; the socket on the other side will land when the gateway
 * is extended to call out for interactive decisions.
 */

import type { PermissionDecision, PermissionRequest } from "./types.js";

/**
 * Handler invoked by the adapter when a new daemon-side lease needs a
 * decision. Expected to return a promise that resolves once the user
 * (or an existing rule) decides. The adapter awaits this to transmit
 * the decision back to the daemon.
 *
 * Implementations (in practice, the PermissionProvider) call
 * `store.enqueue(request)` and return its promise.
 */
export type PermissionRequestHandler = (request: PermissionRequest) => Promise<boolean>;

/**
 * Attach surface the adapter talks to. A single active consumer is the
 * common case (one React provider per app), but the interface does not
 * enforce that — calling `attach` twice with different handlers is the
 * adapter's responsibility to make unambiguous.
 */
export interface PermissionBridge {
  /**
   * Register the request handler. Returns a detach function. Multiple
   * attaches are permitted; the adapter dispatches to the most recent
   * active handler.
   */
  attach(handler: PermissionRequestHandler): () => void;
}

// ---------------------------------------------------------------------------
// In-memory bridge — production in-process backend + tests
// ---------------------------------------------------------------------------

/**
 * Simple instance both sides can share: the adapter calls
 * `bridge.submit(request)`; the consumer handler supplied via `attach`
 * receives it. When no handler is attached, `submit` resolves `false`
 * (deny-once) immediately, matching "no UI available" policy.
 */
export interface InMemoryBridge extends PermissionBridge {
  /**
   * Adapter-facing entry point. Returns the handler's promise, or `false`
   * if nothing is attached.
   */
  submit(request: PermissionRequest): Promise<boolean>;
}

export function createInMemoryBridge(): InMemoryBridge {
  let handler: PermissionRequestHandler | null = null;

  return {
    attach(next): () => void {
      const previous = handler;
      handler = next;
      return () => {
        // Only detach if the current handler is still ours — guards against
        // a late detach racing a replacement.
        if (handler === next) handler = previous;
      };
    },
    async submit(request): Promise<boolean> {
      const active = handler;
      if (active === null) return false;
      return active(request);
    },
  };
}

/**
 * Stub bridge that permits everything without asking. Used as the default
 * when no interactive UI is available (headless / `--format json` / tests
 * that don't care about the permission dialog).
 */
export function createAutoApproveBridge(): InMemoryBridge {
  return {
    attach: () => () => {},
    async submit(): Promise<boolean> { return true; },
  };
}
