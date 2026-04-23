/**
 * Permission Subsystem — React provider + hooks.
 *
 * The provider owns a PermissionStore instance and connects it to an
 * optional `PermissionBridge` so daemon-originated requests flow into
 * the store. Consumers use:
 *
 *   usePermissionQueue()   — the current request queue (reactive).
 *   usePermissionStore()   — direct store access (for dialogs that need
 *                            to resolve requests).
 *   usePermissionRules()   — read session + persistent rule lists.
 *
 * Rules that persist to disk trigger `opts.onPersistentChange` on the
 * store; we wire that to `savePermissions()` so user choices survive the
 * session. The save path is injectable for tests.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import type {
  PermissionRequest,
  PermissionRule,
  PermissionSnapshot,
} from "./types.js";
import {
  createPermissionStore,
  type PermissionStore,
} from "./store.js";
import type { PermissionBridge } from "./bridge.js";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PermissionContextValue {
  readonly store: PermissionStore;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

function usePermissionContext(): PermissionContextValue {
  const ctx = useContext(PermissionContext);
  if (ctx === null) {
    throw new Error("Permission hook called outside PermissionProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface PermissionProviderProps {
  /** Persistent rules pre-loaded from disk. */
  readonly initialPersistentRules?: readonly PermissionRule[];
  /**
   * Called when the persistent rule list changes. The production provider
   * wires this to `savePermissions()`; tests may supply a capture.
   */
  readonly onPersistentChange?: (rules: readonly PermissionRule[]) => void;
  /**
   * Optional daemon bridge. When provided, the store's enqueue becomes the
   * bridge's attached handler — daemon lease events flow into the UI.
   */
  readonly bridge?: PermissionBridge;
  readonly children: React.ReactNode;
}

export const PermissionProvider: React.FC<PermissionProviderProps> = ({
  initialPersistentRules,
  onPersistentChange,
  bridge,
  children,
}) => {
  const store = useMemo(
    () =>
      createPermissionStore({
        initialPersistentRules,
        onPersistentChange,
      }),
    // Construction-time inputs — re-creating on change would drop the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Wire the bridge on mount so the adapter hands requests to the store.
  useEffect(() => {
    if (bridge === undefined) return;
    const detach = bridge.attach((request) => store.enqueue(request));
    return () => {
      detach();
      // Any request still in flight when the UI unmounts must resolve —
      // denying is the safest default (bridge returns false = daemon deny).
      store.rejectAllPending("permission provider unmounted");
    };
  }, [bridge, store]);

  const value = useMemo<PermissionContextValue>(() => ({ store }), [store]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Direct access to the store. Throws outside a provider — intentional. */
export function usePermissionStore(): PermissionStore {
  return usePermissionContext().store;
}

/** Reactive snapshot of the entire store (queue + rules). */
export function usePermissionSnapshot(): PermissionSnapshot {
  const store = usePermissionStore();
  return useSyncExternalStore(
    (notify) => store.subscribe(notify),
    () => store.snapshot(),
    () => store.snapshot(),
  );
}

/** Reactive view of just the pending queue. */
export function usePermissionQueue(): readonly PermissionRequest[] {
  return usePermissionSnapshot().queue;
}

/** Reactive view of the rule lists. */
export function usePermissionRules(): {
  readonly session: readonly PermissionRule[];
  readonly persistent: readonly PermissionRule[];
} {
  const snap = usePermissionSnapshot();
  return { session: snap.sessionRules, persistent: snap.persistentRules };
}
