// Hook config loader — reads `~/.config/jeriko/hooks.json` (or the path in
// `$JERIKO_HOOKS_CONFIG`), validates with zod, and returns a strongly-typed
// list of entries. Broken configs degrade to "no hooks" rather than
// preventing daemon boot.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { getLogger } from "../../../shared/logger.js";
import type { HookConfigEntry } from "./types.js";

const log = getLogger();

const EVENTS = [
  "pre_tool_use",
  "post_tool_use",
  "session_start",
  "session_end",
  "pre_compact",
  "post_compact",
] as const;

const MatcherSchema = z.object({
  tool: z.string().min(1).optional(),
  argumentsPattern: z.string().min(1).optional(),
});

const EntrySchema = z.object({
  event: z.enum(EVENTS),
  command: z.string().min(1),
  matcher: MatcherSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const FileSchema = z.object({
  hooks: z.array(EntrySchema).optional(),
});

export function defaultHooksConfigPath(): string {
  return process.env.JERIKO_HOOKS_CONFIG ?? join(homedir(), ".config", "jeriko", "hooks.json");
}

export function loadHookConfig(path: string = defaultHooksConfigPath()): HookConfigEntry[] {
  if (!existsSync(path)) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    log.warn(`Hooks config parse failed (${path}): ${err}. No hooks will run.`);
    return [];
  }

  const parsed = FileSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn(`Hooks config validation failed (${path}): ${parsed.error.message}. No hooks will run.`);
    return [];
  }

  return parsed.data.hooks ?? [];
}
