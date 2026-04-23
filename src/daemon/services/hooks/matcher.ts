// Pattern matching for hook entries. Pure functions — no I/O.

import type { HookConfigEntry, HookEventName, HookPayload } from "./types.js";

/**
 * Return the entries relevant for this event + payload. The order of the
 * config file is preserved so earlier entries win when chaining.
 */
export function matchHooks(
  entries: readonly HookConfigEntry[],
  event: HookEventName,
  payload: HookPayload,
): HookConfigEntry[] {
  return entries.filter((entry) => entry.event === event && matchesPayload(entry, payload));
}

function matchesPayload(entry: HookConfigEntry, payload: HookPayload): boolean {
  const matcher = entry.matcher;
  if (!matcher) return true;

  if (matcher.tool) {
    const toolName = "toolName" in payload ? payload.toolName : undefined;
    if (toolName !== matcher.tool) return false;
  }

  if (matcher.argumentsPattern) {
    const args = "arguments" in payload ? payload.arguments : undefined;
    if (!args) return false;
    let regex: RegExp;
    try {
      regex = new RegExp(matcher.argumentsPattern, "u");
    } catch {
      return false;
    }
    if (!regex.test(JSON.stringify(args))) return false;
  }

  return true;
}
