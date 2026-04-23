// Anthropic request decorator — applies cache-breakpoint markers computed
// by a CacheStrategy to a converted Anthropic request.
//
// Decorators are deliberately separated from strategies: strategies decide
// where markers go; decorators know how to put them there given the wire
// shape. This lets us add a second provider (e.g. any future vendor that
// copies the cache_control convention) without touching strategy code.

import type {
  AnthropicMessage,
  AnthropicSystemBlock,
  AnthropicToolDef,
} from "../drivers/anthropic-shared.js";
import type { CacheMarker, StrategyOutput } from "./types.js";

export interface DecoratedAnthropicRequest {
  system: string | AnthropicSystemBlock[] | undefined;
  messages: AnthropicMessage[];
  tools: AnthropicToolDef[] | undefined;
}

export interface DecorateInput {
  system: string | undefined;
  messages: readonly AnthropicMessage[];
  tools: readonly AnthropicToolDef[] | undefined;
  markers: StrategyOutput;
}

/**
 * Produce a cache-decorated copy of the request. Inputs are never mutated —
 * the decorator returns fresh arrays/objects so the caller can safely keep
 * the pre-decorated request for logging or diffing.
 */
export function decorateAnthropicRequest(input: DecorateInput): DecoratedAnthropicRequest {
  return {
    system: decorateSystem(input.system, input.markers),
    tools: decorateTools(input.tools, input.markers),
    messages: decorateMessages(input.messages, input.markers),
  };
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

function decorateSystem(
  system: string | undefined,
  markers: StrategyOutput,
): string | AnthropicSystemBlock[] | undefined {
  if (system === undefined) return undefined;

  const shouldCache = markers.some((m) => m.position.kind === "end_of_system");
  if (!shouldCache) return system;

  // Anthropic only honours cache_control on *block* form, not on raw string.
  return [
    {
      type: "text",
      text: system,
      cache_control: { type: "ephemeral" },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

function decorateTools(
  tools: readonly AnthropicToolDef[] | undefined,
  markers: StrategyOutput,
): AnthropicToolDef[] | undefined {
  if (!tools || tools.length === 0) return tools ? [...tools] : undefined;

  const shouldCache = markers.some((m) => m.position.kind === "end_of_tools");
  const copy = tools.map((t) => ({ ...t, input_schema: { ...t.input_schema } }));

  if (shouldCache) {
    const last = copy[copy.length - 1]!;
    copy[copy.length - 1] = { ...last, cache_control: { type: "ephemeral" } };
  }

  return copy;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function decorateMessages(
  messages: readonly AnthropicMessage[],
  markers: StrategyOutput,
): AnthropicMessage[] {
  const messageMarkers = markers.filter(
    (m): m is CacheMarker & { position: { kind: "end_of_message"; messageIndex: number } } =>
      m.position.kind === "end_of_message",
  );

  const copy = messages.map(cloneMessage);
  for (const marker of messageMarkers) {
    const index = marker.position.messageIndex;
    if (index < 0 || index >= copy.length) continue;
    decorateLastBlockOf(copy[index]!);
  }

  return copy;
}

function cloneMessage(message: AnthropicMessage): AnthropicMessage {
  if (typeof message.content === "string") {
    return { role: message.role, content: message.content };
  }
  return {
    role: message.role,
    content: message.content.map((b) => ({ ...b })),
  };
}

function decorateLastBlockOf(message: AnthropicMessage): void {
  if (typeof message.content === "string") {
    // Promote to block form so we can carry cache_control.
    message.content = [
      { type: "text", text: message.content, cache_control: { type: "ephemeral" } },
    ];
    return;
  }

  if (message.content.length === 0) return;
  const last = message.content[message.content.length - 1]!;
  last.cache_control = { type: "ephemeral" };
}
