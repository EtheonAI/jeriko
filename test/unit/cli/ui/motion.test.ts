/**
 * Tests for motion context + animation clock.
 *
 * Clock tests use the non-public reset hook to isolate state between cases.
 * They do not wait for real timer ticks — correctness of tick incrementing is
 * covered by the Spinner integration test. Here we verify lifecycle only.
 */

import { describe, test, expect, afterEach } from "bun:test";
import {
  subscribe,
  getTick,
  __unsafe_clockStats,
  __unsafe_resetAllClocks,
} from "../../../../src/cli/ui/motion/clock.js";
import { detectMotionMode } from "../../../../src/cli/ui/motion/context.js";
import type { MotionMode } from "../../../../src/cli/ui/types.js";

afterEach(() => {
  __unsafe_resetAllClocks();
});

describe("clock.subscribe", () => {
  test("creates a running timer on first subscription", () => {
    const unsub = subscribe(100, () => {});
    const stats = __unsafe_clockStats();
    expect(stats.find((s) => s.intervalMs === 100)?.running).toBe(true);
    expect(stats.find((s) => s.intervalMs === 100)?.subscriberCount).toBe(1);
    unsub();
  });

  test("second subscription at same interval reuses the timer", () => {
    const unsubA = subscribe(100, () => {});
    const unsubB = subscribe(100, () => {});
    const stats = __unsafe_clockStats();
    const entry = stats.find((s) => s.intervalMs === 100);
    expect(entry?.subscriberCount).toBe(2);
    expect(entry?.running).toBe(true);
    unsubA();
    unsubB();
  });

  test("different intervals create independent clocks", () => {
    const unsubA = subscribe(100, () => {});
    const unsubB = subscribe(250, () => {});
    const stats = __unsafe_clockStats();
    expect(stats.length).toBe(2);
    expect(stats.find((s) => s.intervalMs === 100)?.running).toBe(true);
    expect(stats.find((s) => s.intervalMs === 250)?.running).toBe(true);
    unsubA();
    unsubB();
  });

  test("last unsubscribe stops the timer", () => {
    const unsub = subscribe(100, () => {});
    unsub();
    const stats = __unsafe_clockStats();
    expect(stats.find((s) => s.intervalMs === 100)?.running).toBe(false);
    expect(stats.find((s) => s.intervalMs === 100)?.subscriberCount).toBe(0);
  });

  test("unsubscribe is idempotent", () => {
    const unsub = subscribe(100, () => {});
    unsub();
    expect(() => unsub()).not.toThrow();
  });
});

describe("clock.getTick", () => {
  test("returns 0 before any tick fires", () => {
    expect(getTick(100)).toBe(0);
  });
});

describe("detectMotionMode", () => {
  const cases: Array<[Record<string, string | undefined>, MotionMode]> = [
    [{}, "full"],
    [{ JERIKO_NO_MOTION: "1" }, "none"],
    [{ JERIKO_NO_MOTION: "true" }, "none"],
    [{ JERIKO_NO_MOTION: "none" }, "none"],
    [{ JERIKO_NO_MOTION: "reduced" }, "reduced"],
    [{ TERM: "dumb" }, "none"],
    [{ NO_COLOR: "1" }, "reduced"],
    [{ NO_COLOR: "anything" }, "reduced"],
    [{ NO_COLOR: "" }, "full"], // empty string does not disable color
    [{ JERIKO_NO_MOTION: "1", NO_COLOR: "1" }, "none"], // JERIKO override wins
  ];

  for (const [env, expected] of cases) {
    test(`env=${JSON.stringify(env)} → ${expected}`, () => {
      expect(detectMotionMode(env)).toBe(expected);
    });
  }
});
