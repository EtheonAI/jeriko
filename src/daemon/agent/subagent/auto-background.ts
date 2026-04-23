// Auto-backgrounding for sync subagents (Feature 3).
//
// Claude Code lets sync subagents block the parent for ~2 seconds — long
// enough to feel responsive on quick tasks — then transitions them to
// background mode and returns a task-id to the model. The child keeps
// running; its completion surfaces via `task-notification` on the parent's
// next round.
//
// This module wraps any sync runner promise with a race against a timer,
// returning whichever settles first. The caller is responsible for
// replacing the concrete promise with a retained in-flight reference
// once the transition occurs, so the background task keeps running.

import type { SubagentAsyncLaunch, SubagentCompletion } from "./types.js";
import {
  SUBAGENT_AUTO_BACKGROUND_MAX_MS,
  SUBAGENT_AUTO_BACKGROUND_MIN_MS,
  SUBAGENT_AUTO_BACKGROUND_MS,
} from "./types.js";

/** Clamp the user-supplied threshold into the accepted range. */
export function clampAutoBackgroundMs(requested: number | undefined): number {
  if (requested === undefined) return SUBAGENT_AUTO_BACKGROUND_MS;
  if (requested === 0) return 0;
  const bounded = Math.max(
    SUBAGENT_AUTO_BACKGROUND_MIN_MS,
    Math.min(SUBAGENT_AUTO_BACKGROUND_MAX_MS, requested),
  );
  return Math.floor(bounded);
}

export interface RaceInput {
  /** The sync subagent completion promise (from `runSubagent`). */
  completion: Promise<SubagentCompletion>;
  /** Milliseconds to wait before auto-backgrounding. 0 disables. */
  thresholdMs: number;
  /** Called when the timer fires first — the caller should mark the task as
   *  "running asynchronously" and preserve the completion promise so the
   *  background work continues. */
  onBackground: () => SubagentAsyncLaunch;
}

/** Outcome of the race — either the sync result or the async acknowledgement. */
export type RaceOutcome =
  | { type: "completed"; completion: SubagentCompletion }
  | { type: "backgrounded"; ack: SubagentAsyncLaunch };

/**
 * Race the completion against the threshold. If the task finishes first, the
 * sync completion is returned. If the timer wins, the caller's `onBackground`
 * hook fires (which must mutate the task state) and the returned ack is
 * propagated back to the parent model.
 *
 * When `thresholdMs === 0`, the race is skipped — behaves as a plain sync
 * `await`.
 */
export async function raceAutoBackground(input: RaceInput): Promise<RaceOutcome> {
  if (input.thresholdMs <= 0) {
    const completion = await input.completion;
    return { type: "completed", completion };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const backgroundSignal = new Promise<"__background__">((resolve) => {
    timer = setTimeout(() => resolve("__background__"), input.thresholdMs);
  });

  try {
    const winner = await Promise.race([input.completion, backgroundSignal]);
    if (winner === "__background__") {
      return { type: "backgrounded", ack: input.onBackground() };
    }
    return { type: "completed", completion: winner };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
