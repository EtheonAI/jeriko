// Hooks subsystem — public API.
//
// Callers do `runHooks({ event, payload })` and act on the returned
// decision. The config is loaded once at boot into a module-level cache;
// `reloadHooks()` swaps the cache (used by config change detection).

import { loadHookConfig, defaultHooksConfigPath } from "./config.js";
import { runHooks as runHooksInternal, type RunHooksResult } from "./runner.js";
import type { HookConfigEntry, HookEventName, HookPayload } from "./types.js";

export type {
  HookEventName,
  HookPayload,
  HookDecision,
  HookConfigEntry,
} from "./types.js";
export type { RunHooksResult } from "./runner.js";

let cachedEntries: HookConfigEntry[] = [];
let loaded = false;

/** Load (or reload) the on-disk config. Safe to call from the kernel boot. */
export function reloadHooks(path?: string): number {
  cachedEntries = loadHookConfig(path ?? defaultHooksConfigPath());
  loaded = true;
  return cachedEntries.length;
}

/** Replace the active hook set directly — primarily for tests. */
export function setHooksForTesting(entries: HookConfigEntry[]): void {
  cachedEntries = [...entries];
  loaded = true;
}

export function listHooks(): readonly HookConfigEntry[] {
  return cachedEntries;
}

export async function runHooks(input: {
  event: HookEventName;
  payload: HookPayload;
}): Promise<RunHooksResult> {
  if (!loaded) reloadHooks();
  return runHooksInternal({
    entries: cachedEntries,
    event: input.event,
    payload: input.payload,
  });
}
