// Compaction defaults — single source of truth.
//
// These are deliberately conservative so behaviour is predictable across
// every driver. Users can override via `JerikoConfig.agent.compaction`.

import {
  COMPACTION_CONTEXT_RATIO,
  COMPACT_TARGET_RATIO,
  MIN_MESSAGES_FOR_COMPACTION,
} from "../../../shared/tokens.js";
import type { CompactionPolicy } from "./types.js";

/** Default summarizer output cap — keeps summary below 2 KB of text. */
export const DEFAULT_SUMMARY_MAX_TOKENS = 512;

/**
 * Default policy. Callers should read user config and merge with these,
 * not patch the object itself — it's frozen to catch accidental mutation.
 */
export const DEFAULT_COMPACTION_POLICY: Readonly<CompactionPolicy> = Object.freeze({
  autoCompactRatio: COMPACTION_CONTEXT_RATIO,
  targetRatio: COMPACT_TARGET_RATIO,
  summarize: true,
  summaryMaxTokens: DEFAULT_SUMMARY_MAX_TOKENS,
  minMessages: MIN_MESSAGES_FOR_COMPACTION,
});

/**
 * Merge user-supplied compaction settings with the default policy.
 * Undefined user fields fall through to defaults.
 */
export function mergePolicy(overrides?: Partial<CompactionPolicy>): CompactionPolicy {
  return {
    autoCompactRatio: overrides?.autoCompactRatio ?? DEFAULT_COMPACTION_POLICY.autoCompactRatio,
    targetRatio: overrides?.targetRatio ?? DEFAULT_COMPACTION_POLICY.targetRatio,
    summarize: overrides?.summarize ?? DEFAULT_COMPACTION_POLICY.summarize,
    summaryMaxTokens: overrides?.summaryMaxTokens ?? DEFAULT_COMPACTION_POLICY.summaryMaxTokens,
    minMessages: overrides?.minMessages ?? DEFAULT_COMPACTION_POLICY.minMessages,
  };
}
