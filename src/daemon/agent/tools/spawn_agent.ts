// Tool — Spawn a subagent in any mode.
//
// Thin wrapper over `subagent.spawn()` that exposes modes beyond `sync`
// to the LLM: `async` (fire-and-forget), `fork` (prompt-cache sharing),
// and `worktree` (git-isolated edits). The legacy `delegate` tool stays
// available for sync usage; `spawn_agent` is the superset.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import { spawn, AsyncConcurrencyExceededError } from "../subagent/index.js";
import type { SubagentMode } from "../subagent/index.js";
import { AGENT_TYPES, type AgentType } from "../orchestrator.js";
import {
  getActiveParentMessages,
  getActiveSystemPrompt,
} from "../orchestrator-context.js";
import { WorktreeError } from "../subagent/worktree.js";

const VALID_TYPES = Object.keys(AGENT_TYPES);
const VALID_MODES: readonly SubagentMode[] = ["sync", "async", "fork", "worktree"];

async function execute(args: Record<string, unknown>): Promise<string> {
  const prompt = args.prompt as string;
  const agentType = (args.agent_type as string) ?? "general";
  const mode = (args.mode as string) ?? "sync";
  const label = args.label as string | undefined;
  const includeContext = Boolean(args.include_context);

  if (!prompt) {
    return JSON.stringify({ ok: false, error: "prompt is required" });
  }
  if (!VALID_TYPES.includes(agentType)) {
    return JSON.stringify({
      ok: false,
      error: `Invalid agent_type "${agentType}". Valid: ${VALID_TYPES.join(", ")}`,
    });
  }
  if (!(VALID_MODES as readonly string[]).includes(mode)) {
    return JSON.stringify({
      ok: false,
      error: `Invalid mode "${mode}". Valid: ${VALID_MODES.join(", ")}`,
    });
  }

  try {
    const result = await spawn({
      prompt,
      label,
      agentType: agentType as AgentType,
      mode: mode as SubagentMode,
      parentMessages: includeContext ? getActiveParentMessages() : undefined,
      forkSystemPrompt: mode === "fork" ? getActiveSystemPrompt() : undefined,
    });

    if (result.type === "completed") {
      const c = result.completion;
      return JSON.stringify({
        ok: c.status === "completed",
        status: c.status,
        taskId: c.taskId,
        sessionId: c.childSessionId,
        response: c.response,
        error: c.error,
        tokensIn: c.tokensIn,
        tokensOut: c.tokensOut,
        durationMs: c.durationMs,
        mode: c.mode,
      }, null, 2);
    }

    const ack = result.ack;
    return JSON.stringify({
      ok: true,
      status: ack.status,
      taskId: ack.taskId,
      sessionId: ack.childSessionId,
      mode: ack.mode,
      message:
        "Subagent launched in background. Its completion will be delivered as " +
        "a <task-notification> user message on your next turn.",
    }, null, 2);
  } catch (err) {
    if (err instanceof AsyncConcurrencyExceededError) {
      return JSON.stringify({ ok: false, error: err.message, code: "concurrency_limit" });
    }
    if (err instanceof WorktreeError) {
      return JSON.stringify({ ok: false, error: err.message, code: "worktree_error" });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: msg });
  }
}

export const spawnAgentTool: ToolDefinition = {
  id: "spawn_agent",
  name: "spawn_agent",
  description:
    "Spawn a typed subagent in sync, async, fork, or worktree mode. " +
    "sync=await completion inline; async=fire-and-forget with a task-notification " +
    "later; fork=sync but child inherits parent's prompt (cache-friendly); " +
    "worktree=run in an isolated git worktree for risky edits. " +
    `Agent types: ${VALID_TYPES.join(", ")}.`,
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The task for the subagent",
      },
      agent_type: {
        type: "string",
        enum: VALID_TYPES,
        description: "Role preset controlling which tools the child can use",
      },
      mode: {
        type: "string",
        enum: VALID_MODES as unknown as string[],
        description:
          "Spawn mode: sync (default, awaits inline), async (background, notified later), " +
          "fork (prompt-cache sharing), worktree (isolated git worktree).",
      },
      label: {
        type: "string",
        description: "Short label shown in logs and task notifications",
      },
      include_context: {
        type: "boolean",
        description:
          "Forward the parent's recent conversation turns to the child as context.",
      },
    },
    required: ["prompt"],
  },
  execute,
  aliases: ["subagent", "run_subagent"],
};

registerTool(spawnAgentTool);
