// Prompt-cache module — public API.
//
// Drivers compose these three calls:
//   1. `pickStrategy()` — select or default a strategy instance.
//   2. `strategy.compute(input)` — decide where breakpoints go.
//   3. `decorateAnthropicRequest()` — apply markers to the wire shape.
//
// Consumers never hand-write `cache_control` on blocks. If you need a
// per-provider tweak, write a new Decorator that lives alongside
// `anthropic-decorator.ts`.

export { defaultCacheStrategy } from "./strategy.js";
export { decorateAnthropicRequest } from "./anthropic-decorator.js";
export type {
  CacheSegment,
  CacheMarker,
  CacheStrategy,
  StrategyInput,
  StrategyOutput,
} from "./types.js";
export { ANTHROPIC_MAX_CACHE_BREAKPOINTS } from "./types.js";

import { defaultCacheStrategy } from "./strategy.js";
import type { CacheStrategy } from "./types.js";

/**
 * Resolve a cache strategy. Callers may pass an explicit strategy; when
 * absent the default is used. Extracted to a function so future config-driven
 * selection (e.g. `JerikoConfig.agent.cacheStrategy: "aggressive"`) has a
 * single integration point.
 */
export function pickStrategy(explicit?: CacheStrategy): CacheStrategy {
  return explicit ?? defaultCacheStrategy;
}
