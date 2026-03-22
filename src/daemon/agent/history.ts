// Daemon — Conversation history management.
// Single source of truth for all history trimming and compaction.
//
// Two entry points, one algorithm:
//   - trimHistory()    — pre-loop: fit history within user config + model context
//   - compactHistory() — in-loop: emergency compaction when context fills during execution
//
// Both use turn-based grouping to guarantee tool call/result pairs are never
// separated. An assistant message with tool_calls and its corresponding tool
// result messages form an atomic unit — kept or discarded together.

import { messageText, type DriverMessage } from "./drivers/index.js";
import {
  estimateTokens,
  PRE_TRIM_CONTEXT_RATIO,
  COMPACT_TARGET_RATIO,
  MIN_MESSAGES_FOR_COMPACTION,
} from "../../shared/tokens.js";

// Re-export constants so callers can import from one place
export {
  DEFAULT_CONTEXT_LIMIT,
  PRE_TRIM_CONTEXT_RATIO,
  COMPACTION_CONTEXT_RATIO,
  COMPACT_TARGET_RATIO,
  MIN_MESSAGES_FOR_COMPACTION,
} from "../../shared/tokens.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A turn is an atomic group of messages that must stay together. */
export type Turn = DriverMessage[];

/** Options for trimming conversation history. */
export interface TrimHistoryOptions {
  /** Model's context window size in tokens. Used for auto-limiting. */
  contextLimit: number;
  /** Max non-system messages to keep. Undefined = no message limit. */
  maxMessages?: number;
  /** Max estimated tokens of history to keep. Undefined = auto (contextLimit * PRE_TRIM_CONTEXT_RATIO). */
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// Turn grouping
// ---------------------------------------------------------------------------

/**
 * Group a flat message array into turns — atomic units that must stay together.
 *
 * A turn is one of:
 *   - A single user or system message
 *   - A single assistant message (text-only response)
 *   - An assistant message with tool_calls followed by its tool result messages
 *
 * This ensures tool call/result pairing is preserved through any trimming.
 */
export function groupIntoTurns(messages: DriverMessage[]): Turn[] {
  const turns: Turn[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i]!;

    if (msg.role === "assistant" && msg.tool_calls?.length) {
      // Collect the assistant message + all following tool result messages
      const group: DriverMessage[] = [msg];
      i++;
      while (i < messages.length && messages[i]!.role === "tool") {
        group.push(messages[i]!);
        i++;
      }
      turns.push(group);
    } else {
      turns.push([msg]);
      i++;
    }
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Token estimation for turns
// ---------------------------------------------------------------------------

/**
 * Estimate the token count for a turn (group of messages).
 */
export function estimateTurnTokens(turn: Turn): number {
  return estimateTokens(turn.map((m) => messageText(m)).join(""));
}

/**
 * Estimate the total token count for an array of messages.
 */
export function estimateMessagesTokens(messages: DriverMessage[]): number {
  return estimateTokens(messages.map((m) => messageText(m)).join(""));
}

// ---------------------------------------------------------------------------
// Message partitioning
// ---------------------------------------------------------------------------

/** Split messages into system and non-system groups. */
function partitionMessages(messages: DriverMessage[]): {
  systemMsgs: DriverMessage[];
  nonSystem: DriverMessage[];
} {
  return {
    systemMsgs: messages.filter((m) => m.role === "system"),
    nonSystem: messages.filter((m) => m.role !== "system"),
  };
}

// ---------------------------------------------------------------------------
// Core selection algorithm
// ---------------------------------------------------------------------------

/**
 * Select the most recent turns that fit within a token and message budget.
 *
 * Works backwards from the most recent turn, accumulating until either
 * limit is hit. Returns the selected turns in chronological order.
 *
 * @param turns         Chronologically ordered turns to select from.
 * @param tokenBudget   Maximum estimated tokens for selected turns.
 * @param messageLimit  Maximum number of individual messages across selected turns.
 * @returns             Selected turns (subset of input, preserving order).
 */
function selectRecentTurns(
  turns: Turn[],
  tokenBudget: number,
  messageLimit: number,
): Turn[] {
  const selected: Turn[] = [];
  let accumulatedTokens = 0;
  let accumulatedMessages = 0;

  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]!;
    const turnTokens = estimateTurnTokens(turn);
    const turnMsgCount = turn.length;

    if (accumulatedTokens + turnTokens > tokenBudget) break;
    if (accumulatedMessages + turnMsgCount > messageLimit) break;

    selected.unshift(turn);
    accumulatedTokens += turnTokens;
    accumulatedMessages += turnMsgCount;
  }

