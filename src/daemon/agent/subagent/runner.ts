// Core subagent runner — the single code path that actually drives the
// agent loop for a child session. Every mode (sync, async, fork, worktree)
// funnels through here after mode-specific setup (e.g. worktree creation,
// fork prompt threading).
//
// Invariants:
//   • The caller is responsible for creating the child session *and* the
//     `subagent_task` row before invoking the runner.
//   • The runner transitions the task through running → completed/failed
//     and writes `result_text`, tokens, and error metadata via `store.ts`.
//   • orchestrator-context is save/restored around the run so the parent's
//     active context survives the inner `runAgent()` call.

import { randomUUID } from "node:crypto";
import { runAgent, type AgentRunConfig } from "../agent.js";
import { orchestratorBus } from "../orchestrator.js";
import type { AgentType } from "../orchestrator.js";
import {
  getActiveContext,
  setActiveContext,
} from "../orchestrator-context.js";
import type { DriverMessage } from "../drivers/index.js";
import { getLogger } from "../../../shared/logger.js";
import { completeTask, updateTaskStatus } from "./store.js";
import type { SubagentCompletion, SubagentMode } from "./types.js";

const log = getLogger();

export interface RunnerInput {
  /** Task id from the store. */
  taskId: string;
  /** Child session id (already persisted). */
  childSessionId: string;
  /** Label for logs / orchestrator events. */
  label: string;
  /** Effective mode (may differ from requested mode after auto-background). */
  mode: SubagentMode;
  /** Agent role preset. */
  agentType: AgentType;
  /** Resolved tool ids (from tool-pool.ts). */
  toolIds: string[];
  /** Full agent config — backend, model, system prompt, signal, depth. */
  agentConfig: Omit<AgentRunConfig, "sessionId" | "toolIds">;
  /** Initial conversation history for the child. */
  history: DriverMessage[];
  /** Parent session id for orchestratorBus events. */
  parentSessionId: string;
}

/**
 * Drive one subagent from start to finish. Yields a {@link SubagentCompletion}
 * on terminal state — success or failure. Never throws; all errors are
 * captured into the completion object and persisted.
 */
export async function runSubagent(input: RunnerInput): Promise<SubagentCompletion> {
  const start = Date.now();

  updateTaskStatus(input.taskId, "running");

  orchestratorBus.emit("sub:started", {
    parentSessionId: input.parentSessionId,
    childSessionId: input.childSessionId,
    label: input.label,
    agentType: input.agentType,
  });

  // Save parent's active context so the child's runAgent() can overwrite it
  // without losing our state; restore afterwards.
  const parentContext = getActiveContext();

  let fullResponse = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let subagentError: string | undefined;

  try {
    const config: AgentRunConfig = {
      ...input.agentConfig,
      sessionId: input.childSessionId,
      toolIds: input.toolIds,
    };

    for await (const event of runAgent(config, input.history)) {
      switch (event.type) {
        case "text_delta":
          fullResponse += event.content;
          orchestratorBus.emit("sub:text_delta", {
            childSessionId: input.childSessionId,
            content: event.content,
          });
          break;

        case "tool_call_start":
          orchestratorBus.emit("sub:tool_call", {
            childSessionId: input.childSessionId,
            toolName: event.toolCall.name,
            toolCallId: event.toolCall.id,
          });
          break;

        case "tool_result":
          orchestratorBus.emit("sub:tool_result", {
            childSessionId: input.childSessionId,
            toolCallId: event.toolCallId,
            isError: event.isError,
          });
          break;

        case "turn_complete":
          tokensIn = event.tokensIn;
          tokensOut = event.tokensOut;
          break;

        case "error":
          subagentError = event.message;
          break;
      }
    }
  } catch (err) {
    subagentError = err instanceof Error ? err.message : String(err);
    log.error(`Subagent runner: ${input.taskId} threw — ${subagentError}`);
  } finally {
    if (parentContext) setActiveContext(parentContext);
  }

  const durationMs = Date.now() - start;
  const status = subagentError ? "failed" : "completed";

  completeTask(input.taskId, {
    status,
    tokensIn,
    tokensOut,
    resultText: fullResponse || null,
    error: subagentError ?? null,
  });

  orchestratorBus.emit("sub:complete", {
    childSessionId: input.childSessionId,
    label: input.label,
    status: status === "completed" ? "success" : "error",
    durationMs,
  });

  return {
    taskId: input.taskId,
    childSessionId: input.childSessionId,
    status,
    response: fullResponse,
    error: subagentError,
    tokensIn,
    tokensOut,
    durationMs,
    mode: input.mode,
  };
}

/** Utility for callers needing a fresh task id (16-char hex). */
export function newTaskId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}
