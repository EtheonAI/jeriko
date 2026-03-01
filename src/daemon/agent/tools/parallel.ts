// Tool — Parallel task execution via typed sub-agents.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import { fanOut, AGENT_TYPES, type AgentType } from "../orchestrator.js";
import { getActiveSystemPrompt, getActiveParentMessages, getActiveBackend, getActiveModel } from "../orchestrator-context.js";
import { readFileSync } from "node:fs";

const MAX_CONCURRENT = 4;
const VALID_TYPES = Object.keys(AGENT_TYPES);

async function execute(args: Record<string, unknown>): Promise<string> {
  const tasks = args.tasks as Array<string | { prompt: string; label?: string; agentType?: string }>;
  const concurrency = (args.concurrency as number) ?? MAX_CONCURRENT;
  const defaultType = (args.agent_type as string) ?? "general";

  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return JSON.stringify({ ok: false, error: "tasks array is required and must be non-empty" });
  }

  if (tasks.length > 20) {
    return JSON.stringify({ ok: false, error: "Maximum 20 parallel tasks allowed" });
  }

  if (!VALID_TYPES.includes(defaultType)) {
    return JSON.stringify({ ok: false, error: `Invalid agent_type. Must be one of: ${VALID_TYPES.join(", ")}` });
  }

  try {
    const subTasks = tasks.map((t) => {
      if (typeof t === "string") {
        return { label: t, prompt: t, agentType: defaultType as AgentType };
      }
      return {
        label: t.label ?? t.prompt,
        prompt: t.prompt,
        agentType: (t.agentType ?? defaultType) as AgentType,
      };
    });

    // Inherit parent's system prompt, model, and conversation context
    const systemPrompt = getActiveSystemPrompt();
    const parentMessages = getActiveParentMessages();
    const backend = getActiveBackend();
    const model = getActiveModel();

    const results = await fanOut(subTasks, {
      maxConcurrency: concurrency,
      systemPrompt,
      parentMessages: parentMessages.length > 0 ? parentMessages : undefined,
      defaultBackend: backend,
      defaultModel: model,
    });

    const formatted = results.map((r) => ({
      label: r.label,
      status: r.status,
      agentType: r.agentType,
      response: r.response,
      context: {
        toolCalls: r.context.toolCalls,
        filesWritten: r.context.filesWritten.map((path) => ({
          path,
          content: readFileSafe(path),
        })),
        filesEdited: r.context.filesEdited.map((path) => ({
          path,
          content: readFileSafe(path),
        })),
        errors: r.context.errors,
        artifacts: r.context.artifacts,
      },
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      durationMs: r.durationMs,
    }));

    return JSON.stringify({ ok: true, results: formatted }, null, 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: `Parallel execution failed: ${msg}` });
  }
}

/** Maximum bytes to read back from a file for context return. */
const MAX_FILE_CONTENT_BYTES = 4096;

/**
 * Read a file safely, returning content capped at MAX_FILE_CONTENT_BYTES.
 * Returns "(unreadable)" if the file doesn't exist or can't be read.
 */
function readFileSafe(path: string): string {
  try {
    const buf = readFileSync(path);
    if (buf.length <= MAX_FILE_CONTENT_BYTES) {
      return buf.toString("utf-8");
    }
    return buf.subarray(0, MAX_FILE_CONTENT_BYTES).toString("utf-8") + "... (truncated)";
  } catch {
    return "(unreadable)";
  }
}

export const parallelTool: ToolDefinition = {
  id: "parallel_tasks",
  name: "parallel_tasks",
  description:
    "Run multiple tasks in parallel using typed sub-agents. " +
    "Each task gets its own agent session with scoped tools. " +
    `Agent types: ${VALID_TYPES.join(", ")}. ` +
    "Returns structured context: tool calls made, files touched, errors.",
  parameters: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "string",
          description: "A task string, or object with prompt/label/agentType",
        },
        description: "Array of tasks to execute in parallel",
      },
      concurrency: {
        type: "number",
        description: `Max concurrent tasks (default: ${MAX_CONCURRENT}, max: 10)`,
      },
      agent_type: {
        type: "string",
        enum: VALID_TYPES,
        description: "Default agent type for all tasks (default: general)",
      },
    },
    required: ["tasks"],
  },
  execute,
  aliases: ["parallel", "multi_task", "fan_out"],
};

registerTool(parallelTool);
