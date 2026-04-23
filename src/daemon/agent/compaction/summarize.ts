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
 * Call the configured driver and collect a plain-text summary of the
 * provided turns. Returns `undefined` on any error — the caller should
 * fall back to truncation-only compaction.
 */
export async function summarizeTurns(input: SummarizeInput): Promise<string | undefined> {
  if (input.droppedTurns.length === 0) return undefined;

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
        log.warn(`Compaction summarizer error: ${chunk.content}`);
        return undefined;
      }
      if (chunk.type === "done") break;
    }

    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch (err) {
    log.warn(
      `Compaction summarizer failed for backend=${input.backend} model=${input.model}: ${err}`,
    );
    return undefined;
  }
}
