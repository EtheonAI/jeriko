// Prompt-cache types shared across drivers.
//
// The cache module exists because Anthropic's prompt-caching feature — and
// any future provider that copies the shape — requires deterministic
// byte-identical request prefixes. Rather than scatter `cache_control`
// placement logic through each driver, the agent loop configures a strategy
// and the drivers ask it where breakpoints go.
//
// Strategies are pure functions of (request shape, counters) → markers.
// They never mutate the request themselves; placement is the caller's job.
// This keeps the strategy layer trivially testable and provider-agnostic.

import type {
  AnthropicMessage,
  AnthropicToolDef,
} from "../drivers/anthropic-shared.js";

/**
 * Logical segments of a request where a cache breakpoint may be placed.
 *
 * The order reflects Anthropic's documented cache key order:
 *   tools (input schemas) → system → messages
 * Breakpoints placed later in this list invalidate caches for all earlier
 * segments if those earlier segments ever change bytes.
 */
export type CacheSegment = "tools" | "system" | "messages";

/** A marker that tells the driver to add `cache_control: { type: "ephemeral" }`. */
export interface CacheMarker {
  segment: CacheSegment;
  /**
   * Position of the marker within the segment:
   *   - "end_of_tools": decorate the last tool
   *   - "end_of_system": decorate the last system block
   *   - "end_of_message": decorate the last block of a specific message index
   */
  position:
    | { kind: "end_of_tools" }
    | { kind: "end_of_system" }
    | { kind: "end_of_message"; messageIndex: number };
}

/**
 * Input given to a cache strategy to compute where breakpoints belong.
 *
 * Strategies see the already-converted Anthropic request shape. That
 * decouples them from driver-agnostic DriverMessage types and lets them
 * reason about segment sizes precisely (token estimates, block counts).
 */
export interface StrategyInput {
  readonly system: string | undefined;
  readonly tools: readonly AnthropicToolDef[] | undefined;
  readonly messages: readonly AnthropicMessage[];
  /** Hard cap — providers refuse > 4 breakpoints today. */
  readonly maxBreakpoints: number;
}

/** Output of a cache strategy — zero or more ordered markers (≤ maxBreakpoints). */
export type StrategyOutput = readonly CacheMarker[];

/** Strategy contract. Stateless; pure; testable without the network. */
export interface CacheStrategy {
  readonly name: string;
  compute(input: StrategyInput): StrategyOutput;
}

/** Anthropic's documented hard ceiling on cache breakpoints per request. */
export const ANTHROPIC_MAX_CACHE_BREAKPOINTS = 4;
