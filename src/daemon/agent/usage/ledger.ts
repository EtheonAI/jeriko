// UsageLedger — the single class agents use to accumulate usage, compute
// USD cost, and enforce budget caps.
//
// Design notes:
//   • Drivers emit *cumulative* usage on each streamed `message_start` /
//     `message_delta` event (Anthropic convention). The ledger normalizes
//     those into *deltas* so cross-provider math is consistent.
//   • Budget enforcement is check-after-record: the ledger records the
//     usage, computes cost, and throws if the cap is exceeded. This
//     guarantees every partial result is costed and visible even on abort.

import type { UsageInfo } from "../drivers/index.js";
import { getCapabilities } from "../drivers/models.js";
import { computeCost } from "./cost.js";
import {
  BudgetExceededError,
  ZERO_USAGE,
  type UsageCost,
  type UsageObserver,
  type UsageTotals,
} from "./types.js";

export interface LedgerOptions {
  /** Backend id — used by the cost table for per-response pricing. */
  backend: string;
  /** Resolved model id. */
  model: string;
  /** Optional USD cap. Undefined / ≤ 0 disables the gate. */
  maxBudgetUsd?: number;
  /** Optional live observer — fires on every non-empty delta. */
  observer?: UsageObserver;
}

export class UsageLedger {
  private readonly opts: LedgerOptions;

  /** Rolling cumulative counters fed by drivers (per-response). */
  private perResponse: UsageInfo = {};

  /** Ledger-wide totals — survive across responses within one run. */
  readonly totals: UsageTotals = { ...ZERO_USAGE };

  constructor(opts: LedgerOptions) {
    this.opts = opts;
  }

  /**
   * Indicate that a fresh streamed response is starting. The ledger resets
   * its cumulative baseline so the next `record()` call computes deltas
   * against zero rather than the prior response's ending usage.
   */
  startResponse(): void {
    this.perResponse = {};
    this.totals.responses += 1;
  }

  /**
   * Record the provider's latest *cumulative* usage for the current response.
   *
   * The delta from the previous cumulative snapshot is added to the ledger
   * totals and forwarded to the observer. Budget enforcement runs on the
   * resulting totals.
   */
  record(cumulative: UsageInfo): void {
    const delta = subtract(cumulative, this.perResponse);
    if (isZero(delta)) return;

    this.perResponse = { ...cumulative };

    this.totals.input_tokens += delta.input_tokens ?? 0;
    this.totals.output_tokens += delta.output_tokens ?? 0;
    this.totals.cache_creation_input_tokens += delta.cache_creation_input_tokens ?? 0;
    this.totals.cache_read_input_tokens += delta.cache_read_input_tokens ?? 0;

    this.opts.observer?.(delta, this.totals);

    this.enforceBudget();
  }

  /** Compute cost using the current totals. */
  cost(): UsageCost {
    return computeCost({
      backend: this.opts.backend,
      model: this.opts.model,
      totals: this.totals,
    });
  }

  /** Current spend in USD (convenience). */
  totalUsd(): number {
    return this.cost().totalUsd;
  }

  /** Expose resolved model caps for the statusline / /cost command. */
  describeModel(): { provider: string; id: string } {
    const caps = getCapabilities(this.opts.backend, this.opts.model);
    return { provider: caps.provider, id: caps.id };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private enforceBudget(): void {
    const cap = this.opts.maxBudgetUsd ?? 0;
    if (cap <= 0) return;

    const spend = this.totalUsd();
    if (spend > cap) {
      throw new BudgetExceededError(spend, cap);
    }
  }
}

function subtract(a: UsageInfo, b: UsageInfo): UsageInfo {
  return {
    input_tokens: nz(a.input_tokens) - nz(b.input_tokens),
    output_tokens: nz(a.output_tokens) - nz(b.output_tokens),
    cache_creation_input_tokens:
      nz(a.cache_creation_input_tokens) - nz(b.cache_creation_input_tokens),
    cache_read_input_tokens:
      nz(a.cache_read_input_tokens) - nz(b.cache_read_input_tokens),
  };
}

function nz(n: number | undefined): number {
  return typeof n === "number" && n > 0 ? n : 0;
}

function isZero(u: UsageInfo): boolean {
  return (
    !u.input_tokens &&
    !u.output_tokens &&
    !u.cache_creation_input_tokens &&
    !u.cache_read_input_tokens
  );
}
