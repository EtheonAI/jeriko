/**
 * Cost estimation — Model-aware token cost calculator.
 *
 * Rates are in dollars per million tokens. Looks up the model by name
 * or prefix, falling back to a default rate when unknown.
 *
 * This module is pure — no side effects, no external API calls.
 * Rates are updated as new models are added to the codebase.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-million-token pricing for a model family. */
export interface ModelRates {
  inputPerMillion: number;
  outputPerMillion: number;
}

// ---------------------------------------------------------------------------
// Rate table — dollars per million tokens
// ---------------------------------------------------------------------------

/**
 * Known model pricing. Keys are canonical model prefixes.
 * When a model name starts with any key, its rates apply.
 *
 * Order matters: longer prefixes should appear first for correct matching
 * (e.g., "claude-3.5-sonnet" before "claude-3").
 */
const RATE_TABLE: ReadonlyArray<[prefix: string, rates: ModelRates]> = [
  // Claude 4
  ["claude-opus-4",        { inputPerMillion: 15,  outputPerMillion: 75  }],
  ["claude-sonnet-4",      { inputPerMillion: 3,   outputPerMillion: 15  }],
  // Claude 3.5
  ["claude-3.5-sonnet",    { inputPerMillion: 3,   outputPerMillion: 15  }],
  ["claude-3.5-haiku",     { inputPerMillion: 0.8, outputPerMillion: 4   }],
  // Claude 3
  ["claude-3-opus",        { inputPerMillion: 15,  outputPerMillion: 75  }],
  ["claude-3-sonnet",      { inputPerMillion: 3,   outputPerMillion: 15  }],
  ["claude-3-haiku",       { inputPerMillion: 0.25,outputPerMillion: 1.25}],
  // Claude generic (catches "claude", "claude-code", etc.)
  ["claude",               { inputPerMillion: 3,   outputPerMillion: 15  }],
  // GPT-4o
  ["gpt-4o-mini",          { inputPerMillion: 0.15,outputPerMillion: 0.6 }],
  ["gpt-4o",               { inputPerMillion: 2.5, outputPerMillion: 10  }],
  ["gpt-4-turbo",          { inputPerMillion: 10,  outputPerMillion: 30  }],
  ["gpt-4",                { inputPerMillion: 30,  outputPerMillion: 60  }],
  // GPT-3.5
  ["gpt-3.5",              { inputPerMillion: 0.5, outputPerMillion: 1.5 }],
  // O-series (reasoning)
  ["o3-mini",              { inputPerMillion: 1.1, outputPerMillion: 4.4 }],
  ["o3",                   { inputPerMillion: 10,  outputPerMillion: 40  }],
  ["o1-mini",              { inputPerMillion: 3,   outputPerMillion: 12  }],
  ["o1",                   { inputPerMillion: 15,  outputPerMillion: 60  }],
  // DeepSeek
  ["deepseek",             { inputPerMillion: 0.27,outputPerMillion: 1.1 }],
  // Local / free (Ollama, etc.)
  ["ollama",               { inputPerMillion: 0,   outputPerMillion: 0   }],
  ["local",                { inputPerMillion: 0,   outputPerMillion: 0   }],
];

/** Fallback rates when no model prefix matches. */
const DEFAULT_RATES: ModelRates = { inputPerMillion: 3, outputPerMillion: 15 };

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Look up pricing rates for a model name.
 * Matches by prefix — first match wins.
 */
export function getModelRates(model: string): ModelRates {
  const normalized = model.toLowerCase();
  for (const [prefix, rates] of RATE_TABLE) {
    if (normalized.startsWith(prefix)) return rates;
  }
  return DEFAULT_RATES;
}

/**
 * Estimate the cost of a conversation turn given token counts and model.
 * Returns the cost in dollars.
 */
export function estimateModelCost(
  tokensIn: number,
  tokensOut: number,
  model: string,
): number {
  const rates = getModelRates(model);
  return (tokensIn * rates.inputPerMillion + tokensOut * rates.outputPerMillion) / 1_000_000;
}

/**
 * Format a dollar cost for display.
 * Shows 2 decimal places, or 4 for very small costs.
 *
 * @example formatModelCost(0.12) → "$0.12"
 * @example formatModelCost(0.0023) → "$0.0023"
 * @example formatModelCost(0) → "$0.00"
 */
export function formatModelCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}
