// One-call helper that takes driver-agnostic inputs and returns a cache-aware
// Anthropic request body. Drivers call this instead of manually composing
// strategy + decorator + request-body.

import type { DriverConfig, DriverMessage } from "../drivers/index.js";
import {
  buildAnthropicRequestBody,
  convertToAnthropicMessages,
  convertToAnthropicTools,
} from "../drivers/anthropic-shared.js";
import { pickStrategy } from "./index.js";
import { decorateAnthropicRequest } from "./anthropic-decorator.js";
import {
  ANTHROPIC_MAX_CACHE_BREAKPOINTS,
  type CacheStrategy,
  type StrategyOutput,
} from "./types.js";

export interface BuildCachedRequestInput {
  messages: DriverMessage[];
  config: DriverConfig;
  /** Optional strategy override. Falls back to `defaultCacheStrategy`. */
  strategy?: CacheStrategy;
  /** Maximum breakpoints to place. Default: Anthropic's hard cap of 4. */
  maxBreakpoints?: number;
}

export interface BuildCachedRequestOutput {
  body: Record<string, unknown>;
  /** The markers that were applied — exposed for telemetry / logging. */
  markers: StrategyOutput;
}

/**
 * Build an Anthropic Messages API body with cache breakpoints already in place.
 *
 * Idempotent: call per-request with the same inputs and the marker set
 * is deterministic. The caller owns headers and the HTTP call itself.
 */
export function buildCachedAnthropicRequest(
  input: BuildCachedRequestInput,
): BuildCachedRequestOutput {
  const strategy = pickStrategy(input.strategy);
  const maxBreakpoints = Math.max(
    0,
    Math.min(input.maxBreakpoints ?? ANTHROPIC_MAX_CACHE_BREAKPOINTS, ANTHROPIC_MAX_CACHE_BREAKPOINTS),
  );

  const { system: systemFromMessages, messages: converted } =
    convertToAnthropicMessages(input.messages);
  // Either a role:"system" message OR the driver-level `system_prompt` may
  // carry the system text; the cache path must decorate whichever is present.
  const effectiveSystem = systemFromMessages ?? input.config.system_prompt;
  const tools = convertToAnthropicTools(input.config);

  const markers = strategy.compute({
    system: effectiveSystem,
    tools,
    messages: converted,
    maxBreakpoints,
  });

  const decorated = decorateAnthropicRequest({
    system: effectiveSystem,
    tools,
    messages: converted,
    markers,
  });

  const body = buildAnthropicRequestBody(input.config, {
    system: decorated.system,
    messages: decorated.messages,
    tools: decorated.tools,
  });

  return { body, markers };
}