  return selected;
}

/**
 * Build a trimmed message array from system messages and selected turns.
 * Inserts a compaction marker when turns were omitted.
 */
function buildTrimmedResult(
  systemMsgs: DriverMessage[],
  selected: Turn[],
  totalTurnCount: number,
): DriverMessage[] {
  const omittedCount = totalTurnCount - selected.length;
  const result: DriverMessage[] = [...systemMsgs];

  if (omittedCount > 0) {
    result.push({
      role: "system",
      content: `[Earlier conversation history was trimmed (${omittedCount} turn(s) omitted) to stay within context limits.]`,
    });
  }

  for (const turn of selected) {
    result.push(...turn);
  }

  return result;
}

/**
 * Compute the non-system token budget given a total budget and system messages.
 */
function computeTokenBudget(totalBudget: number, systemMsgs: DriverMessage[]): number {
  const systemTokens = estimateMessagesTokens(systemMsgs);
  return Math.max(totalBudget - systemTokens, 0);
}

// ---------------------------------------------------------------------------
// Public API — sanitizeToolPairs (validation)
// ---------------------------------------------------------------------------

/**
 * Validate and repair tool_call / tool_result pairs in conversation history.
 *
 * Provider APIs require strict invariants:
 *   - Anthropic: every tool_result must reference a tool_use_id from a preceding assistant
 *   - OpenAI/Groq: every role:tool message must have a non-empty tool_call_id
 *   - All providers: tool_call IDs must be non-empty strings
 *
 * Corruption happens when:
 *   - Agent crashes mid-tool-execution (results never stored)
 *   - DB parts table loses tool_call_id (null → empty string on reconstruction)
 *   - Old compaction logic broke tool pairs
 *   - Session resumed after partial writes
 *
 * This function runs a two-pass validation:
 *   Pass 1: Collect all tool_call_ids present in tool result messages.
 *   Pass 2: Forward scan — keep only assistant tool_calls that have results,
 *           and tool results whose tool_call_id matches a declared tool_call.
 *
 * @param messages  Conversation history (may contain corrupted tool pairs).
 * @returns         Sanitized history with all provider invariants satisfied.
 */
