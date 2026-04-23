// Task reaper — reclaims subagent_task rows left in a non-terminal state
// by a crashed or killed daemon.
//
// Why it exists
// =============
// Async subagent lifecycle is tracked in two places: the in-memory
// `inFlight` map (process-local) and the SQLite `subagent_task` table
// (durable). When the daemon crashes mid-spawn, the durable row is left
// at `status="running"` forever because the promise that would have
// marked it complete is gone with the crashed process.
//
// The reaper runs on a recurring schedule and at daemon boot, marking
// tasks whose `started_at` is older than a configurable TTL as
// `status="timeout"`. This keeps `/tasks` output honest and prevents
// the notification injector from tripping on tombstone rows.
//
// Contract
// ========
//   • SQL lives in `./store.ts::reapStaleTasks()`. This module only
//     owns the scheduling + logging, so a test or CLI caller can
//     trigger a one-shot reap without the timer.
//   • The TTL default is conservative (1 hour) — long enough that a
//     legitimate long-running subagent isn't killed, short enough that
//     a stale row doesn't outlive the user's session.
//   • Tick interval is half the TTL; two ticks after expiry at the
//     latest, the row is reclaimed.

import { getLogger } from "../../../shared/logger.js";
import { reapStaleTasks } from "./store.js";

const log = getLogger();

/** Default: 1 h. A legitimate subagent that takes longer than this is
 *  better modeled as a worktree/fork that produces intermediate results
 *  rather than a single long running span. */
export const DEFAULT_STALE_TTL_MS = 60 * 60 * 1_000;

/** Default: 30 min. Two-tick guarantee of expiry detection. */
export const DEFAULT_TICK_INTERVAL_MS = 30 * 60 * 1_000;

export interface ReaperOptions {
  /** Age at which a non-terminal task is considered stale. */
  readonly staleTtlMs?: number;
  /** How often the reaper wakes to sweep the table. */
  readonly tickIntervalMs?: number;
}

export interface Reaper {
  /** Start the recurring sweep. Safe to call multiple times — no-op after first. */
  start(): void;
  /** Stop the recurring sweep and release the timer handle. */
  stop(): void;
  /** Run a single sweep synchronously. Returns the number of rows reaped. */
  tick(): number;
}

/**
 * Build a task reaper. The reaper is not auto-started — callers (kernel
 * boot, in-process backend) call `.start()` so test code can construct
 * a reaper without side-effects.
 */
export function createTaskReaper(options: ReaperOptions = {}): Reaper {
  const staleTtlMs = options.staleTtlMs ?? DEFAULT_STALE_TTL_MS;
  const tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;

  if (staleTtlMs <= 0 || tickIntervalMs <= 0) {
    throw new Error(
      `TaskReaper: staleTtlMs and tickIntervalMs must be positive (got ${staleTtlMs}, ${tickIntervalMs})`,
    );
  }

  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = (): number => {
    try {
      const reaped = reapStaleTasks(staleTtlMs);
      if (reaped > 0) {
        log.warn(`TaskReaper: reclaimed ${reaped} stale subagent task(s) (ttl=${staleTtlMs}ms)`);
      }
      return reaped;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`TaskReaper: sweep failed: ${msg}`);
      return 0;
    }
  };

  return {
    start() {
      if (timer !== null) return;
      // Boot sweep — catches rows left behind by a prior crash before
      // the first recurring tick fires.
      tick();
      timer = setInterval(tick, tickIntervalMs);
      if (typeof (timer as { unref?: () => void }).unref === "function") {
        // Don't keep the event loop alive just for the reaper; if the
        // rest of the daemon is idle we can exit cleanly.
        (timer as { unref: () => void }).unref();
      }
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
    tick,
  };
}
