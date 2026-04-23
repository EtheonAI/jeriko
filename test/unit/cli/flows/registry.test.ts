/**
 * Tests for the flow registry — register, unregister, duplicate rejection,
 * unknown-id rejection, listing.
 */

import { describe, test, expect, afterEach } from "bun:test";
import {
  DuplicateFlowError,
  UnknownFlowError,
  getFlow,
  hasFlow,
  listFlowIds,
  registerFlow,
} from "../../../../src/cli/flows/index.js";
import type { WizardFlow } from "../../../../src/cli/flows/index.js";

// Track registered flows so afterEach can clean up — prevents cross-test
// pollution given the registry is module-scoped.
const cleanups: Array<() => void> = [];
function trackUnregister(fn: () => void): void { cleanups.push(fn); }
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function dummyFlow(id: string): WizardFlow<{ value: string }> {
  return {
    id,
    title: "Dummy",
    steps: [{ type: "text", message: "Say:" }],
    parseResults: (raw) => ({ value: raw[0] ?? "" }),
    onComplete: () => {},
  };
}

describe("registerFlow", () => {
  test("registers and returns unregister handle", () => {
    trackUnregister(registerFlow("test-reg-a", () => dummyFlow("test-reg-a")));
    expect(hasFlow("test-reg-a")).toBe(true);
    expect(listFlowIds()).toContain("test-reg-a");
  });

  test("unregister removes the flow", () => {
    const off = registerFlow("test-reg-b", () => dummyFlow("test-reg-b"));
    off();
    expect(hasFlow("test-reg-b")).toBe(false);
  });

  test("duplicate id throws DuplicateFlowError", () => {
    trackUnregister(registerFlow("test-dup", () => dummyFlow("test-dup")));
    expect(() => registerFlow("test-dup", () => dummyFlow("test-dup"))).toThrow(DuplicateFlowError);
  });

  test("unregister is idempotent after re-register under same id", () => {
    const offA = registerFlow("test-re", () => dummyFlow("test-re"));
    offA();
    trackUnregister(registerFlow("test-re", () => dummyFlow("test-re")));
    offA(); // second call on the disarmed handle is a no-op
    expect(hasFlow("test-re")).toBe(true);
  });
});

describe("getFlow", () => {
  test("throws UnknownFlowError for missing id", () => {
    expect(() => getFlow("definitely-not-registered")).toThrow(UnknownFlowError);
  });

  test("returns the factory for a registered id", () => {
    const factory = () => dummyFlow("test-get");
    trackUnregister(registerFlow("test-get", factory));
    expect(getFlow("test-get")).toBe(factory);
  });
});
