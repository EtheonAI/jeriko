// USD cost conversion — every rate is data, never hardcoded.
//
// Per-token rates come from `ModelCapabilities.costInput` / `.costOutput`
// (sourced from models.dev at boot). Cache-read and cache-write
// multipliers come from `ModelCapabilities.cacheReadRatio` /
// `.cacheWriteRatio`, which are populated from provider-level defaults
// (see `../drivers/provider-defaults.ts`).
//
// There is exactly one price table in the system — the capability
// registry. Adding a new provider's pricing means editing
// `provider-defaults.ts`, not this file.

import { getCapabilities } from "../drivers/models.js";
import type { UsageCost, UsageTotals } from "./types.js";

export interface ComputeCostInput {
  /** Backend id — e.g. "anthropic", "openai", "local". */
  backend: string;
  /** Resolved model id — must match ModelCapabilities.id. */
  model: string;
  /** Accumulated usage totals to price. */
  totals: UsageTotals;
}

/**
 * Compute USD cost for a usage slice. When capability data is unavailable
 * (e.g. a local model with no pricing), all USD fields are zero but the
 * function never throws — callers can still display token counts.
 */
export function computeCost(input: ComputeCostInput): UsageCost {
  const caps = getCapabilities(input.backend, input.model);
  const costInPerMillion = caps.costInput ?? 0;
  const costOutPerMillion = caps.costOutput ?? 0;

  const perToken = (perMillion: number) => perMillion / 1_000_000;
  const inputRate = perToken(costInPerMillion);
  const outputRate = perToken(costOutPerMillion);

  const inputUsd = input.totals.input_tokens * inputRate;
  const outputUsd = input.totals.output_tokens * outputRate;
  const cacheCreationUsd =
    input.totals.cache_creation_input_tokens * inputRate * caps.cacheWriteRatio;
  const cacheReadUsd =
    input.totals.cache_read_input_tokens * inputRate * caps.cacheReadRatio;

  const totalUsd = inputUsd + outputUsd + cacheCreationUsd + cacheReadUsd;

  // What this run would have cost if cache_control was disabled.
  const uncachedInputTokens =
    input.totals.input_tokens +
    input.totals.cache_creation_input_tokens +
    input.totals.cache_read_input_tokens;
  const uncachedReferenceUsd =
    uncachedInputTokens * inputRate + outputUsd;

  return {
    inputUsd,
    outputUsd,
    cacheCreationUsd,
    cacheReadUsd,
    totalUsd,
    uncachedReferenceUsd,
  };
}

/**
 * Cache savings percentage — (uncachedRef − total) / uncachedRef.
 * Zero when uncachedRef is zero, clamped to [0, 1].
 */
export function cacheSavingsRatio(cost: UsageCost): number {
  if (cost.uncachedReferenceUsd <= 0) return 0;
  const savings = (cost.uncachedReferenceUsd - cost.totalUsd) / cost.uncachedReferenceUsd;
  return Math.max(0, Math.min(1, savings));
}
