// Usage accounting — types.
//
// One `UsageLedger` instance tracks the rolling token + USD totals for a
// single agent-loop run. Drivers feed it one `UsageInfo` per stream event;
// it converts to USD using the capability-backed price table.

import type { UsageInfo } from "../drivers/index.js";

/** Running totals for a single run / session / budget window. */
export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  /** Number of individual provider responses the ledger has consumed. */
  responses: number;
}

export const ZERO_USAGE: UsageTotals = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  responses: 0,
};

/** Dollar price breakdown for a given UsageTotals slice. */
export interface UsageCost {
  /** USD paid for uncached input tokens. */
  inputUsd: number;
  /** USD paid for output tokens. */
  outputUsd: number;
  /** USD paid for *writing* to the prompt cache (Anthropic: input × 1.25). */
  cacheCreationUsd: number;
  /** USD paid for *reading* from the prompt cache (Anthropic: input × 0.10). */
  cacheReadUsd: number;
  /** Sum of all four. */
  totalUsd: number;
  /** Hypothetical cost with caching off — useful for savings reporting. */
  uncachedReferenceUsd: number;
}

/** Reason a run was aborted by the budget gate. */
export type BudgetAbortReason = "budget_exceeded";

/** Error thrown when a budget gate fires. */
export class BudgetExceededError extends Error {
  readonly reason: BudgetAbortReason = "budget_exceeded";
  constructor(
    readonly spentUsd: number,
    readonly capUsd: number,
  ) {
    super(
      `Budget exceeded: spent $${spentUsd.toFixed(4)} of $${capUsd.toFixed(4)} cap`,
    );
    this.name = "BudgetExceededError";
  }
}

/** Incremental observer — called with the *delta* since the last observation. */
export interface UsageObserver {
  (delta: UsageInfo, totals: UsageTotals): void;
}
