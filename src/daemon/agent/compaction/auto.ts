// Auto-compaction — triggered during the agent loop when the live message
// buffer approaches the model's context window.
//
// Strategy:
//   1. Truncate the oldest turns using the existing turn-based selector.
//   2. If the user wants summaries AND we have an LLM driver reachable, run
//      the summarizer on the dropped turns and splice a single "compacted"
//      user message back in at the head of the retained conversation.
//   3. Return a CompactionResult either way — callers always get a
//      deterministic shape to log / emit events about.

import type { DriverMessage } from "../drivers/index.js";
import { messageText } from "../drivers/index.js";
import { estimateTokens } from "../../../shared/tokens.js";
import { groupIntoTurns, estimateTurnTokens, type Turn } from "../history.js";
import { summarizeTurns, type SummarizeResult } from "./summarize.js";
import { getLogger } from "../../../shared/logger.js";
import type { CompactionPolicy, CompactionResult } from "./types.js";
import { NO_OP_RESULT } from "./types.js";

const log = getLogger();

/**
 * Up to how many times we'll retry the summarizer on a transient stream
 * error before falling back to truncation. A single retry is enough to
 * ride out the common "driver dropped a chunk" class of failures without
 * stretching the compaction budget.
 */
const SUMMARIZER_STREAM_RETRIES = 1;

export interface AutoCompactInput {
  messages: DriverMessage[];
  contextLimit: number;
  policy: CompactionPolicy;
  backend: string;
  model: string;
  signal?: AbortSignal;
}

/**
 * Returns true when the current buffer exceeds the auto-compaction threshold.
 * The agent loop invokes this *before* each round so compaction happens
 * proactively, never as a recovery move (that's `reactive.ts`'s job).
 */
export function shouldAutoCompact(
  messages: DriverMessage[],
  contextLimit: number,
  policy: CompactionPolicy,
): boolean {
  if (messages.filter((m) => m.role !== "system").length < policy.minMessages) return false;
  const tokens = estimateTotalTokens(messages);
  return tokens >= Math.floor(contextLimit * policy.autoCompactRatio);
}

/**
 * Run one compaction pass. Caller replaces their buffer with `result.messages`.
 */
export async function autoCompact(input: AutoCompactInput): Promise<CompactionResult> {
  const { messages, contextLimit, policy } = input;

  const beforeTokens = estimateTotalTokens(messages);
  const { truncated, droppedTurns } = truncateByPolicy(messages, contextLimit, policy);

  if (droppedTurns.length === 0) {
    return NO_OP_RESULT(messages, beforeTokens);
  }

  const truncatedTokens = estimateTotalTokens(truncated);

  // Step 2: optional summarization. The summarizer returns a typed
  // {@link SummarizeResult} so we can retry transient stream errors once,
  // and fall through to truncation when the model has nothing to say.
  if (policy.summarize && droppedTurns.length > 0) {
    const outcome = await runSummarizerWithRetry({
      droppedTurns,
      backend: input.backend,
      model: input.model,
      maxTokens: policy.summaryMaxTokens,
      signal: input.signal,
    });

    if (outcome.status === "ok") {
      const withSummary = insertSummary(truncated, outcome.summary);
      return {
        messages: withSummary,
        beforeTokens,
        afterTokens: estimateTotalTokens(withSummary),
        turnsRemoved: droppedTurns.length,
        strategy: "summarize",
        summary: outcome.summary,
      };
    }

    // Non-ok path — log why we're dropping to plain truncation so a
    // misconfigured summarizer (wrong model, bad key) shows up in the
    // daemon log instead of being invisible.
    if (outcome.status === "error") {
      log.warn(
        `Compaction: summarizer ${outcome.kind} error — falling back to truncate. ${outcome.message}`,
      );
    } else {
      log.debug(`Compaction: summarizer empty (${outcome.reason}) — using truncate`);
    }
  }

  return {
    messages: truncated,
    beforeTokens,
    afterTokens: truncatedTokens,
    turnsRemoved: droppedTurns.length,
    strategy: "truncate",
  };
}

/**
 * Invoke the summarizer with a small retry budget for transient stream
 * errors. Exceptions and empty outputs are returned directly — only
 * `status: "error"` with `kind: "stream"` is retried.
 */
async function runSummarizerWithRetry(
  input: Parameters<typeof summarizeTurns>[0],
): Promise<SummarizeResult> {
  let attempt = 0;
  let last: SummarizeResult = await summarizeTurns(input);
  while (
    last.status === "error" &&
    last.kind === "stream" &&
    attempt < SUMMARIZER_STREAM_RETRIES
  ) {
    attempt++;
    log.debug(`Compaction: summarizer retry ${attempt} after stream error`);
    last = await summarizeTurns(input);
  }
  return last;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateTotalTokens(messages: DriverMessage[]): number {
  return estimateTokens(messages.map((m) => messageText(m)).join(""));
}

/**
 * Policy-driven turn selector.
 *
 * Unlike the base `history.compactHistory()` (which hardcodes
 * `COMPACT_TARGET_RATIO`), this selector honours the caller's `targetRatio`
 * so the reactive path can squeeze more aggressively than the auto path.
 */
function truncateByPolicy(
  messages: DriverMessage[],
  contextLimit: number,
  policy: CompactionPolicy,
): { truncated: DriverMessage[]; droppedTurns: DriverMessage[][] } {
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  if (nonSystem.length < policy.minMessages) {
    return { truncated: messages, droppedTurns: [] };
  }

  const turns = groupIntoTurns(nonSystem);
  const systemTokens = estimateTotalTokens(systemMsgs);
  const targetTotal = Math.floor(contextLimit * policy.targetRatio);
  const turnBudget = Math.max(0, targetTotal - systemTokens);

  const keptReversed: Turn[] = [];
  let accTokens = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]!;
    const cost = estimateTurnTokens(turn);
    if (accTokens + cost > turnBudget) break;
    keptReversed.unshift(turn);
    accTokens += cost;
  }

  const dropped = turns.slice(0, turns.length - keptReversed.length);
  if (dropped.length === 0) {
    return { truncated: messages, droppedTurns: [] };
  }

  const truncated: DriverMessage[] = [...systemMsgs];
  if (dropped.length > 0) {
    truncated.push({
      role: "system",
      content: `[Earlier conversation history was compacted (${dropped.length} turn(s) removed) to stay within context limits.]`,
    });
  }
  for (const turn of keptReversed) truncated.push(...turn);

  return { truncated, droppedTurns: dropped };
}

/**
 * Prepend a synthetic system message containing the summary so the model
 * sees it before the retained turns. We use a distinct marker so the agent
 * can recognise compacted context and treat it as authoritative background.
 */
function insertSummary(messages: DriverMessage[], summary: string): DriverMessage[] {
  const systemMsgs = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const summaryMsg: DriverMessage = {
    role: "system",
    content: `[COMPACTED CONVERSATION SUMMARY — earlier turns were summarized to free context:]\n${summary}`,
  };
  return [...systemMsgs, summaryMsg, ...rest];
}
