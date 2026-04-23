// Reactive compaction — triggered when a provider returns HTTP 413
// ("request too large"). Distinct from auto-compaction because it happens
// *after* a failed call rather than before the next one.
//
// The caller catches the 413, hands us the buffer + context limit, we
// aggressively squeeze, and they retry exactly once with the new buffer.
// If the retry also hits 413, we surface the error — two aggressive
// compactions is enough to prevent infinite loops.

import type { DriverMessage } from "../drivers/index.js";
import { autoCompact } from "./auto.js";
import type { CompactionPolicy, CompactionResult } from "./types.js";

export interface ReactiveCompactInput {
  messages: DriverMessage[];
  contextLimit: number;
  /** Base policy — we clone it with a harsher target ratio. */
  policy: CompactionPolicy;
  backend: string;
  model: string;
  signal?: AbortSignal;
}

/** 413 aggression factor — compact to 25% of context, not the default 50%. */
const REACTIVE_TARGET_RATIO = 0.25;

/** Detect whether an error indicates a prompt-too-large condition. */
export function isOversizedError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("413") || msg.includes("Request Entity Too Large")) return true;
  if (msg.toLowerCase().includes("prompt is too long")) return true;
  if (msg.toLowerCase().includes("context length") && msg.toLowerCase().includes("exceed")) return true;
  return false;
}

/**
 * Run an aggressive compaction pass in response to a 413.
 *
 * Uses the same composed pipeline as `autoCompact` but with a tighter
 * target ratio so the retry has generous headroom. The result's `strategy`
 * field is set to `"reactive"` for telemetry even when summarization
 * succeeds — callers care that this was a recovery path, not a routine one.
 */
export async function reactiveCompact(
  input: ReactiveCompactInput,
): Promise<CompactionResult> {
  const tightenedPolicy: CompactionPolicy = {
    ...input.policy,
    autoCompactRatio: 0, // force compaction regardless of current size
    targetRatio: REACTIVE_TARGET_RATIO,
  };

  const result = await autoCompact({
    messages: input.messages,
    contextLimit: input.contextLimit,
    policy: tightenedPolicy,
    backend: input.backend,
    model: input.model,
    signal: input.signal,
  });

  return { ...result, strategy: "reactive" };
}
