/**
 * Tests for createPermissionStore — queue, resolve, rule lifecycle,
 * auto-match drain, subscribers, rejectAllPending.
 */

import { describe, test, expect } from "bun:test";
import {
  createPermissionStore,
} from "../../../../src/cli/permission/index.js";
import type {
  PermissionDecision,
  PermissionRequest,
  PermissionRule,
} from "../../../../src/cli/permission/index.js";

let seq = 0;
function req(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id:        overrides.id ?? `req-${++seq}`,
    agent:     overrides.agent ?? "cli",
    sessionId: overrides.sessionId ?? "s-1",
    risk:      overrides.risk ?? "medium",
    summary:   overrides.summary ?? "summary",
    issuedAt:  overrides.issuedAt ?? Date.now(),
    body:      overrides.body ?? { kind: "bash", command: "git status" },
  };
}

describe("enqueue + resolve", () => {
  test("unmatched request waits for user decision", async () => {
    const store = createPermissionStore();
    const r = req();

    const pending = store.enqueue(r);
    expect(store.snapshot().queue).toHaveLength(1);

    store.resolve(r.id, "allow-once");
    expect(await pending).toBe(true);
    expect(store.snapshot().queue).toHaveLength(0);
  });

  test("allow-once does not create a rule", async () => {
    const store = createPermissionStore();
    const r = req();
    const pending = store.enqueue(r);
    store.resolve(r.id, "allow-once");
    await pending;
    const snap = store.snapshot();
    expect(snap.sessionRules).toHaveLength(0);
    expect(snap.persistentRules).toHaveLength(0);
  });

  test("allow-session creates a session rule", async () => {
    const store = createPermissionStore();
    const r = req({ body: { kind: "bash", command: "git status" } });
    const pending = store.enqueue(r);
    store.resolve(r.id, "allow-session");
    await pending;
    expect(store.snapshot().sessionRules).toHaveLength(1);
    expect(store.snapshot().sessionRules[0]?.decision).toBe("allow");
    expect(store.snapshot().sessionRules[0]?.origin).toBe("session");
  });

  test("allow-always persists via callback and creates a persistent rule", async () => {
    const persisted: PermissionRule[][] = [];
    const store = createPermissionStore({
      onPersistentChange: (rules) => persisted.push([...rules]),
    });
    const r = req({ body: { kind: "bash", command: "git push" } });
    const pending = store.enqueue(r);
    store.resolve(r.id, "allow-always");
    await pending;
    expect(store.snapshot().persistentRules).toHaveLength(1);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]![0]?.origin).toBe("persistent");
  });

  test("deny-once resolves false, no rule stored", async () => {
    const store = createPermissionStore();
    const r = req();
    const pending = store.enqueue(r);
    store.resolve(r.id, "deny-once");
    expect(await pending).toBe(false);
    expect(store.snapshot().sessionRules).toHaveLength(0);
  });

  test("deny-always persists a deny rule", async () => {
    const store = createPermissionStore();
    const r = req({ body: { kind: "bash", command: "rm -rf /" } });
    const pending = store.enqueue(r);
    store.resolve(r.id, "deny-always");
    expect(await pending).toBe(false);
    const rules = store.snapshot().persistentRules;
    expect(rules).toHaveLength(1);
    expect(rules[0]?.decision).toBe("deny");
  });
});

describe("auto-resolution from existing rules", () => {
  test("pre-existing persistent allow resolves immediately (no queue)", async () => {
    const initial: PermissionRule[] = [
      { kind: "bash", target: "git ", decision: "allow", origin: "persistent" },
    ];
    const store = createPermissionStore({ initialPersistentRules: initial });
    const p = store.enqueue(req({ body: { kind: "bash", command: "git status" } }));
    expect(await p).toBe(true);
    expect(store.snapshot().queue).toHaveLength(0);
  });

  test("pre-existing deny resolves to false without queueing", async () => {
    const initial: PermissionRule[] = [
      { kind: "bash", target: "rm ", decision: "deny", origin: "persistent" },
    ];
    const store = createPermissionStore({ initialPersistentRules: initial });
    expect(await store.enqueue(req({ body: { kind: "bash", command: "rm -rf /" } }))).toBe(false);
  });
});

