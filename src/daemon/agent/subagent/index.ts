// Subagent subsystem — public API.
//
// Single entry point for every mode of subagent spawn. Consumers (the
// `delegate` tool, the new `spawn_agent` tool, and the CLI `tasks` command)
// call `spawn()` and never touch mode-specific modules directly.
//
// Architecturally this mirrors Claude Code's `Agent()` function: one
// cohesive front door that handles tool pool assembly, fork-mode prompt
// threading, worktree lifecycle, and the sync/async/auto-background
// decision.

import { createSession } from "../session/session.js";
import { addMessage } from "../session/message.js";
import type { DriverMessage } from "../drivers/index.js";
import { getLogger } from "../../../shared/logger.js";
import {
  getActiveBackend,
  getActiveContext,
  getActiveDepth,
  getActiveModel,
} from "../orchestrator-context.js";
import type { AgentType } from "../orchestrator.js";
import { AGENT_TYPES } from "../orchestrator.js";
import { getCapabilities } from "../drivers/models.js";

import {
  launchAsync,
  awaitAllInFlight,
  listInFlight,
  awaitCompletion,
  AsyncConcurrencyExceededError,
} from "./async.js";
import {
  clampAutoBackgroundMs,
  raceAutoBackground,
  type RaceOutcome,
} from "./auto-background.js";
import { buildForkPrompt } from "./fork.js";
import {
  drainNotificationsToSession,
  injectPendingNotifications,
  renderTaskNotification,
  renderNotificationBatch,
} from "./notification.js";
import { newTaskId, runSubagent, type RunnerInput } from "./runner.js";
import {
  completeTask,
  createTask,
  getTask,
  listTasksForParent,
  updateTaskStatus,
} from "./store.js";
import { assembleToolPoolForAgent } from "./tool-pool.js";
import {
  createWorktree,
  WorktreeError,
  type WorktreeHandle,
} from "./worktree.js";
import {
  SUBAGENT_AUTO_BACKGROUND_MS,
  type SubagentAsyncLaunch,
  type SubagentCompletion,
  type SubagentMode,
  type SubagentSpawnInput,
} from "./types.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Public types (re-exports)
// ---------------------------------------------------------------------------

export type {
  SubagentMode,
  SubagentStatus,
  SubagentSpawnInput,
  SubagentHandle,
  SubagentCompletion,
  SubagentAsyncLaunch,
} from "./types.js";
export { SUBAGENT_AUTO_BACKGROUND_MS } from "./types.js";
export { AsyncConcurrencyExceededError } from "./async.js";
export { WorktreeError } from "./worktree.js";
export {
  renderTaskNotification,
  renderNotificationBatch,
  drainNotificationsToSession,
  injectPendingNotifications,
};
export { assembleToolPoolForAgent } from "./tool-pool.js";
export { buildForkPrompt } from "./fork.js";
export { awaitAllInFlight, listInFlight, awaitCompletion };
export { getTask, listTasksForParent };

// ---------------------------------------------------------------------------
// spawn() — the one entry point
// ---------------------------------------------------------------------------

/** Result of a spawn: either an immediate completion or an async acknowledgement. */
export type SpawnResult =
  | { type: "completed"; completion: SubagentCompletion }
  | { type: "async_launched"; ack: SubagentAsyncLaunch };

/**
 * Spawn a subagent in the requested mode.
 *
 * The spawn is a *composed* operation:
 *   1. Validate the request (prompt, agent type).
 *   2. Allocate a session + task row.
 *   3. Optionally create a worktree.
 *   4. Assemble the child's tool pool independently of the parent's.
 *   5. Build the child's initial history (fork mode vs. standard).
 *   6. Hand the prepared `RunnerInput` to the async launcher (async modes)
 *      or the auto-background race (sync / fork modes).
 */
