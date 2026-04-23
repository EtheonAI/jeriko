// Hook runner — shells out to the configured command with the payload on
// stdin and parses a JSON decision from stdout.
//
// The runner enforces:
//   • A timeout so a stuck hook cannot block the agent loop indefinitely.
//   • Per-entry env isolation — only explicitly-configured env leaks through.
//   • Sensible defaults — a missing or malformed response is treated as
//     `allow`, so broken hooks never silently block user work.

import { spawn } from "node:child_process";
import { z } from "zod";
import { getLogger } from "../../../shared/logger.js";
import { matchHooks } from "./matcher.js";
import type {
  HookConfigEntry,
  HookDecision,
  HookEventName,
  HookPayload,
} from "./types.js";

const log = getLogger();

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_STDOUT_BYTES = 64 * 1024;

// Zod schema mirrors the `HookDecision` union so malformed responses don't
// crash the agent loop — they degrade to `allow`.
const DecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("allow") }),
  z.object({
    decision: z.literal("modify"),
    arguments: z.record(z.string(), z.unknown()),
    reason: z.string().optional(),
  }),
  z.object({ decision: z.literal("block"), message: z.string() }),
  z.object({
    decision: z.literal("prompt"),
    question: z.string(),
    approveMessage: z.string().optional(),
    denyMessage: z.string().optional(),
  }),
]);

const ALLOW: HookDecision = { decision: "allow" };

export interface RunHooksResult {
  /** Final decision after aggregating every matched hook. */
  decision: HookDecision;
  /** Number of hooks that fired. */
  fired: number;
}

export interface RunHooksInput {
  entries: readonly HookConfigEntry[];
  event: HookEventName;
  payload: HookPayload;
}

/**
 * Fire every matched hook for this event in order. The aggregation rule is:
 *   • `block` wins over everything — first blocking hook short-circuits.
 *   • `prompt` wins over `modify` / `allow` — last prompt is surfaced.
 *   • `modify` chains — later hooks see earlier modifications via payload.
 *   • `allow` is the identity.
 */
export async function runHooks(input: RunHooksInput): Promise<RunHooksResult> {
  const matches = matchHooks(input.entries, input.event, input.payload);
  if (matches.length === 0) return { decision: ALLOW, fired: 0 };

  let current: HookDecision = ALLOW;
  let payload: HookPayload = input.payload;

  for (const entry of matches) {
    const outcome = await runOneHook(entry, payload);

    if (outcome.decision === "block") {
      return { decision: outcome, fired: matches.length };
    }

    if (outcome.decision === "modify") {
      current = outcome;
      if ("arguments" in payload) {
        payload = { ...payload, arguments: outcome.arguments };
      }
      continue;
    }

    if (outcome.decision === "prompt") {
      current = outcome;
      continue;
    }

    // allow — no state change
  }

  return { decision: current, fired: matches.length };
}

// ---------------------------------------------------------------------------
// One-hook execution
// ---------------------------------------------------------------------------

async function runOneHook(
  entry: HookConfigEntry,
  payload: HookPayload,
): Promise<HookDecision> {
  const timeoutMs = entry.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let stdout = "";
  let stderr = "";
  let truncated = false;

  return await new Promise<HookDecision>((resolve) => {
    const child = spawn(entry.command, {
      shell: true,
      env: { ...process.env, ...(entry.env ?? {}) } as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      log.warn(`Hook "${entry.command}" timed out after ${timeoutMs}ms — allowing`);
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      if (truncated) return;
      if (stdout.length + chunk.length > MAX_STDOUT_BYTES) {
        stdout += chunk.slice(0, MAX_STDOUT_BYTES - stdout.length);
        truncated = true;
        return;
      }
      stdout += chunk;
    });

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });

    child.on("error", (err) => {
      clearTimeout(timer);
      log.warn(`Hook "${entry.command}" failed to start: ${err.message}`);
      resolve(ALLOW);
    });

    child.on("close", () => {
      clearTimeout(timer);
      if (stderr.trim()) log.debug(`Hook "${entry.command}" stderr: ${stderr.trimEnd()}`);
      resolve(parseDecision(stdout, entry.command));
    });

    try {
      child.stdin.end(JSON.stringify(payload));
    } catch (err) {
      clearTimeout(timer);
      log.warn(`Hook "${entry.command}" stdin write failed: ${err}`);
      resolve(ALLOW);
    }
  });
}

function parseDecision(stdout: string, command: string): HookDecision {
  const trimmed = stdout.trim();
  if (!trimmed) return ALLOW;

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    log.debug(`Hook "${command}" non-JSON stdout — treating as allow`);
    return ALLOW;
  }

  const parsed = DecisionSchema.safeParse(raw);
  if (!parsed.success) {
    log.debug(`Hook "${command}" malformed decision — treating as allow: ${parsed.error.message}`);
    return ALLOW;
  }

  return parsed.data as HookDecision;
}
