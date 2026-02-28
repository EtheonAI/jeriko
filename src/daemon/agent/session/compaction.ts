// Daemon — Context compaction.
// When a session's token count approaches 75% of the model's context window,
// older messages are summarized to reclaim space.

import { getMessages, addMessage, clearMessages, type Message } from "./message.js";
import { getSession, updateSession } from "./session.js";
import { estimateTokens, contextUsagePercent } from "../../../shared/tokens.js";
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
  /** Number of recent messages to always preserve. Default: 6. */
  preserveRecent?: number;
  /** Custom compaction threshold (0-100). Default: 75. */
  thresholdPercent?: number;
  /** If true, force compaction even if below threshold. */
  force?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PRESERVE_RECENT = 6;
const DEFAULT_THRESHOLD_PERCENT = 75;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a session needs compaction and perform it if so.
 *
 * Strategy:
 *  1. Keep all system messages.
 *  2. Keep the first user message.
 *  3. Replace the middle section with a summary marker.
 *  4. Keep the N most recent messages intact.
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
  const preserveRecent = opts.preserveRecent ?? DEFAULT_PRESERVE_RECENT;
  const thresholdPercent = opts.thresholdPercent ?? DEFAULT_THRESHOLD_PERCENT;

  // Resolve context limit dynamically from model registry
  const contextLimit = resolveContextLimit(model);

  const messages = getMessages(sessionId);
  const beforeMessages = messages.length;
  const beforeTokens = computeTokenCount(messages);
  const usagePercent = contextUsagePercent(beforeTokens, contextLimit);

  const needsCompaction = opts.force || usagePercent >= thresholdPercent;

  if (!needsCompaction || beforeMessages <= preserveRecent + 2) {
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

  // Partition messages
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const keptMessages: Array<{ role: Message["role"]; content: string }> = [];

  // Keep system messages
  for (const msg of systemMessages) {
    keptMessages.push({ role: msg.role, content: msg.content });
  }

  // Keep first non-system message
  if (nonSystemMessages.length > 0) {
    const first = nonSystemMessages[0];
    if (first) {
      keptMessages.push({
        role: first.role,
        content: first.content,
      });
    }
  }

  // Insert compaction marker
  const removedCount = nonSystemMessages.length - 1 - preserveRecent;
  if (removedCount > 0) {
    const removedMessages = nonSystemMessages.slice(1, 1 + removedCount);
    const summary = buildSummary(removedMessages);
    keptMessages.push({ role: "system", content: summary });
  }

  // Keep last N non-system messages
  const recentMessages = nonSystemMessages.slice(-preserveRecent);
  for (const msg of recentMessages) {
    keptMessages.push({ role: msg.role, content: msg.content });
  }

  // Clear existing messages and re-insert
  clearMessages(sessionId);

  for (const msg of keptMessages) {
    addMessage(sessionId, msg.role, msg.content);
  }

  const afterTokens = computeTokenCount(
    keptMessages.map((m) => ({ content: m.content }) as Message),
  );
  const afterMessages = keptMessages.length;

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
  const thresholdPercent = opts.thresholdPercent ?? DEFAULT_THRESHOLD_PERCENT;
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

function buildSummary(messages: Message[]): string {
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
  return 24_000; // conservative fallback
}

function extractTopics(messages: Message[]): string[] {
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