export function sanitizeToolPairs(messages: DriverMessage[]): DriverMessage[] {
  // Pass 1: Collect all tool_call_ids that exist in tool result messages.
  // This tells us which assistant tool_calls actually have matching results.
  const resultIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role === "tool" && msg.tool_call_id) {
      resultIds.add(msg.tool_call_id);
    }
  }

  // Pass 2: Build validated output, enforcing provider invariants.
  const result: DriverMessage[] = [];
  const declaredIds = new Set<string>();

  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls?.length) {
      // Filter to tool_calls that have: non-empty id, non-empty name, AND a matching result
      const validCalls = msg.tool_calls.filter(
        (tc) => tc.id && tc.name && resultIds.has(tc.id),
      );

      if (validCalls.length > 0) {
        // Keep assistant with only the valid tool_calls
        result.push({ ...msg, tool_calls: validCalls });
        for (const tc of validCalls) declaredIds.add(tc.id);
      } else if (messageText(msg)) {
        // No valid tool_calls but has text — keep as text-only assistant
        result.push({ ...msg, tool_calls: undefined });
      }
      // else: empty text + no valid calls → drop entirely (nothing useful)
    } else if (msg.role === "tool") {
      // Keep only if: has non-empty tool_call_id AND matches a declared tool_call
      if (msg.tool_call_id && declaredIds.has(msg.tool_call_id)) {
        result.push(msg);
      }
      // else: orphaned or malformed tool message → silently drop
    } else {
      result.push(msg);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API — trimHistory (pre-loop)
// ---------------------------------------------------------------------------

/**
 * Trim conversation history to fit within configured limits.
 *
 * Called once before the agent loop starts. Prevents sending unbounded
 * history to token-limited providers (Groq, etc.) and reduces cost on
 * providers billed by input tokens (Anthropic, OpenAI).
 *
 * Strategy:
 *   1. System messages are always kept (they carry the prompt).
 *   2. Non-system messages are grouped into turns to preserve tool call integrity.
 *   3. Turns are selected from most recent to oldest, respecting both
 *      maxMessages and maxTokens limits.
 *   4. A compaction marker is inserted when turns are omitted.
 *
 * If no explicit limits are set, auto-limits to PRE_TRIM_CONTEXT_RATIO (60%)
 * of the model's context window — leaving headroom for the system prompt,
 * tool definitions, and response.
 *
 * @param messages  Full conversation history (system + user/assistant/tool).
 * @param options   Trimming constraints (context window, message/token limits).
 * @returns         Trimmed history with tool call/result pairs intact.
 */
export function trimHistory(
  messages: DriverMessage[],
  options: TrimHistoryOptions,
): DriverMessage[] {
  const { systemMsgs, nonSystem } = partitionMessages(messages);

  if (nonSystem.length === 0) return messages;

  const turns = groupIntoTurns(nonSystem);

  const autoTokenBudget = Math.floor(options.contextLimit * PRE_TRIM_CONTEXT_RATIO);
  const rawBudget = options.maxTokens ?? autoTokenBudget;
  const tokenBudget = computeTokenBudget(rawBudget, systemMsgs);
  const messageLimit = options.maxMessages ?? Infinity;

  const selected = selectRecentTurns(turns, tokenBudget, messageLimit);

  if (selected.length === turns.length) return messages;

  return buildTrimmedResult(systemMsgs, selected, turns.length);
}

// ---------------------------------------------------------------------------
// Public API — compactHistory (in-loop)
// ---------------------------------------------------------------------------

/**
 * Emergency compaction when context fills during the agent loop.
 *
 * Called when accumulated tokens exceed COMPACTION_CONTEXT_RATIO (75%) of
 * the model's context window. Uses the same turn-based algorithm as
 * trimHistory() but with a tighter budget (COMPACT_TARGET_RATIO = 50%).
 *
 * Unlike trimHistory(), this does NOT respect user-configured maxMessages/maxTokens —
 * those are initial-load constraints. In-loop compaction is a safety mechanism
 * that must always succeed in freeing space.
 *
 * @param messages      Current in-memory message array.
 * @param contextLimit  Model's context window size in tokens.
 * @returns             Compacted history with tool call/result pairs intact.
 */
export function compactHistory(
  messages: DriverMessage[],
  contextLimit: number,
): DriverMessage[] {
  const { systemMsgs, nonSystem } = partitionMessages(messages);

  if (nonSystem.length < MIN_MESSAGES_FOR_COMPACTION) return messages;

  const turns = groupIntoTurns(nonSystem);
  const compactBudget = computeTokenBudget(
    Math.floor(contextLimit * COMPACT_TARGET_RATIO),
    systemMsgs,
  );

  const selected = selectRecentTurns(turns, compactBudget, Infinity);

  if (selected.length === turns.length) return messages;

  return buildTrimmedResult(systemMsgs, selected, turns.length);
}
