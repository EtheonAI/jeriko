/**
 * Keybinding Subsystem — reactive store.
 *
 * A KeybindingStore is a per-app instance (not a global singleton) that
 * owns:
 *   - registered bindings (Map<id, Binding>)
 *   - the active scope stack (innermost first)
 *   - the pending chord buffer (with a timer to clear it)
 *   - a subscriber list for reactive consumers (help overlay, chord indicator)
 *
 * Dispatch semantics:
 *   1. A KeyEvent arrives via dispatch(event).
 *   2. Candidate = pendingChord ++ [event].
 *   3. If some binding's chord EQUALS Candidate AND its scope is active:
 *        - call handler; clear pending; return true (handled).
 *        - if handler returns `false`, continue scanning for another match.
 *   4. Else if some binding's chord STARTS WITH Candidate AND its scope is
 *      active:
 *        - set pending = Candidate; schedule clear timer; return true.
 *   5. Else:
 *        - clear pending; return false (not handled — caller falls through).
 *
 * Scope precedence: within a scope class, the first registered binding wins.
 * Across scopes, the innermost active scope wins. Global is always active.
 */

import type {
  Binding,
  BindingScope,
  Chord,
  KeyEvent,
  StoreSnapshot,
} from "./types.js";
import { chordMatches, chordStartsWith } from "./matcher.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Time to wait for the next key of a multi-key chord before clearing the
 * pending buffer. 1.5s is the standard VS Code / Emacs value — long enough
 * for deliberate typing, short enough not to feel sluggish.
 */
export const DEFAULT_CHORD_TIMEOUT_MS = 1_500;

// ---------------------------------------------------------------------------
// Store API
// ---------------------------------------------------------------------------

export interface KeybindingStore {
  /** Register a binding. Returns an unregister handle. Duplicate ids replace. */
  register(binding: Binding): () => void;
  /** Replace the full active scope stack (innermost first). */
  setScopes(scopes: readonly BindingScope[]): void;
  /** Append a scope to the active stack; returns a handle that pops it. */
  pushScope(scope: BindingScope): () => void;
  /** Dispatch a key; returns true iff handled. */
  dispatch(event: KeyEvent): boolean;
  /** Immutable snapshot for reactive consumers. */
  snapshot(): StoreSnapshot;
  /** Subscribe to snapshot changes. */
  subscribe(listener: () => void): () => void;
  /** Clear pending chord immediately (e.g. on focus loss). */
  clearPending(): void;
}

export interface StoreOptions {
  readonly chordTimeoutMs?: number;
  /**
   * Scheduler used for chord timeout. Defaults to setTimeout/clearTimeout.
   * Tests inject a manual scheduler to advance time deterministically.
   */
  readonly scheduler?: Scheduler;
}

export interface Scheduler {
  readonly schedule: (cb: () => void, delayMs: number) => ScheduledTask;
}

export interface ScheduledTask {
  cancel(): void;
}

