// Default cache-breakpoint placement strategy for Anthropic-compatible
// providers.
//
// Rationale:
//   • Tool schemas rarely change mid-session and are expensive to re-tokenize
//     → cache the *end of tools*.
//   • System prompts (AGENT.md + skills + memory + CLAUDE.md) are stable for
//     the life of a session → cache the *end of system*.
//   • The turn boundary before the latest user message is a natural
//     "conversation so far" boundary — caching it means every subsequent
//     tool-call round reuses the entire preceding trace.
//
// Anthropic caps at 4 breakpoints per request; this strategy places at most
// three (tools / system / last-assistant-or-tool-boundary) to leave one slot
// for callers to add ad-hoc markers. We always respect `maxBreakpoints`.

import {
  ANTHROPIC_MAX_CACHE_BREAKPOINTS,
  type CacheStrategy,
  type StrategyInput,
  type StrategyOutput,
} from "./types.js";

/** Minimum text length that justifies caching a system prompt. */
const MIN_SYSTEM_CHARS_TO_CACHE = 512;

/** Minimum combined tool-schema chars before caching the tool segment is worthwhile. */
const MIN_TOOLS_CHARS_TO_CACHE = 512;

/**
 * Name-addressable default strategy.
 *
 * The implementation avoids conditionals that couple behaviour to specific
 * runtime state (model name, session id, etc.). Anything situational belongs
 * in a bespoke strategy that composes over this one.
 */
export const defaultCacheStrategy: CacheStrategy = {
  name: "default",

  compute(input: StrategyInput): StrategyOutput {
    const maxBreakpoints = Math.max(
      0,
      Math.min(input.maxBreakpoints, ANTHROPIC_MAX_CACHE_BREAKPOINTS),
    );
    if (maxBreakpoints === 0) return [];

    const markers: StrategyOutput = [];
    const out: Array<StrategyOutput[number]> = [];

    if (shouldCacheTools(input.tools)) {
      out.push({ segment: "tools", position: { kind: "end_of_tools" } });
    }

    if (shouldCacheSystem(input.system)) {
      out.push({ segment: "system", position: { kind: "end_of_system" } });
    }

    const messageBreakpoint = lastStableMessageBoundary(input.messages);
    if (messageBreakpoint !== -1) {
      out.push({
        segment: "messages",
        position: { kind: "end_of_message", messageIndex: messageBreakpoint },
      });
    }

    // Respect the caller-provided cap, preferring later segments
    // (messages > system > tools). Later caches invalidate earlier ones if
    // the prefix shifts, but when we must drop, keeping the deeper marker
    // maximizes hit surface for the largest segment.
    if (out.length <= maxBreakpoints) return [...markers, ...out];
    return [...markers, ...out.slice(-maxBreakpoints)];
  },
};

function shouldCacheTools(tools: StrategyInput["tools"]): boolean {
  if (!tools || tools.length === 0) return false;
  const combined = tools
    .map((t) => t.name.length + t.description.length + JSON.stringify(t.input_schema).length)
    .reduce((a, b) => a + b, 0);
  return combined >= MIN_TOOLS_CHARS_TO_CACHE;
}

function shouldCacheSystem(system: StrategyInput["system"]): boolean {
  if (!system) return false;
  return system.length >= MIN_SYSTEM_CHARS_TO_CACHE;
}

/**
 * Return the index of the last message that is a stable turn boundary —
 * i.e. an assistant turn (possibly with tool_calls) whose tool_results have
 * all been delivered. This is the natural place to pin the "conversation
 * so far" cache entry so subsequent turns reuse the prefix.
 *
 * Returns `-1` when no such boundary exists (e.g. conversation contains only
 * a single in-flight user turn).
 */
function lastStableMessageBoundary(
  messages: StrategyInput["messages"],
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant") {
      // Walk forward to check any tool_use blocks have matching tool_result
      // messages after them. If the assistant's final block is a tool_use
      // without a result yet, this isn't a stable boundary.
      const blocks = Array.isArray(m.content) ? m.content : [];
      const lastToolUse = [...blocks].reverse().find((b) => b.type === "tool_use");
      if (!lastToolUse) return i;

      // There's a pending tool_use; stable boundary is the previous assistant.
      continue;
    }
  }
  return -1;
}
