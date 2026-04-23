// Provider-level defaults that aren't part of models.dev's per-model data
// but are genuine properties of the provider's wire protocol.
//
// The two we care about:
//
//   • `cacheReadRatio` / `cacheWriteRatio` — multipliers applied to the
//     input rate when the provider reports cache_read_input_tokens /
//     cache_creation_input_tokens. Per each provider's published
//     pricing documentation.
//
//   • `usageShape` — how the provider's streaming usage object reports
//     cached tokens. `anthropic` reports them as separate fields.
//     `openai-inclusive` counts them inside prompt_tokens (subtract to
//     split). `openai-exclusive` excludes them from prompt_tokens already
//     (future OpenAI v2). `none` means no cache telemetry.
//
// Everything here is a stable wire-protocol concern, not per-model data,
// so it lives next to the driver registry rather than scattering ratio
// constants through cost and stream modules.

/** Discriminant describing how a provider reports cache usage. */
export type CacheUsageShape =
  | "anthropic"
  | "openai-inclusive"
  | "openai-exclusive"
  | "none";

export interface ProviderDefaults {
  /** Cache-read cost multiplier applied to input rate. */
  readonly cacheReadRatio: number;
  /** Cache-write cost multiplier applied to input rate. */
  readonly cacheWriteRatio: number;
  /** Wire-protocol shape for cached-token telemetry. */
  readonly usageShape: CacheUsageShape;
}

/** Fallback when a provider isn't enumerated below. */
export const UNKNOWN_PROVIDER_DEFAULTS: ProviderDefaults = {
  cacheReadRatio: 1,
  cacheWriteRatio: 1,
  usageShape: "none",
};

/**
 * Per-provider defaults keyed on the canonical provider id used by the
 * driver registry. OpenAI-compat providers (DeepSeek, Together, Groq …)
 * fall through to the `openai-compat` bucket unless overridden.
 *
 * Values are drawn directly from each provider's pricing page:
 *   • Anthropic:
 *       https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 *       — cache reads billed at 0.10× input; cache writes at 1.25× input.
 *   • OpenAI:
 *       https://platform.openai.com/docs/guides/prompt-caching
 *       — cached input tokens billed at 0.50× input; no separate write
 *         rate (caching is automatic, no opt-in cost).
 *   • Google / xAI / local: no prompt-cache discount documented at the
 *     provider level at time of writing; fall back to 1× (no multiplier).
 *
 * When a new provider ships prompt caching, add its entry here rather
 * than introducing a branch in cost.ts or a stream parser.
 */
export const PROVIDER_DEFAULTS: Readonly<Record<string, ProviderDefaults>> = {
  anthropic: {
    cacheReadRatio: 0.10,
    cacheWriteRatio: 1.25,
    usageShape: "anthropic",
  },
  openai: {
    cacheReadRatio: 0.50,
    cacheWriteRatio: 1,
    usageShape: "openai-inclusive",
  },
  // OpenAI-compatible providers use the same wire shape as OpenAI but
  // most do not (yet) ship cache telemetry at all — a 1× ratio keeps
  // cost math correct in the common case where cache_read is reported
  // as zero.
  "openai-compat": {
    cacheReadRatio: 1,
    cacheWriteRatio: 1,
    usageShape: "openai-inclusive",
  },
  "claude-code": {
    cacheReadRatio: 0.10,
    cacheWriteRatio: 1.25,
    usageShape: "anthropic",
  },
  local: {
    cacheReadRatio: 0,
    cacheWriteRatio: 0,
    usageShape: "none",
  },
};

/**
 * Resolve provider defaults. Unknown providers fall through to the
 * safe 1× no-cache shape so cost computation never returns NaN and
 * stream parsers never double-count.
 */
export function getProviderDefaults(provider: string): ProviderDefaults {
  return PROVIDER_DEFAULTS[provider] ?? UNKNOWN_PROVIDER_DEFAULTS;
}
