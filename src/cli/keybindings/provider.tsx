/**
 * Keybinding Subsystem — React provider + hooks.
 *
 * The provider owns a KeybindingStore instance and exposes it through
 * context. Consumers use:
 *
 *   useKeybinding(id, handler, opts?)  — register a handler for an id; the
 *                                        chord comes from the BindingSpec
 *                                        already in the store (defaults or
 *                                        user override). Handler changes
 *                                        don't re-register.
 *
 *   useKeybindingSnapshot()            — reactive, tear-free read of the
 *                                        store snapshot (active scopes,
 *                                        pending chord, all bindings).
 *
 *   useKeybindingScope(scope)          — push a scope while mounted; pop on
 *                                        unmount. Composes cleanly (wizard
 *                                        pushes "wizard", help overlay
 *                                        pushes "help", etc.).
 *
 * The store is created once per provider instance. Seeding BindingSpecs
 * come from props so the caller (app root) loads defaults+user-config and
 * passes them in — the subsystem owns no I/O here.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import type {
  Binding,
  BindingHandler,
  BindingScope,
  BindingSpec,
  StoreSnapshot,
} from "./types.js";
import {
  createKeybindingStore,
  type KeybindingStore,
  type StoreOptions,
} from "./store.js";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface KeybindingContextValue {
  readonly store: KeybindingStore;
  readonly specsById: ReadonlyMap<string, BindingSpec>;
}

const KeybindingContext = createContext<KeybindingContextValue | null>(null);

/** Access the raw store. Throws outside a provider — that's intentional. */
export function useKeybindingStore(): KeybindingStore {
  const ctx = useContext(KeybindingContext);
  if (ctx === null) throw new Error("useKeybindingStore() called outside KeybindingProvider");
  return ctx.store;
}

/** Access the registered spec list (defaults merged with user overrides). */
export function useKeybindingSpecs(): ReadonlyMap<string, BindingSpec> {
  const ctx = useContext(KeybindingContext);
  if (ctx === null) throw new Error("useKeybindingSpecs() called outside KeybindingProvider");
  return ctx.specsById;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface KeybindingProviderProps {
  /** Resolved bindings (defaults + user config). */
  readonly specs: readonly BindingSpec[];
  /** Forwarded to createKeybindingStore — used in tests. */
  readonly storeOptions?: StoreOptions;
  /** Initial scope stack. Global is implicit; "input" is the common default. */
  readonly initialScopes?: readonly BindingScope[];
  readonly children: React.ReactNode;
}

export const KeybindingProvider: React.FC<KeybindingProviderProps> = ({
  specs,
  storeOptions,
  initialScopes,
  children,
}) => {
  const store = useMemo(() => {
    const created = createKeybindingStore(storeOptions);
    if (initialScopes !== undefined) created.setScopes(initialScopes);
    return created;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const specsById = useMemo(
    () => new Map<string, BindingSpec>(specs.map((s) => [s.id, s])),
    [specs],
  );

  // When the spec list changes (e.g. user reloads config at runtime), handlers
  // remain registered under their id — their chord is picked up from specsById
  // on the next dispatch. We don't re-register on spec changes.
  // The store's own snapshot carries the authoritative chord of each live
  // Binding, so useKeybinding keeps it in sync via effect below.

  const value = useMemo<KeybindingContextValue>(
    () => ({ store, specsById }),
    [store, specsById],
  );

  return <KeybindingContext.Provider value={value}>{children}</KeybindingContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hooks — useKeybinding
// ---------------------------------------------------------------------------

export interface UseKeybindingOptions {
  /** If false, the binding is not registered. Default true. */
  readonly enabled?: boolean;
}

/**
 * Register a handler for the binding with `id`. The chord and scope come from
 * the spec (defaults.ts merged with user overrides). Handler updates are
 * absorbed without re-registering — the store always calls the latest closure.
 */
export function useKeybinding(
  id: string,
  handler: BindingHandler,
  opts: UseKeybindingOptions = {},
): void {
  const enabled = opts.enabled ?? true;
  const store = useKeybindingStore();
  const specs = useKeybindingSpecs();

  // Stable ref to the latest handler so re-renders don't re-register.
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const spec = specs.get(id);
    if (spec === undefined) {
      // No spec for this id — in strict dev we could warn; for now, no-op.
      return;
    }
    const binding: Binding = {
      ...spec,
      handler: () => handlerRef.current(),
    };
    return store.register(binding);
  }, [id, specs, store, enabled]);
}

// ---------------------------------------------------------------------------
// Hooks — useKeybindingScope
// ---------------------------------------------------------------------------

/** Push a scope while this component is mounted. */
export function useKeybindingScope(scope: BindingScope): void {
  const store = useKeybindingStore();
  useEffect(() => store.pushScope(scope), [scope, store]);
}

// ---------------------------------------------------------------------------
// Hooks — useKeybindingSnapshot
// ---------------------------------------------------------------------------

/** Reactive snapshot of the store (active scopes, pending chord, bindings). */
export function useKeybindingSnapshot(): StoreSnapshot {
  const store = useKeybindingStore();
  return useSyncExternalStore(
    (notify) => store.subscribe(notify),
    () => store.snapshot(),
    () => store.snapshot(),
  );
}
