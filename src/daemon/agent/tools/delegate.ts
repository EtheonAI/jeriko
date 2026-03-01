// Tool — Delegate a task to a sub-agent.
// Simple, model-agnostic interface for spawning a typed sub-agent.
// Schema is intentionally minimal so OSS models (Llama, Qwen, Mistral)
// can call it reliably — just prompt + optional agent_type + include_context.
//
// Returns full structured context (tool calls, files, errors) so the
// parent agent doesn't need to re-read files or re-run commands.
// This is the fix for the "text-only return" problem (Claude Code #5812).

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import { delegate, AGENT_TYPES, type AgentType } from "../orchestrator.js";
import { getActiveSystemPrompt, getActiveParentMessages, getActiveBackend, getActiveModel } from "../orchestrator-context.js";
import { readFileSync } from "node:fs";

const VALID_TYPES = Object.keys(AGENT_TYPES);

/** Maximum bytes to read back from a written/edited file for context return. */
const MAX_FILE_CONTENT_BYTES = 4096;

async function execute(args: Record<string, unknown>): Promise<string> {
  const prompt = args.prompt as string;
  const agentType = (args.agent_type as string) ?? "general";
  const includeContext = (args.include_context as boolean) ?? false;

  if (!prompt) {
    return JSON.stringify({ ok: false, error: "prompt is required" });
  }

  if (!VALID_TYPES.includes(agentType)) {
    return JSON.stringify({
      ok: false,
      error: `Invalid agent_type "${agentType}". Must be one of: ${VALID_TYPES.join(", ")}`,
    });
  }

  try {
    // Inherit the parent's system prompt, backend, and model so sub-agents
    // behave consistently and use the same LLM provider.
    const systemPrompt = getActiveSystemPrompt();
    const backend = getActiveBackend();
    const model = getActiveModel();

    // Optionally forward parent conversation context to the sub-agent
    const parentMessages = includeContext ? getActiveParentMessages() : undefined;

    const result = await delegate(prompt, {
      agentType: agentType as AgentType,
      systemPrompt,
      parentMessages,
      backend,
      model,
    });

    // Build full context response with actual tool call results, file contents
    const contextResponse = buildContextResponse(result);

    return JSON.stringify({
      ok: true,
      response: result.response,
      sessionId: result.sessionId,
      agentType: result.agentType,
      context: contextResponse,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    }, null, 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: `Delegate failed: ${msg}` });
  }
}

// ---------------------------------------------------------------------------
// Context response builder — reads back file contents for full context
// ---------------------------------------------------------------------------

interface ContextResponse {
  toolCalls: Array<{
    name: string;
    arguments: string;
    result: string;
    isError: boolean;
  }>;
  filesWritten: Array<{ path: string; content: string }>;
  filesEdited: Array<{ path: string; content: string }>;
  errors: string[];
  artifacts: Array<{ key: string; value: string }>;
}

/**
 * Build a rich context response from a DelegateResult.
 * Reads back file contents from disk (capped at MAX_FILE_CONTENT_BYTES)
 * so the parent LLM sees exactly what the child did.
 */
function buildContextResponse(result: { context: import("../orchestrator.js").SubTaskContext }): ContextResponse {
  const ctx = result.context;

  return {
    toolCalls: ctx.toolCalls,
    filesWritten: ctx.filesWritten.map((path) => ({
      path,
      content: readFileSafe(path),
    })),
    filesEdited: ctx.filesEdited.map((path) => ({
      path,
      content: readFileSafe(path),
    })),
    errors: ctx.errors,
    artifacts: ctx.artifacts,
  };
}

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

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const delegateTool: ToolDefinition = {
  id: "delegate",
  name: "delegate",
  description:
    "Delegate a task to a sub-agent. The sub-agent runs in its own session " +
    "with scoped tools based on agent_type. Returns the full response and " +
    "structured context (tool calls made, files written/edited, errors). " +
    `Agent types: ${VALID_TYPES.join(", ")}. ` +
    "Use include_context=true to forward conversation history to the sub-agent.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The task to delegate to the sub-agent",
      },
      agent_type: {
        type: "string",
        enum: VALID_TYPES,
        description: "Type of sub-agent to use (default: general). " +
          "general=all tools, research=read-only+web, task=bash+files, " +
          "explore=read-only, plan=read+web",
      },
      include_context: {
        type: "boolean",
        description: "Forward parent conversation history to the sub-agent (default: false). " +
          "Set to true when the sub-agent needs awareness of what was discussed earlier.",
      },
    },
    required: ["prompt"],
  },
  execute,
  aliases: ["delegate_task", "sub_agent", "spawn_agent"],
};

registerTool(delegateTool);
