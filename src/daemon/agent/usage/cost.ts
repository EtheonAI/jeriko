// USD cost conversion — driven entirely by `ModelCapabilities.costInput` /
// `.costOutput` pulled from the dynamic model registry. We do NOT hardcode
// a second price table here — there's one source of truth, and it comes
// from models.dev via `drivers/models.ts`.
//
// Anthropic-specific cache multipliers are constants of the Anthropic wire
// protocol (as documented), not per-model data, so they live here.

import { getCapabilities } from "../drivers/models.js";
import type { UsageCost, UsageTotals } from "./types.js";

/**
 * Anthropic prompt-cache multipliers applied to the *input* rate:
 *   • Writing to cache: 1.25×
 *   • Reading from cache: 0.10×
 *
 * Other providers exposing cache_control will need a per-provider table
 * when that happens — keep this local and swap the branch at that time.
 */
const ANTHROPIC_CACHE_WRITE_MULTIPLIER = 1.25;
const ANTHROPIC_CACHE_READ_MULTIPLIER = 0.10;

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
    input.totals.cache_creation_input_tokens * inputRate * ANTHROPIC_CACHE_WRITE_MULTIPLIER;
  const cacheReadUsd =
    input.totals.cache_read_input_tokens * inputRate * ANTHROPIC_CACHE_READ_MULTIPLIER;

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
