// Daemon — Context compaction (DB-level).
// When a session's token count approaches the compaction threshold,
// older messages are compacted to reclaim space.
//
// Uses buildDriverMessages() for proper tool metadata reconstruction,
// then the same turn-based grouping as history.ts to guarantee tool
// call/result pairs are never separated during compaction.

import { getMessages, addMessage, addPart, clearMessages, type Message } from "./message.js";
import { getSession, updateSession } from "./session.js";
import {
  estimateTokens,
  contextUsagePercent,
  DEFAULT_CONTEXT_LIMIT,
  COMPACTION_CONTEXT_RATIO,
  COMPACT_TARGET_RATIO,
} from "../../../shared/tokens.js";
import { getCapabilities, resolveModel } from "../drivers/models.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a compaction operation. */
export interface CompactionResult {
  sessionId: string;
  /** Whether compaction was actually performed. */
  compacted: boolean;
  /** Token count before compaction. */
  beforeTokens: number;
  /** Token count after compaction (0 if not compacted). */
  afterTokens: number;
  /** Number of messages before compaction. */
  beforeMessages: number;
  /** Number of messages after compaction (0 if not compacted). */
  afterMessages: number;
  /** The compaction threshold percentage. */
  thresholdPercent: number;
  /** The actual usage percentage before compaction. */
  usagePercent: number;
}