export async function spawn(input: SubagentSpawnInput): Promise<SpawnResult> {
  const prompt = input.prompt?.trim();
  if (!prompt) {
    throw new Error("subagent.spawn: prompt is required");
  }

  const agentType = input.agentType ?? "general";
  if (!(agentType in AGENT_TYPES)) {
    throw new Error(`subagent.spawn: unknown agent type "${agentType}"`);
  }

  const mode: SubagentMode = input.mode ?? "sync";
  const label = input.label ?? prompt.slice(0, 80);
  const taskId = newTaskId();

  const activeContext = getActiveContext();
  const backend = input.backend ?? getActiveBackend() ?? "claude";
  const model = input.model ?? getActiveModel() ?? "claude";
  const childDepth = (getActiveDepth() ?? 0) + 1;

  // ── Capability gate for local models ────────────────────────────────
  // Small local models can't reliably orchestrate subagents. Fail fast
  // rather than launching a child that will produce malformed output.
  const caps = getCapabilities(backend, model);
  if (caps.provider === "local" && caps.context < 16_384) {
    throw new Error(
      `Model "${caps.id}" has too small a context window (${caps.context} tokens) ` +
      "for subagent orchestration. Use a larger model or handle the task directly.",
    );
  }

  // ── Session + task row ──────────────────────────────────────────────
  const session = createSession({
    title: label,
    model,
    parentSessionId: input.parentSessionId,
    agentType,
  });
  addMessage(session.id, "user", prompt);

  let worktree: WorktreeHandle | undefined;
  if (mode === "worktree") {
    try {
      worktree = await createWorktree({
        cwd: process.cwd(),
        taskId,
        branch: input.worktreeBranch,
      });
    } catch (err) {
      if (err instanceof WorktreeError) {
        throw err;
      }
      throw new WorktreeError("Worktree creation failed", err);
    }
  }

  createTask({
    id: taskId,
    parentSessionId: input.parentSessionId ?? "",
    childSessionId: session.id,
    mode,
    agentType,
    label,
    prompt,
    worktreePath: worktree?.path ?? null,
  });

  // ── Tool pool (per-agent assembly) ──────────────────────────────────
  const { toolIds } = assembleToolPoolForAgent({
    agentType,
    childDepth,
    explicitToolIds: input.toolIds,
  });

  // ── History — fork vs standard ──────────────────────────────────────
  const { systemPrompt, history } =
    mode === "fork"
      ? buildForkPrompt({
          childPrompt: prompt,
          systemPrompt: input.forkSystemPrompt ?? activeContext?.systemPrompt,
          parentMessages: input.parentMessages,
        })
      : buildStandardPrompt(prompt, activeContext?.systemPrompt, input.parentMessages);

  const runnerInput: RunnerInput = {
    taskId,
    childSessionId: session.id,
    label,
    mode,
    agentType,
    toolIds,
    agentConfig: {
      backend,
      model,
      systemPrompt,
      signal: input.signal,
      depth: childDepth,
    },
    history,
    parentSessionId: input.parentSessionId ?? "",
  };

  // ── Dispatch by mode ────────────────────────────────────────────────
  if (mode === "async") {
    const ack = launchAsync(runnerInput);
    return { type: "async_launched", ack };
  }

  // sync / fork / worktree — race against auto-background threshold.
  const thresholdMs = clampAutoBackgroundMs(input.autoBackgroundAfterMs);
  const outcome = await runWithAutoBackground(runnerInput, thresholdMs);

  // If the run yielded a completion we own the worktree cleanup.
  if (outcome.type === "completed" && worktree) {
    const release = await worktree.release({ preserveIfChanged: true });
    log.info(
      `Worktree release: taskId=${taskId} removed=${release.removed} ` +
      `preserved=${release.preservedDueToChanges}`,
    );
  }

  return outcome.type === "completed"
    ? { type: "completed", completion: outcome.completion }
    : { type: "async_launched", ack: outcome.ack };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const MAX_PARENT_CONTEXT_CHARS = 2000;

function buildStandardPrompt(
  childPrompt: string,
  systemPrompt: string | undefined,
  parentMessages: DriverMessage[] | undefined,
): { systemPrompt: string | undefined; history: DriverMessage[] } {
  const history: DriverMessage[] = [];

  if (parentMessages && parentMessages.length > 0) {
    const body = serializeParentContext(parentMessages);
    history.push({ role: "system", content: body });
  }

  history.push({ role: "user", content: childPrompt });
  return { systemPrompt, history };
}

function serializeParentContext(messages: DriverMessage[]): string {
  const lines = ["[PARENT CONTEXT — non-interactive summary of the parent agent's recent turns:]"];
  for (const m of messages) {
    const role = m.role.toUpperCase();
    const contentText = typeof m.content === "string"
      ? m.content
      : JSON.stringify(m.content);
    const content = contentText.length > MAX_PARENT_CONTEXT_CHARS
      ? `${contentText.slice(0, MAX_PARENT_CONTEXT_CHARS)}... (truncated)`
      : contentText;
    lines.push(`[${role}] ${content}`);
  }
  lines.push("[END PARENT CONTEXT]");
  return lines.join("\n");
}

async function runWithAutoBackground(
  runnerInput: RunnerInput,
  thresholdMs: number,
): Promise<RaceOutcome> {
  // Kick off the run; we keep the promise regardless of race outcome.
  const completion = runSubagent(runnerInput);

  return raceAutoBackground({
    completion,
    thresholdMs,
    onBackground: () => {
      // Mark the task as still running — the promise continues executing.
      // The caller receives an async launch acknowledgement; completion
      // will surface via task-notification on the parent's next loop.
      updateTaskStatus(runnerInput.taskId, "running");
      // Install a `.finally` handler so the completion still persists
      // its result after the parent stops awaiting it, and mark
      // notified=0 so the parent's next loop sees it.
      completion.catch((err) => {
        // runSubagent never throws, but defensively capture anyway.
        const msg = err instanceof Error ? err.message : String(err);
        completeTask(runnerInput.taskId, {
          status: "failed",
          tokensIn: 0,
          tokensOut: 0,
          error: msg,
        });
      });
      log.info(
        `Subagent auto-backgrounded: taskId=${runnerInput.taskId} ` +
        `threshold=${thresholdMs}ms label="${runnerInput.label}"`,
      );
      return {
        taskId: runnerInput.taskId,
        childSessionId: runnerInput.childSessionId,
        status: "async_launched" as const,
        mode: runnerInput.mode,
      };
    },
  });
}
