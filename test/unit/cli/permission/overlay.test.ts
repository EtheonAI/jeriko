/**
 * Integration tests for PermissionProvider + PermissionOverlay.
 *
 * Two concerns, each isolated so a timing issue in one doesn't mask a
 * regression in the other:
 *
 *   1. The end-to-end render + keybinding dispatch path: a request in the
 *      store flows through to a visible dialog, and a dispatched keystroke
 *      resolves it with the correct decision. Driven by direct
 *      store.enqueue() so bridge-effect timing doesn't interfere.
 *
 *   2. The bridge attach path: a request submitted through the bridge
 *      lands in the store (small unit test — no UI, no React).
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";

import {
  PermissionOverlay,
  PermissionProvider,
  createInMemoryBridge,
  usePermissionStore,
} from "../../../../src/cli/permission/index.js";
import type {
  PermissionRequest,
  PermissionStore,
} from "../../../../src/cli/permission/index.js";
import { ThemeProvider } from "../../../../src/cli/themes/index.js";
import {
  KeybindingProvider,
  DEFAULT_BINDINGS,
  useKeybindingStore,
} from "../../../../src/cli/keybindings/index.js";
import type { KeybindingStore } from "../../../../src/cli/keybindings/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitFor<T>(
  produce: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = 500,
): Promise<T> {
  const start = Date.now();
  let latest = produce();
  while (Date.now() - start < timeoutMs) {
    latest = produce();
    if (predicate(latest)) return latest;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`waitFor timed out. Last: ${String(latest)}`);
}

function makeRequest(body: PermissionRequest["body"], id = "r-1"): PermissionRequest {
  return {
    id,
    agent: "agent:test",
    sessionId: "s-1",
    risk: "medium",
    summary: "Test request",
    issuedAt: Date.now(),
    body,
  };
}

/**
 * Harness that grabs both the keybinding store and the permission store
 * from context so tests can drive them synchronously.
 */
const StoreGrabber: React.FC<{
  onStores: (kb: KeybindingStore, perm: PermissionStore) => void;
}> = ({ onStores }) => {
  const kb = useKeybindingStore();
  const perm = usePermissionStore();
  React.useEffect(() => { onStores(kb, perm); }, [kb, perm, onStores]);
  return null;
};

function mountOverlay() {
  let kbStore: KeybindingStore | null = null;
  let permStore: PermissionStore | null = null;

  const handle = render(React.createElement(
    ThemeProvider,
    null,
    React.createElement(
      KeybindingProvider,
      { specs: DEFAULT_BINDINGS },
      React.createElement(
        PermissionProvider,
        null,
        React.createElement(React.Fragment, null,
          React.createElement(StoreGrabber, { onStores: (k, p) => { kbStore = k; permStore = p; } }),
          React.createElement(PermissionOverlay),
        ),
      ),
    ),
  ));

  return {
    lastFrame: handle.lastFrame,
    unmount: handle.unmount,
    getKb: () => kbStore,
    getPerm: () => permStore,
  };
}

// ---------------------------------------------------------------------------
// End-to-end — driven by direct store.enqueue
// ---------------------------------------------------------------------------

describe("PermissionOverlay end-to-end (direct store)", () => {
  test("a queued request renders in the dialog", async () => {
    const h = mountOverlay();
    const perm = await waitFor(() => h.getPerm(), (v) => v !== null);

    void perm!.enqueue(makeRequest({ kind: "bash", command: "git status" }));

    await waitFor(() => h.lastFrame() ?? "", (f) => f.includes("git status"));
    h.unmount();
  });

  test("pressing 'y' resolves to allow-once and clears the dialog", async () => {
    const h = mountOverlay();
    const kb = await waitFor(() => h.getKb(), (v) => v !== null);
    const perm = await waitFor(() => h.getPerm(), (v) => v !== null);

    const pending = perm!.enqueue(makeRequest({ kind: "bash", command: "echo hi" }));
    await waitFor(() => h.lastFrame() ?? "", (f) => f.includes("echo hi"));

    const dispatched = kb!.dispatch({ key: "y", ctrl: false, meta: false, shift: false });
    expect(dispatched).toBe(true);

    expect(await pending).toBe(true);

    // The queue drained and the dialog unmounted.
    await waitFor(() => h.lastFrame() ?? "", (f) => !f.includes("echo hi"));
    h.unmount();
  });

  test("pressing 'n' resolves to deny-once", async () => {
    const h = mountOverlay();
    const kb = await waitFor(() => h.getKb(), (v) => v !== null);
    const perm = await waitFor(() => h.getPerm(), (v) => v !== null);

    const pending = perm!.enqueue(makeRequest({ kind: "bash", command: "rm -rf /" }));
    await waitFor(() => h.lastFrame() ?? "", (f) => f.includes("rm -rf /"));

    kb!.dispatch({ key: "n", ctrl: false, meta: false, shift: false });
    expect(await pending).toBe(false);
    h.unmount();
  });

  test("shift+Y resolves to allow-session (adds a session rule)", async () => {
    const h = mountOverlay();
    const kb = await waitFor(() => h.getKb(), (v) => v !== null);
    const perm = await waitFor(() => h.getPerm(), (v) => v !== null);

    const pending = perm!.enqueue(makeRequest({ kind: "bash", command: "git status" }));
    await waitFor(() => h.lastFrame() ?? "", (f) => f.includes("git status"));

    kb!.dispatch({ key: "y", ctrl: false, meta: false, shift: true });
    expect(await pending).toBe(true);
    expect(perm!.snapshot().sessionRules.length).toBeGreaterThan(0);
    h.unmount();
  });

  test("Esc resolves to deny-once via the cancel binding", async () => {
    const h = mountOverlay();
    const kb = await waitFor(() => h.getKb(), (v) => v !== null);
    const perm = await waitFor(() => h.getPerm(), (v) => v !== null);

    const pending = perm!.enqueue(makeRequest({ kind: "bash", command: "echo x" }));
    await waitFor(() => h.lastFrame() ?? "", (f) => f.includes("echo x"));

    kb!.dispatch({ key: "escape", ctrl: false, meta: false, shift: false });
    expect(await pending).toBe(false);
    h.unmount();
  });
});

// ---------------------------------------------------------------------------
// Bridge attach — isolated unit test, no React involved
// ---------------------------------------------------------------------------

describe("PermissionBridge", () => {
  test("submit delegates to the attached handler", async () => {
    const bridge = createInMemoryBridge();
    let received: PermissionRequest | null = null;
    bridge.attach(async (req) => {
      received = req;
      return true;
    });

    const outcome = await bridge.submit(makeRequest({ kind: "bash", command: "ls" }));
    expect(outcome).toBe(true);
    expect(received).not.toBeNull();
    expect(received!.body.kind).toBe("bash");
  });

  test("submit returns false when no handler is attached", async () => {
    const bridge = createInMemoryBridge();
    expect(await bridge.submit(makeRequest({ kind: "bash", command: "ls" }))).toBe(false);
  });

  test("detach restores no-handler behaviour", async () => {
    const bridge = createInMemoryBridge();
    const detach = bridge.attach(async () => true);
    expect(await bridge.submit(makeRequest({ kind: "bash", command: "x" }))).toBe(true);
    detach();
    expect(await bridge.submit(makeRequest({ kind: "bash", command: "x" }))).toBe(false);
  });
});
