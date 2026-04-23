// LLM-backed summarization strategy.
//
// When auto-compaction fires, we can either truncate (safe, lossy) or call
// the model once more to produce a compact summary of the dropped turns.
// This module owns that *second call*: build the summary prompt, invoke
// the driver, collect the text, and return it.
//
// Cross-driver: the summarizer uses whichever driver is configured on the
// agent — Anthropic, OpenAI, local/Ollama. It does not require tool
// support, reasoning support, or vision. Any text-only chat model works.

import type { DriverMessage } from "../drivers/index.js";
import { getDriver } from "../drivers/index.js";
import { resolveModel, getCapabilities } from "../drivers/models.js";
import { messageText } from "../drivers/index.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

export interface SummarizeInput {
  /** Turns that will be dropped from history — we summarize these. */
  droppedTurns: DriverMessage[][];
  /** Backend name (e.g. "anthropic", "openai", "local"). */
  backend: string;
  /** Model id or alias — resolved against the registry. */
  model: string;
  /** Max summary length (driver max_tokens). */
  maxTokens: number;
  /** Optional AbortSignal — forwarded to the driver. */
  signal?: AbortSignal;
}

const SYSTEM_PROMPT = [
  "You compress conversation history for a long-running AI agent.",
  "The user will paste a sequence of prior turns. Produce a SHORT summary",
  "(≤ 300 words) that preserves: (a) unresolved tasks, (b) concrete facts",
  "the agent must remember (paths, ids, decisions), (c) user intent. Omit",
  "chit-chat. Do not invent details. Output plain prose — no headings,",
  "no bullet lists.",
].join(" ");

/**
 * Discriminated outcome of a summarization attempt. Callers key on
 * `status` instead of the legacy `string | undefined` convention —
 * this lets them distinguish "the model returned nothing meaningful"
 * (skipped) from "the call blew up" (error) and decide retry policy
 * accordingly.
 */
export type SummarizeResult =
  | { readonly status: "ok"; readonly summary: string }
  | { readonly status: "empty"; readonly reason: "no-input" | "no-text" }
  | { readonly status: "error"; readonly kind: "stream" | "exception"; readonly message: string };

/**
 * Call the configured driver and collect a plain-text summary of the
 * provided turns. Returns a {@link SummarizeResult} so callers can
 * distinguish transient failures (worth retrying) from empty outputs
 * (skip summarization, fall back to truncation) from hard exceptions.
 */
export async function summarizeTurns(input: SummarizeInput): Promise<SummarizeResult> {
  if (input.droppedTurns.length === 0) {
    return { status: "empty", reason: "no-input" };
  }

  let resolvedModel: string;
  try {
    const driver = getDriver(input.backend);
    resolvedModel = resolveModel(driver.name, input.model);
    const caps = getCapabilities(driver.name, resolvedModel);

    const userTurns = input.droppedTurns
      .flat()
      .map((m) => {
        const role = m.role === "tool" ? "tool" : m.role;
        return `[${role.toUpperCase()}]: ${messageText(m)}`;
      })
      .join("\n\n");

    const messages: DriverMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Turns to summarize:\n\n${userTurns}` },
    ];

    let text = "";
    for await (const chunk of driver.chat(messages, {
      model: resolvedModel,
      max_tokens: Math.min(input.maxTokens, Math.max(128, caps.maxOutput || 4096)),
      temperature: 0.2,
      // Summarizer never invokes tools, never reasons — cheapest path.
      tools: undefined,
      extended_thinking: false,
      capabilities: caps,
      signal: input.signal,
    })) {
      if (chunk.type === "text") text += chunk.content;
      if (chunk.type === "error") {
        const message = chunk.content || "stream reported error";
        log.warn(`Compaction summarizer stream error: ${message}`);
        return { status: "error", kind: "stream", message };
      }
      if (chunk.type === "done") break;
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return { status: "empty", reason: "no-text" };
    }
    return { status: "ok", summary: trimmed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(
      `Compaction summarizer threw for backend=${input.backend} model=${input.model}: ${message}`,
    );
    return { status: "error", kind: "exception", message };
  }
}
