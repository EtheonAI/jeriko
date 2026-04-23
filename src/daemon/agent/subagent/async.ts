// Fire-and-forget async subagent spawn (Feature 1).
//
// The parent's current tool call returns immediately with {status:
// "async_launched", taskId, ...}. The child runs concurrently. When it
// completes, its row is marked `notified = 0` so the next pass through
// `notification.injectPendingNotifications()` surfaces it as a
// <task-notification> user message in the parent's conversation.
//
// Tracking for bounded concurrency and in-flight visibility lives in a
// module-level map so `listInFlight()` can inspect without hitting the DB.

import { getLogger } from "../../../shared/logger.js";
import type { RunnerInput } from "./runner.js";
import { runSubagent } from "./runner.js";
import type { SubagentAsyncLaunch, SubagentCompletion } from "./types.js";
import { completeTask } from "./store.js";

const log = getLogger();

/** Map of taskId → running promise, useful for tests and `jeriko tasks` CLI. */
const inFlight = new Map<string, Promise<SubagentCompletion>>();

/**
 * Maximum concurrent async subagents per process. Unlimited concurrency
 * would risk overloading the LLM provider and exhausting memory; 8 is a
 * safe default (Claude Code uses ~10 in production). Override via
 * `JERIKO_ASYNC_MAX_CONCURRENCY` env var for load tests.
 */
function asyncMaxConcurrency(): number {
  const raw = process.env.JERIKO_ASYNC_MAX_CONCURRENCY;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

export class AsyncConcurrencyExceededError extends Error {
  constructor(limit: number) {
    super(
      `Async subagent concurrency limit reached (${limit}). Wait for an ` +
      `existing task to complete or raise JERIKO_ASYNC_MAX_CONCURRENCY.`,
    );
    this.name = "AsyncConcurrencyExceededError";
  }
}

/**
 * Launch an already-prepared {@link RunnerInput} asynchronously.
 *
 * The returned promise resolves to a synchronous acknowledgement — the
 * actual completion is observable via `listInFlight()` or by reading
 * the `subagent_task` row.
 */
export function launchAsync(input: RunnerInput): SubagentAsyncLaunch {
  const limit = asyncMaxConcurrency();
  if (inFlight.size >= limit) {
    // Mark the task as failed up-front so the DB state is consistent.
    completeTask(input.taskId, {
      status: "failed",
      tokensIn: 0,
      tokensOut: 0,
      error: `Concurrency limit reached (${limit})`,
    });
    throw new AsyncConcurrencyExceededError(limit);
  }

  const promise = runSubagent(input)
    .catch((err): SubagentCompletion => ({
      taskId: input.taskId,
      childSessionId: input.childSessionId,
      status: "failed",
      response: "",
      error: err instanceof Error ? err.message : String(err),
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 0,
      mode: input.mode,
    }))
    .finally(() => {
      inFlight.delete(input.taskId);
    });

  inFlight.set(input.taskId, promise);
  log.info(`Async subagent launched: taskId=${input.taskId} mode=${input.mode} label="${input.label}"`);

  return {
    taskId: input.taskId,
    childSessionId: input.childSessionId,
    status: "async_launched",
    mode: input.mode,
  };
}

/** Read-only view of currently running async tasks. */
export function listInFlight(): string[] {
  return Array.from(inFlight.keys());
}

/** Await completion for a specific task, if still in-flight (test helper). */
export function awaitCompletion(taskId: string): Promise<SubagentCompletion> | undefined {
  return inFlight.get(taskId);
}

/** Resolve when all currently in-flight async subagents have completed. */
export async function awaitAllInFlight(): Promise<void> {
  const current = Array.from(inFlight.values());
  await Promise.allSettled(current);
}