/** Options for compaction behavior. */
export interface CompactionOptions {
  /** Override the model for context window calculation. */
  model?: string;
  /** Number of recent messages to always preserve. Default: derived from context budget. */
  preserveRecent?: number;
  /** Custom compaction threshold (0-100). Default: COMPACTION_CONTEXT_RATIO * 100. */
  thresholdPercent?: number;
  /** If true, force compaction even if below threshold. */
  force?: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a session needs compaction and perform it if so.
 *
 * Strategy:
 *  1. Reconstruct full DriverMessage history (including tool_calls metadata).
 *  2. Group into atomic turns using the shared algorithm from history.ts.
 *  3. Select recent turns within the compaction budget.
 *  4. Insert a summary marker for omitted turns.
 *  5. Re-persist to DB with tool metadata preserved.
 */
export async function compactSession(
  sessionId: string,
  opts: CompactionOptions = {},
): Promise<CompactionResult> {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session "${sessionId}" not found`);
  }

  const model = opts.model ?? session.model;
  const thresholdPercent = opts.thresholdPercent ?? (COMPACTION_CONTEXT_RATIO * 100);

  const contextLimit = resolveContextLimit(model);

  const messages = getMessages(sessionId);
  const beforeMessages = messages.length;
  const beforeTokens = computeTokenCount(messages);
  const usagePercent = contextUsagePercent(beforeTokens, contextLimit);

  const needsCompaction = opts.force || usagePercent >= thresholdPercent;

  if (!needsCompaction || beforeMessages <= (opts.preserveRecent ?? 4) + 2) {
    return {
      sessionId,
      compacted: false,
      beforeTokens,
      afterTokens: 0,
      beforeMessages,
      afterMessages: 0,
      thresholdPercent,
      usagePercent,
    };
  }

  log.info(
    `Compacting session ${sessionId}: ${beforeMessages} messages, ` +
    `${beforeTokens} tokens (${usagePercent.toFixed(1)}% of ${contextLimit})`,
  );

  // Import shared infrastructure from history.ts and drivers.
  const { groupIntoTurns, estimateTurnTokens } = await import("../history.js");
  const { buildDriverMessages } = await import("./message.js");
  const { messageText } = await import("../drivers/index.js");

  // Reconstruct full DriverMessages WITH tool metadata from parts table.
  // Without this, groupIntoTurns can't detect tool call/result pairs.
  const driverMessages = buildDriverMessages(sessionId);
  const systemMsgs = driverMessages.filter((m) => m.role === "system");
  const nonSystem = driverMessages.filter((m) => m.role !== "system");

  const turns = groupIntoTurns(nonSystem);

  // Token budget: target COMPACT_TARGET_RATIO (50%) of context.
  const systemTokens = systemMsgs.reduce(
    (s, m) => s + estimateTokens(messageText(m)),
    0,
  );
  const targetBudget = Math.max(
    Math.floor(contextLimit * COMPACT_TARGET_RATIO) - systemTokens,
    0,
  );

  const messageLimit = opts.preserveRecent ?? Infinity;
  const selectedTurns: typeof turns = [];
  let accTokens = 0;
  let accMessages = 0;

  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]!;
    const turnTokens = estimateTurnTokens(turn);
    if (accTokens + turnTokens > targetBudget) break;
    if (accMessages + turn.length > messageLimit) break;
    selectedTurns.unshift(turn);
    accTokens += turnTokens;
    accMessages += turn.length;
  }

  // Build summary from omitted turns.
  const omittedTurns = turns.length - selectedTurns.length;
  const omittedMessages = omittedTurns > 0
    ? turns.slice(0, omittedTurns).flat()
    : [];

  // Clear DB and re-persist with tool metadata intact.
  clearMessages(sessionId);

  // Re-insert system messages.
  for (const msg of systemMsgs) {
    addMessage(sessionId, "system", messageText(msg));
  }

  // Insert compaction summary if turns were omitted.
  if (omittedMessages.length > 0) {
    const summary = buildSummary(omittedMessages.map((m) => ({
      role: m.role,
      content: messageText(m),
    })));
    addMessage(sessionId, "system", summary);
  }

  // Re-insert selected turns with tool metadata preserved.
  for (const turn of selectedTurns) {
    for (const m of turn) {
      const text = messageText(m);
      const row = addMessage(sessionId, m.role as Message["role"], text);

      // Persist tool_call parts so future buildDriverMessages() reconstructs them.
      if (m.role === "assistant" && m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          addPart(row.id, "tool_call", tc.arguments, tc.name, tc.id);
        }
      }

      // Persist tool_result parts so future buildDriverMessages() reconstructs tool_call_id.
      if (m.role === "tool" && m.tool_call_id) {
        addPart(row.id, "tool_result", text, undefined, m.tool_call_id);
      }
    }
  }

  const afterMessages = systemMsgs.length + (omittedMessages.length > 0 ? 1 : 0) + accMessages;
  const afterTokens = computeTokenCount(getMessages(sessionId));

  updateSession(sessionId, { token_count: afterTokens });

  log.info(
    `Compaction complete: ${beforeMessages} -> ${afterMessages} messages, ` +
    `${beforeTokens} -> ${afterTokens} tokens ` +
    `(saved ${((1 - afterTokens / beforeTokens) * 100).toFixed(1)}%)`,
  );

  return {
    sessionId,
    compacted: true,
    beforeTokens,
    afterTokens,
    beforeMessages,
    afterMessages,
    thresholdPercent,
    usagePercent,
  };
}

/**
 * Check whether a session needs compaction without performing it.
 */
export function needsCompaction(
  sessionId: string,
  opts: { model?: string; thresholdPercent?: number } = {},
): boolean {
  const session = getSession(sessionId);
  if (!session) return false;

  const model = opts.model ?? session.model;
  const thresholdPercent = opts.thresholdPercent ?? (COMPACTION_CONTEXT_RATIO * 100);
  const contextLimit = resolveContextLimit(model);

  const messages = getMessages(sessionId);
  const tokens = computeTokenCount(messages);
  const usage = contextUsagePercent(tokens, contextLimit);

  return usage >= thresholdPercent;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeTokenCount(messages: Pick<Message, "content">[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/**
 * Build a human-readable summary of omitted messages for the compaction marker.
 */
function buildSummary(messages: Array<{ role: string; content: string }>): string {
  const roleCount: Record<string, number> = {};

  for (const msg of messages) {
    roleCount[msg.role] = (roleCount[msg.role] ?? 0) + 1;
  }

  const parts: string[] = [
    `[Context compacted: ${messages.length} messages removed (~${estimateTokens(messages.map(m => m.content).join(""))} tokens).`,
  ];

  const breakdown = Object.entries(roleCount)
    .map(([role, count]) => `${count} ${role}`)
    .join(", ");
  parts.push(`Breakdown: ${breakdown}.`);

  const topics = extractTopics(messages);
  if (topics.length > 0) {
    parts.push(`Key topics: ${topics.join(", ")}.`);
  }

  parts.push("]");
  return parts.join(" ");
}

/**
 * Resolve a model name to its context window size using the dynamic registry.
 * Tries anthropic → openai → local providers, returns the first match.
 */
function resolveContextLimit(model: string): number {
  for (const provider of ["anthropic", "openai", "local"]) {
    const resolved = resolveModel(provider, model);
    const caps = getCapabilities(provider, resolved);
    if (caps.context > 0) return caps.context;
  }
  return DEFAULT_CONTEXT_LIMIT;
}

function extractTopics(messages: Array<{ content: string }>): string[] {
  const allText = messages.map((m) => m.content).join(" ");
  const wordFreq = new Map<string, number>();

  const tokens = allText.match(/\b[A-Z][a-zA-Z_]{2,}\b|\b[a-z_]+\.[a-z_]+\b/g) ?? [];
  for (const token of tokens) {
    wordFreq.set(token, (wordFreq.get(token) ?? 0) + 1);
  }

  return [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}
