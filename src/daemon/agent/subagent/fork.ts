// Fork-mode subagent — prompt-cache sharing (Feature 2).
//
// In fork mode the child inherits the parent's *exact* rendered system
// prompt bytes plus its full conversation history. Because Anthropic's
// prompt cache keys on the byte-identical prefix of the API request, the
// child's first message reuses the parent's cached entry — a significant
// token saving across a fleet of agents and especially valuable for
// recursive or burst-style subagent workloads.
//
// The sharing is intentionally lossy for transcripts — we do NOT try to
// replay the parent's tool calls. The forked child only sees the parent's
// messages as *conversational context*; tool history is collapsed into
// the text body of the inherited messages (runAgent already sanitizes
// orphan tool_calls in `sanitizeToolPairs`).

import type { DriverMessage } from "../drivers/index.js";
import { getActiveContext } from "../orchestrator-context.js";

export interface ForkPromptInput {
  /** Prompt given to the fork itself (the worker's task). */
  childPrompt: string;
  /**
   * Explicit system prompt to inherit. If omitted, the parent's active
   * context is consulted. If that's also missing, `undefined` is returned
   * (the child falls back to the default system prompt).
   */
  systemPrompt?: string;
  /**
   * Parent messages to clone. If omitted, the parent's active context is
   * consulted; if none is active, an empty array is returned.
   */
  parentMessages?: DriverMessage[];
}

export interface ForkPromptResult {
  /** System prompt passed verbatim to the child's `runAgent()`. */
  systemPrompt: string | undefined;
  /** Initial conversation for the child — parent messages + the new user turn. */
  history: DriverMessage[];
}

/**
 * Build the child's initial history so its API request reuses the parent's
 * prompt-cache prefix.
 *
 * Strategy:
 *   1. Emit the parent's exact system prompt bytes (no mutation).
 *   2. Clone the parent's non-system conversation history.
 *   3. Append a new user message containing the child's own task, wrapped
 *      in a fence that tells the model this is a forked subtask.
 */
export function buildForkPrompt(input: ForkPromptInput): ForkPromptResult {
  const active = getActiveContext();

  const systemPrompt =
    input.systemPrompt
    ?? active?.systemPrompt
    ?? undefined;

  const parentMessages =
    input.parentMessages
    ?? (active ? active.messages.filter((m) => m.role !== "system") : []);

  const history: DriverMessage[] = parentMessages.map(cloneMessage);

  history.push({
    role: "user",
    content: wrapChildPrompt(input.childPrompt),
  });

  return { systemPrompt, history };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const FORK_DIRECTIVE = [
  "[FORK SUBAGENT TASK]",
  "You are a forked worker. The parent's conversation above is read-only",
  "context. Do not delegate further (no nested spawning). Focus only on the",
  "task below and return a concise result. When you finish, respond with a",
  "short summary that can stand alone.",
  "",
].join("\n");

function wrapChildPrompt(prompt: string): string {
  return `${FORK_DIRECTIVE}${prompt}`;
}

function cloneMessage(m: DriverMessage): DriverMessage {
  // Structured clone preserves tool_calls / content blocks verbatim.
  if (typeof structuredClone === "function") {
    return structuredClone(m);
  }
  // Fallback for environments without structuredClone (Node < 17).
  return JSON.parse(JSON.stringify(m)) as DriverMessage;
}