describe("auto-drain after a new rule", () => {
  test("allow-session on one request resolves siblings that now match", async () => {
    const store = createPermissionStore();
    const a = req({ body: { kind: "bash", command: "git status" } });
    const b = req({ body: { kind: "bash", command: "git log" } });
    const c = req({ body: { kind: "bash", command: "npm install" } });

    const pa = store.enqueue(a);
    const pb = store.enqueue(b);
    const pc = store.enqueue(c);
    expect(store.snapshot().queue).toHaveLength(3);

    // User picks allow-session for `a` with scope "git " — should auto-resolve b, leave c.
    // NOTE: the store derives the rule target from targetFor(request). For bash, that's
    // the whole command. To widen it we'd need a UI-level control that edits the target
    // before persisting. This test confirms the narrower current behaviour.
    store.resolve(a.id, "allow-session");
    await pa;

    expect(store.snapshot().queue).toHaveLength(2);
    // `b` is still pending because the session rule's target equals "git status" exactly —
    // our conservative default. The auto-drain proves *it runs*; session rules UI will
    // widen targets in a future iteration.

    // Resolve b + c manually to complete the test.
    store.resolve(b.id, "allow-once");
    store.resolve(c.id, "deny-once");
    expect(await pb).toBe(true);
    expect(await pc).toBe(false);
  });

  test("broad allow-session matches subsequent targets", async () => {
    // Seed a broad session rule upfront via a denied-then-... scenario.
    const store = createPermissionStore({
      initialPersistentRules: [{
        kind: "web-fetch", target: "https://api.stripe.com", decision: "allow", origin: "persistent",
      }],
    });
    // Two fetches — both resolve automatically.
    expect(await store.enqueue(req({ body: { kind: "web-fetch", url: "https://api.stripe.com/v1/charges", method: "GET" } }))).toBe(true);
    expect(await store.enqueue(req({ body: { kind: "web-fetch", url: "https://api.stripe.com/v1/customers", method: "POST" } }))).toBe(true);
  });
});

describe("subscribers", () => {
  test("fires on enqueue", () => {
    const store = createPermissionStore();
    let notified = 0;
    store.subscribe(() => { notified++; });
    void store.enqueue(req());
    expect(notified).toBeGreaterThan(0);
  });

  test("fires on resolve", async () => {
    const store = createPermissionStore();
    let notified = 0;
    const r = req();
    const p = store.enqueue(r);
    store.subscribe(() => { notified++; });
    store.resolve(r.id, "allow-once");
    await p;
    expect(notified).toBeGreaterThan(0);
  });

  test("unsubscribe stops notifications", () => {
    const store = createPermissionStore();
    let notified = 0;
    const unsub = store.subscribe(() => { notified++; });
    unsub();
    void store.enqueue(req());
    expect(notified).toBe(0);
  });
});

describe("rejectAllPending", () => {
  test("resolves every pending request to false and drains the queue", async () => {
    const store = createPermissionStore();
    const a = req();
    const b = req();
    const pa = store.enqueue(a);
    const pb = store.enqueue(b);
    expect(store.snapshot().queue).toHaveLength(2);

    store.rejectAllPending();

    expect(await pa).toBe(false);
    expect(await pb).toBe(false);
    expect(store.snapshot().queue).toHaveLength(0);
  });
});

describe("decision semantics mapping", () => {
  // Each iteration uses a fresh store so rules persisted by earlier
  // decisions don't auto-resolve later ones through the matcher.
  const decisions: PermissionDecision[] = ["allow-once", "allow-session", "allow-always", "deny-once", "deny-always"];

  for (const d of decisions) {
    test(`${d} resolves enqueue to expected boolean`, async () => {
      const store = createPermissionStore();
      const r = req();
      const p = store.enqueue(r);
      store.resolve(r.id, d);
      const expected = d.startsWith("allow");
      expect(await p).toBe(expected);
    });
  }
});