const DEFAULT_SCHEDULER: Scheduler = {
  schedule: (cb, delayMs) => {
    const handle = setTimeout(cb, delayMs);
    const unrefable = handle as unknown as { unref?: () => void };
    if (typeof unrefable.unref === "function") unrefable.unref();
    return { cancel: () => clearTimeout(handle) };
  },
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createKeybindingStore(opts: StoreOptions = {}): KeybindingStore {
  const chordTimeoutMs = opts.chordTimeoutMs ?? DEFAULT_CHORD_TIMEOUT_MS;
  const scheduler = opts.scheduler ?? DEFAULT_SCHEDULER;

  const bindings: Map<string, Binding> = new Map();
  const subscribers: Set<() => void> = new Set();
  let scopes: readonly BindingScope[] = ["global"];
  let pending: Chord | null = null;
  let pendingTask: ScheduledTask | null = null;

  // Snapshot caching: useSyncExternalStore requires snapshot() to return a
  // stable reference when underlying state is unchanged. Without caching,
  // React sees a new object every read, assumes the store is "tearing",
  // and warns with "The result of getSnapshot should be cached". We rebuild
  // once per change and invalidate on notify().
  let cachedSnapshot: StoreSnapshot | null = null;
  const invalidateSnapshot = (): void => { cachedSnapshot = null; };

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  const notify = (): void => {
    invalidateSnapshot();
    for (const l of [...subscribers]) l();
  };

  const cancelPendingTimer = (): void => {
    if (pendingTask !== null) {
      pendingTask.cancel();
      pendingTask = null;
    }
  };

  const setPending = (next: Chord | null): void => {
    cancelPendingTimer();
    pending = next;
    if (next !== null) {
      pendingTask = scheduler.schedule(() => {
        pending = null;
        pendingTask = null;
        notify();
      }, chordTimeoutMs);
    }
    notify();
  };

  /**
   * Walk the active scope stack innermost → outermost, always falling back to
   * "global". Yields the ordered list of scopes that should be consulted.
   */
  const resolutionOrder = (): readonly BindingScope[] => {
    const ordered: BindingScope[] = [...scopes];
    if (!ordered.includes("global")) ordered.push("global");
    return ordered;
  };

  const findFullMatches = (candidate: Chord): Binding[] => {
    return [...bindings.values()].filter((b) => chordMatches(b.chord, candidate));
  };

  const hasPrefixMatch = (candidate: Chord): boolean => {
    for (const b of bindings.values()) {
      if (chordStartsWith(b.chord, candidate)) return true;
    }
    return false;
  };

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const register: KeybindingStore["register"] = (binding) => {
    bindings.set(binding.id, binding);
    notify();
    return () => {
      // Only delete if still the same reference — prevents a late unregister
      // from nuking a replacement registered under the same id.
      if (bindings.get(binding.id) === binding) {
        bindings.delete(binding.id);
        notify();
      }
    };
  };

  const setScopes: KeybindingStore["setScopes"] = (next) => {
    scopes = [...next];
    notify();
  };

  const pushScope: KeybindingStore["pushScope"] = (scope) => {
    const previous = scopes;
    scopes = [scope, ...scopes];
    notify();
    return () => {
      scopes = previous;
      notify();
    };
  };

  const dispatch: KeybindingStore["dispatch"] = (event) => {
    const candidate: Chord = pending ? [...pending, event] : [event];
    const activeScopes = new Set(resolutionOrder());

    // 1. Full matches, in innermost→outermost scope order.
    const fullMatches = findFullMatches(candidate).filter((b) => activeScopes.has(b.scope));
    const orderedScopes = resolutionOrder();
    fullMatches.sort((a, b) => orderedScopes.indexOf(a.scope) - orderedScopes.indexOf(b.scope));

    for (const binding of fullMatches) {
      setPending(null);
      const result = binding.handler();
      if (result === false) continue; // explicit pass-through, try next
      return true;
    }

    // 2. No full match. If any scope-eligible binding's chord starts with
    //    this candidate, buffer and wait for more input.
    for (const b of bindings.values()) {
      if (!activeScopes.has(b.scope)) continue;
      if (chordStartsWith(b.chord, candidate)) {
        setPending(candidate);
        return true;
      }
    }

    // 3. Nothing matched. Clear pending (if any) and fall through.
    setPending(null);
    return false;
  };

  const snapshot: KeybindingStore["snapshot"] = () => {
    if (cachedSnapshot !== null) return cachedSnapshot;
    cachedSnapshot = {
      activeScopes: [...scopes],
      pendingChord: pending,
      bindings: [...bindings.values()],
    };
    return cachedSnapshot;
  };

  const subscribe: KeybindingStore["subscribe"] = (listener) => {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  };

  const clearPending: KeybindingStore["clearPending"] = () => {
    if (pending !== null) setPending(null);
  };

  return { register, setScopes, pushScope, dispatch, snapshot, subscribe, clearPending };
}
