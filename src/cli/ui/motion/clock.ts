/**
 * UI Subsystem — shared animation clock.
 *
 * All motion primitives subscribe to a single interval per tick-rate instead
 * of each spinning up its own `setInterval`. When the last subscriber leaves,
 * the underlying timer is cleared — no leaked intervals on unmount.
 *
 * Design:
 *   - One ClockState per distinct interval (e.g., 80ms, 120ms, 150ms).
 *   - Subscribers are notified each tick; they re-read `getTick()` to render.
 *   - Timer is .unref()'d so a stray spinner can't keep Node alive at shutdown.
 *   - useAnimationClock() bridges to React via useSyncExternalStore (tear-free).
 */

import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface ClockState {
  tick: number;
  timer: ReturnType<typeof setInterval> | null;
  subscribers: Set<() => void>;
}

/** Map of intervalMs → shared clock. Module-scoped singleton by design. */
const clocks: Map<number, ClockState> = new Map();

function getOrCreate(intervalMs: number): ClockState {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = { tick: 0, timer: null, subscribers: new Set() };
    clocks.set(intervalMs, clock);
  }
  return clock;
}

function start(clock: ClockState, intervalMs: number): void {
  if (clock.timer !== null) return;
  clock.timer = setInterval(() => {
    // Wrap at 2^31 to avoid eventual overflow on ultra-long sessions.
    clock.tick = (clock.tick + 1) & 0x7fffffff;
    for (const notify of clock.subscribers) notify();
  }, intervalMs);
  // Never block process exit just because a spinner is running.
  const timer = clock.timer as unknown as { unref?: () => void };
  if (typeof timer.unref === "function") timer.unref();
}

function stop(clock: ClockState): void {
  if (clock.timer !== null) {
    clearInterval(clock.timer);
    clock.timer = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Subscribe to the clock at `intervalMs`. Returns an unsubscribe fn. */
export function subscribe(intervalMs: number, notify: () => void): () => void {
  const clock = getOrCreate(intervalMs);
  clock.subscribers.add(notify);
  if (clock.subscribers.size === 1) start(clock, intervalMs);
  return () => {
    clock.subscribers.delete(notify);
    if (clock.subscribers.size === 0) stop(clock);
  };
}

/** Current tick count at `intervalMs` (0 until first tick fires). */
export function getTick(intervalMs: number): number {
  return getOrCreate(intervalMs).tick;
}

/**
 * React hook: returns the current tick at `intervalMs`.
 * When `enabled` is false, returns a frozen 0 and subscribes to nothing — use
 * for reduced-motion paths so no timer is scheduled at all.
 */
export function useAnimationClock(intervalMs: number, enabled: boolean = true): number {
  return useSyncExternalStore(
    enabled ? (notify) => subscribe(intervalMs, notify) : () => noop,
    () => (enabled ? getTick(intervalMs) : 0),
    () => 0,
  );
}

const noop = (): void => {};

// ---------------------------------------------------------------------------
// Test hooks — deliberately narrow API used only by motion.test
// ---------------------------------------------------------------------------

/** Non-public: snapshot of the internal registry for tests. */
export function __unsafe_clockStats(): Array<{
  intervalMs: number;
  subscriberCount: number;
  running: boolean;
}> {
  const out: Array<{ intervalMs: number; subscriberCount: number; running: boolean }> = [];
  for (const [intervalMs, clock] of clocks) {
    out.push({
      intervalMs,
      subscriberCount: clock.subscribers.size,
      running: clock.timer !== null,
    });
  }
  return out;
}

/** Non-public: reset for test isolation. */
export function __unsafe_resetAllClocks(): void {
  for (const clock of clocks.values()) stop(clock);
  clocks.clear();
}
