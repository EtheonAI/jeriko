// Daemon — Active orchestrator context.
// Module-level state holder for the currently running agent's context.
// Set by runAgent() at loop start, read by orchestrator tools (delegate, parallel).
//
// This follows the same singleton pattern as getDatabase() in db.ts:
// module-level state, explicit set/get/clear functions.
//
// Why module-level state? The agent loop and tool execution happen in the
// same process, on the same event loop. When a tool like `delegate` runs,
// it needs to know the parent's system prompt, conversation history, and
// nesting depth — all of which are set by runAgent() before the tool is called.

import type { DriverMessage } from "./drivers/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Snapshot of the active agent's context, set by runAgent(). */
export interface ActiveContext {
  /** The system prompt currently in use. */
  systemPrompt: string | undefined;
  /** The conversation history at the point the context was set. */
  messages: DriverMessage[];
  /** Current nesting depth (0 = top-level agent). */
  depth: number;
  /** The LLM backend in use (e.g. "local", "claude", "openai"). */
  backend?: string;
  /** The model identifier in use (e.g. "gpt-oss:120b-cloud", "claude"). */
  model?: string;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let activeContext: ActiveContext | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the full active context snapshot, or null if none is set.
 * Used by delegate() to save/restore the parent's context around
 * child runAgent() calls (re-entrancy protection).
 */
export function getActiveContext(): ActiveContext | null {
  return activeContext;
}

/**
 * Set the active context. Called by runAgent() before the round loop starts.
 * Overwrites any previous context (there's only one active agent loop
 * per process at the tool-execution level).
 */
export function setActiveContext(ctx: ActiveContext): void {
  activeContext = ctx;
}

/**
 * Get the system prompt of the currently running agent.
 * Returns undefined if no agent is active or no system prompt was set.
 */
export function getActiveSystemPrompt(): string | undefined {
  return activeContext?.systemPrompt;
}

/**
 * Get the last N non-system messages from the active agent's conversation.
 * Used by orchestrator tools to forward parent context to sub-agents.
 *
 * Returns an empty array if no context is active.
 *
 * @param maxMessages Maximum number of messages to return (default: 10)
 */
export function getActiveParentMessages(maxMessages = 10): DriverMessage[] {
  if (!activeContext) return [];

  const nonSystem = activeContext.messages.filter((m) => m.role !== "system");
  if (nonSystem.length <= maxMessages) return [...nonSystem];

  return nonSystem.slice(-maxMessages);
}

/**
 * Get the current nesting depth of the active agent.
 * Returns 0 if no context is active (top-level).
 */
export function getActiveDepth(): number {
  return activeContext?.depth ?? 0;
}

/**
 * Get the backend of the currently running agent.
 * Returns undefined if no context is active.
 */
export function getActiveBackend(): string | undefined {
  return activeContext?.backend;
}

/**
 * Get the model of the currently running agent.
 * Returns undefined if no context is active.
 */
export function getActiveModel(): string | undefined {
  return activeContext?.model;
}

/**
 * Clear the active context. Called when the agent loop completes.
 */
export function clearActiveContext(): void {
  activeContext = null;
}
