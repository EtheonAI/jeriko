/**
 * Tests for createKeybindingStore — register/unregister, scope stack,
 * dispatch, chord pending + timeout, subscribe.
 *
 * The chord timeout is exercised with an injected Scheduler so nothing
 * relies on real time.
 */

import { describe, test, expect } from "bun:test";
import {
  createKeybindingStore,
  parseChord,
  type Binding,
  type Scheduler,
  type ScheduledTask,
} from "../../../../src/cli/keybindings/index.js";

// ---------------------------------------------------------------------------
// Manual scheduler — lets tests fire the timeout deterministically
// ---------------------------------------------------------------------------

interface ManualScheduler extends Scheduler {
  /** Fire every scheduled task currently pending. */
  fireAll(): void;
  /** Number of pending tasks. */
  pending(): number;
}

function manualScheduler(): ManualScheduler {
  const tasks: Array<{ cb: () => void; cancelled: boolean }> = [];
  return {
    schedule(cb, _delayMs): ScheduledTask {
      const task = { cb, cancelled: false };
      tasks.push(task);
      return { cancel: () => { task.cancelled = true; } };
    },
    fireAll() {
      const snapshot = [...tasks];
      tasks.length = 0;
      for (const t of snapshot) if (!t.cancelled) t.cb();
    },
    pending() {
      return tasks.filter((t) => !t.cancelled).length;
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBinding(partial: Partial<Binding> & Pick<Binding, "id" | "chord">): Binding {
  return {
    id:          partial.id,
    description: partial.description ?? `Binding ${partial.id}`,
    chord:       partial.chord,
    scope:       partial.scope ?? "global",
    handler:     partial.handler ?? (() => {}),
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe("register / unregister", () => {
  test("register adds a binding to the snapshot", () => {
    const store = createKeybindingStore();
    const unregister = store.register(makeBinding({ id: "a", chord: parseChord("ctrl+a") }));
    expect(store.snapshot().bindings.some((b) => b.id === "a")).toBe(true);
    unregister();
    expect(store.snapshot().bindings.some((b) => b.id === "a")).toBe(false);
  });

  test("re-registering the same id replaces, not duplicates", () => {
    const store = createKeybindingStore();
    store.register(makeBinding({ id: "x", chord: parseChord("ctrl+a") }));
    store.register(makeBinding({ id: "x", chord: parseChord("ctrl+b") }));
    const hits = store.snapshot().bindings.filter((b) => b.id === "x");
    expect(hits.length).toBe(1);
  });

  test("unregister is idempotent and harmless after replacement", () => {
    const store = createKeybindingStore();
    const unregisterA = store.register(makeBinding({ id: "x", chord: parseChord("ctrl+a") }));
    store.register(makeBinding({ id: "x", chord: parseChord("ctrl+b") }));
    unregisterA();
    // The replacement is still there — unregisterA didn't nuke it.
    expect(store.snapshot().bindings.some((b) => b.id === "x")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scope stack
// ---------------------------------------------------------------------------

describe("scope stack", () => {
  test("setScopes replaces the stack", () => {
    const store = createKeybindingStore();
    store.setScopes(["input"]);
    expect(store.snapshot().activeScopes).toEqual(["input"]);
  });

  test("pushScope adds innermost; handle pops", () => {
    const store = createKeybindingStore();
    store.setScopes(["input"]);
    const pop = store.pushScope("wizard");
    expect(store.snapshot().activeScopes[0]).toBe("wizard");
    pop();
    expect(store.snapshot().activeScopes[0]).toBe("input");
  });
});

// ---------------------------------------------------------------------------
// Dispatch — full matches
// ---------------------------------------------------------------------------

describe("dispatch", () => {
  test("fires the handler for a matching single-key binding in an active scope", () => {
    const store = createKeybindingStore();
    store.setScopes(["input"]);
    let fired = 0;
    store.register(makeBinding({
      id: "input.submit",
      chord: parseChord("return"),
      scope: "input",
      handler: () => { fired++; },
    }));
    const handled = store.dispatch({ key: "return", ctrl: false, meta: false, shift: false });
    expect(handled).toBe(true);
    expect(fired).toBe(1);
  });

  test("does NOT fire when scope is not active", () => {
    const store = createKeybindingStore();
    store.setScopes(["input"]);
    let fired = 0;
    store.register(makeBinding({
      id: "wizard.next",
      chord: parseChord("return"),
      scope: "wizard",
      handler: () => { fired++; },
    }));
    const handled = store.dispatch({ key: "return", ctrl: false, meta: false, shift: false });
    expect(handled).toBe(false);
    expect(fired).toBe(0);
  });

  test("global scope is always active", () => {
    const store = createKeybindingStore();
    store.setScopes(["input"]);
    let fired = 0;
    store.register(makeBinding({
      id: "global.interrupt",
      chord: parseChord("ctrl+c"),
      scope: "global",
      handler: () => { fired++; },
    }));
    const handled = store.dispatch({ key: "c", ctrl: true, meta: false, shift: false });
    expect(handled).toBe(true);
    expect(fired).toBe(1);
  });

  test("handler returning false falls through to another binding", () => {
    const store = createKeybindingStore();
    store.setScopes(["input"]);
    const firedIds: string[] = [];
    store.register(makeBinding({
      id: "a",
      chord: parseChord("ctrl+x"),
      scope: "input",
      handler: () => { firedIds.push("a"); return false; },
    }));
    store.register(makeBinding({
      id: "b",
      chord: parseChord("ctrl+x"),
      scope: "global",
      handler: () => { firedIds.push("b"); },
    }));
    const handled = store.dispatch({ key: "x", ctrl: true, meta: false, shift: false });
    expect(handled).toBe(true);
    expect(firedIds).toEqual(["a", "b"]);
  });

  test("unmatched key returns false and does not leak pending state", () => {
    const store = createKeybindingStore();
    store.setScopes(["input"]);
    const handled = store.dispatch({ key: "z", ctrl: false, meta: false, shift: false });
    expect(handled).toBe(false);
    expect(store.snapshot().pendingChord).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Chord pending + timeout
// ---------------------------------------------------------------------------

describe("chord pending", () => {
  test("partial chord sets pendingChord and waits for continuation", () => {
    const scheduler = manualScheduler();
    const store = createKeybindingStore({ scheduler });
    store.setScopes(["input"]);
    let fired = false;
    store.register(makeBinding({
      id: "input.chord",
      chord: parseChord("ctrl+k ctrl+s"),
      scope: "input",
      handler: () => { fired = true; },
    }));

    const firstHandled = store.dispatch({ key: "k", ctrl: true, meta: false, shift: false });
    expect(firstHandled).toBe(true);
    expect(store.snapshot().pendingChord).not.toBeNull();
    expect(fired).toBe(false);

    const secondHandled = store.dispatch({ key: "s", ctrl: true, meta: false, shift: false });
    expect(secondHandled).toBe(true);
    expect(fired).toBe(true);
    expect(store.snapshot().pendingChord).toBeNull();
  });

  test("non-matching second key clears pending and returns false", () => {
    const scheduler = manualScheduler();
    const store = createKeybindingStore({ scheduler });
    store.setScopes(["input"]);
    store.register(makeBinding({
      id: "input.chord",
      chord: parseChord("ctrl+k ctrl+s"),
      scope: "input",
      handler: () => {},
    }));

    store.dispatch({ key: "k", ctrl: true, meta: false, shift: false });
    const handled = store.dispatch({ key: "z", ctrl: false, meta: false, shift: false });
    expect(handled).toBe(false);
    expect(store.snapshot().pendingChord).toBeNull();
  });

  test("chord timeout clears pending", () => {
    const scheduler = manualScheduler();
    const store = createKeybindingStore({ scheduler });
    store.setScopes(["input"]);
    store.register(makeBinding({
      id: "input.chord",
      chord: parseChord("ctrl+k ctrl+s"),
      scope: "input",
      handler: () => {},
    }));

    store.dispatch({ key: "k", ctrl: true, meta: false, shift: false });
    expect(store.snapshot().pendingChord).not.toBeNull();
    expect(scheduler.pending()).toBe(1);
    scheduler.fireAll();
    expect(store.snapshot().pendingChord).toBeNull();
  });

  test("clearPending cancels the timeout", () => {
    const scheduler = manualScheduler();
    const store = createKeybindingStore({ scheduler });
    store.setScopes(["input"]);
    store.register(makeBinding({
      id: "input.chord",
      chord: parseChord("ctrl+k ctrl+s"),
      scope: "input",
      handler: () => {},
    }));
    store.dispatch({ key: "k", ctrl: true, meta: false, shift: false });
    expect(scheduler.pending()).toBe(1);
    store.clearPending();
    expect(scheduler.pending()).toBe(0);
    expect(store.snapshot().pendingChord).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Subscribers
// ---------------------------------------------------------------------------

describe("subscribe", () => {
  test("notifies on register", () => {
    const store = createKeybindingStore();
    let notified = 0;
    store.subscribe(() => { notified++; });
    store.register(makeBinding({ id: "a", chord: parseChord("ctrl+a") }));
    expect(notified).toBeGreaterThan(0);
  });

  test("unsubscribe stops notifications", () => {
    const store = createKeybindingStore();
    let notified = 0;
    const unsub = store.subscribe(() => { notified++; });
    unsub();
    store.register(makeBinding({ id: "a", chord: parseChord("ctrl+a") }));
    expect(notified).toBe(0);
  });
});
