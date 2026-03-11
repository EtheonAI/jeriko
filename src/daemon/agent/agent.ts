// Daemon — Unified agent loop.
// Drives the conversation: send messages to LLM, execute tool calls, yield chunks.
// All LLM backends stream through the same async generator interface.
//
// The agent loop is the ORCHESTRATOR — it resolves models, detects capabilities,
// and adapts behavior dynamically. Drivers receive already-resolved model IDs
// and capabilities; they never maintain their own hardcoded model lists.
//
// Execution safety is delegated to ExecutionGuard (guard.ts), which enforces:
//   - Consecutive error circuit breaking
//   - Wall-clock duration limits
//   - Per-tool rate limiting

import { getDriver, messageText, type DriverConfig, type DriverMessage, type StreamChunk, type ToolCall, type ToolResult } from "./drivers/index.js";
import { resolveModel, getCapabilities, probeLocalModel, type ModelCapabilities } from "./drivers/models.js";
import { getTool, resolveDottedTool, listTools, toDriverFormat } from "./tools/registry.js";
import { addMessage, addPart } from "./session/message.js";
import { touchSession } from "./session/session.js";
import { estimateTokens } from "../../shared/tokens.js";
import { ExecutionGuard } from "./guard.js";
import { setActiveContext, clearActiveContext } from "./orchestrator-context.js";
import { getLogger } from "../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for an agent loop invocation. */
export interface AgentRunConfig {
  /** Session ID for message persistence. */
  sessionId: string;
  /** LLM backend name (e.g. "claude", "openai", "local"). */
  backend: string;
  /** Model identifier — can be an alias (e.g. "claude") or exact ID (e.g. "claude-sonnet-4-6"). */
  model: string;
  /** System prompt. */
  systemPrompt?: string;
  /** Maximum tokens per response. Defaults to model's maxOutput capability. */
  maxTokens?: number;
  /** Temperature (0-1). */
  temperature?: number;
  /** Enable extended thinking (only for models with reasoning capability). */
  extendedThinking?: boolean;
  /** List of tool IDs to enable. Null = all tools (if model supports them). */
  toolIds?: string[] | null;
  /** Maximum number of tool-call rounds before forcing a text response. */
  maxRounds?: number;
  /** Optional AbortSignal for cancellation/timeout. Forwarded to the LLM driver. */
  signal?: AbortSignal;
  /** Nesting depth for sub-agent orchestration (0 = top-level). */
  depth?: number;
}

/** A yielded event from the agent loop. */
export type AgentEvent =
  | { type: "text_delta"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call_start"; toolCall: ToolCall }
  | { type: "tool_result"; toolCallId: string; result: string; isError: boolean }
  | { type: "turn_complete"; tokensIn: number; tokensOut: number }
  | { type: "compaction"; beforeTokens: number; afterTokens: number }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

/**
 * Run the agent loop as an async generator.
 *
 * The loop:
 *  1. Resolve model alias → real API model ID.
 *  2. Detect capabilities (tools, reasoning, context window, max output).
 *  3. Build driver config with dynamic capabilities.
 *  4. Stream a response from the LLM.
 *  5. If the response contains tool calls, execute them and loop back.
 *  6. If the response is text-only, yield the final text and return.
 *
 * Callers iterate the generator to consume events as they happen:
 *
 * ```ts
 * for await (const event of runAgent(config, conversationHistory)) {
 *   if (event.type === "text_delta") process.stdout.write(event.content);
 * }
 * ```
 */
export async function* runAgent(
  config: AgentRunConfig,
  conversationHistory: DriverMessage[],
): AsyncGenerator<AgentEvent> {
  // ─── Step 1: Resolve model and detect capabilities ───────────────────
  // Use the driver's canonical name as the provider — not the user-facing alias.
  // The driver registry normalizes "ollama" → "local", "claude" → "anthropic", etc.
  const driver = getDriver(config.backend);
  const provider = driver.name;
  const resolvedModelId = resolveModel(provider, config.model);

  // For local models, probe Ollama for capabilities before proceeding.
  // Cloud models (anthropic/openai) are already cached from models.dev boot fetch.
  if (provider === "local") {
    await probeLocalModel(resolvedModelId);
  }

  const caps = getCapabilities(provider, resolvedModelId);
  const maxRounds = config.maxRounds ?? 40;

  log.debug(`Agent: resolved model "${config.model}" → "${resolvedModelId}" [ctx=${caps.context} out=${caps.maxOutput} tools=${caps.toolCall} reasoning=${caps.reasoning}]`);

  // ─── Step 2: Dynamic tool selection based on model capabilities ──────
  let enabledTools = config.toolIds
    ? listTools().filter((t) => config.toolIds!.includes(t.id))
    : listTools();

  // If the model doesn't support native tool calling, don't send tools.
  // The model can still respond with text — it just can't invoke tools.
  if (!caps.toolCall) {
    enabledTools = [];
    log.debug(`Agent: tools disabled — model "${resolvedModelId}" does not support tool calling`);
    yield {
      type: "text_delta",
      content: `⚠ Model "${config.model}" does not support tool calling — running in chat-only mode.\n` +
        `  Tools (bash, browse, edit, etc.) are disabled. Switch to a tool-capable model for full agent features.\n\n`,
    };
  }

  // ─── Step 3: Build driver config with dynamic values ─────────────────
  const driverConfig: DriverConfig = {
    // Already resolved — drivers use this directly, no further resolution
    model: resolvedModelId,
    // Use explicit maxTokens, or model's maxOutput, capped at a sane default
    max_tokens: config.maxTokens ?? Math.min(caps.maxOutput || 4096, 16_384),
    temperature: config.temperature ?? 0.3,
    // Tools only if model supports them AND we have tools to send
    tools: enabledTools.length > 0 ? toDriverFormat(enabledTools) : undefined,
    // Extended thinking only if model has reasoning capability
    extended_thinking: caps.reasoning ? (config.extendedThinking ?? false) : false,
    system_prompt: config.systemPrompt,
    // Pass capabilities to driver for API-specific adaptations
    capabilities: caps,
    // Forward abort signal to driver for cancellation/timeout
    signal: config.signal,
  };

  // ─── Step 4: Dynamic compaction threshold from context window ────────
  // Compact at 75% of the model's actual context window
  const compactionThreshold = Math.floor((caps.context || 24_000) * 0.75);

  // ─── Step 5: Initialize execution guard ──────────────────────────────
  const guard = new ExecutionGuard();

  const messages: DriverMessage[] = [...conversationHistory];
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  // Set active context so orchestrator tools (delegate, parallel) can access
  // the parent's system prompt, conversation, depth, and model during tool execution.
  setActiveContext({
    systemPrompt: config.systemPrompt,
    messages,
    depth: config.depth ?? 0,
    backend: config.backend,
    model: config.model,
  });

  try {

  for (let round = 0; round < maxRounds; round++) {
    // ── Guard: pre-round check (duration limit) ───────────────────────
    const durationCheck = guard.checkBeforeRound();
    if (durationCheck) {
      yield { type: "text_delta", content: durationCheck };
      yield { type: "turn_complete", tokensIn: totalTokensIn, tokensOut: totalTokensOut };
      return;
    }

    // Check for context compaction using dynamic threshold
    const currentTokens = estimateTokens(
      messages.map((m) => messageText(m)).join(""),
    );
    if (currentTokens >= compactionThreshold && messages.length > 4) {
      const beforeTokens = currentTokens;
      const compacted = compactMessages(messages);
      const afterTokens = estimateTokens(
        compacted.map((m) => messageText(m)).join(""),
      );
      messages.length = 0;
      messages.push(...compacted);
      yield { type: "compaction", beforeTokens, afterTokens };
    }

    // Stream response from LLM
    let fullText = "";
    const toolCalls: ToolCall[] = [];
    let hadError = false;

    try {
      for await (const chunk of driver.chat(messages, driverConfig)) {
        switch (chunk.type) {
          case "text":
            fullText += chunk.content;
            yield { type: "text_delta", content: chunk.content };
            break;

          case "thinking":
            yield { type: "thinking", content: chunk.content };
            break;

          case "tool_call":
            if (chunk.tool_call) {
              toolCalls.push(chunk.tool_call);
              yield { type: "tool_call_start", toolCall: chunk.tool_call };
            }
            break;

          case "error":
            hadError = true;
            yield { type: "error", message: chunk.content };
            break;

          case "done":
            break;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      yield { type: "error", message: errMsg };
      log.error(`Agent loop error on round ${round}: ${errMsg}`);
      return;
    }

    // Estimate tokens for this turn (image blocks add ~1000 tokens each)
    const lastMsg = messages[messages.length - 1];
    const lastMsgText = lastMsg ? messageText(lastMsg) : "";
    const imageBlockCount = lastMsg && Array.isArray(lastMsg.content)
      ? lastMsg.content.filter((b) => b.type === "image").length
      : 0;
    const turnTokensIn = estimateTokens(lastMsgText) + (imageBlockCount * 1000);
    const turnTokensOut = estimateTokens(fullText);
    totalTokensIn += turnTokensIn;
    totalTokensOut += turnTokensOut;

    // Persist assistant message
    if (fullText) {
      const assistantMsg = addMessage(
        config.sessionId,
        "assistant",
        fullText,
        { input: turnTokensIn, output: turnTokensOut },
      );
      addPart(assistantMsg.id, "text", fullText);
      messages.push({
        role: "assistant",
        content: fullText,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    } else if (toolCalls.length > 0) {
      messages.push({ role: "assistant", content: "", tool_calls: toolCalls });
    }

    // If no tool calls, the turn is complete
    if (toolCalls.length === 0 || hadError) {
      touchSession(config.sessionId);
      yield { type: "turn_complete", tokensIn: totalTokensIn, tokensOut: totalTokensOut };
      return;
    }

    // ── Execute tool calls ────────────────────────────────────────────
    const toolResults: ToolResult[] = [];

    for (const tc of toolCalls) {
      // Resolve tool — supports dotted names from OSS models (e.g. "browser.click")
      const { tool, inferredAction } = resolveDottedTool(tc.name);

      let result: string;
      let isError = false;

      if (!tool) {
        result = `Tool "${tc.name}" not found`;
        isError = true;
      } else {
        // Guard: per-tool rate limit check
        const rateCheck = guard.checkToolCall(tool.name);
        if (rateCheck) {
          result = rateCheck;
          isError = true;
        } else {
          try {
            const args = parseToolArgs(tc.arguments);
            // Inject inferred action from dotted name (e.g. "browser.click" → action:"click")
            if (inferredAction && !args.action) {
              args.action = inferredAction;
            }
            result = await tool.execute(args);
          } catch (err) {
            result = err instanceof Error ? err.message : String(err);
            isError = true;
          }
        }
      }

      toolResults.push({ tool_call_id: tc.id, content: result, is_error: isError });
      yield { type: "tool_result", toolCallId: tc.id, result, isError };

      // Persist tool result
      const toolMsg = addMessage(config.sessionId, "tool", result);
      addPart(toolMsg.id, isError ? "error" : "tool_result", result, tc.name, tc.id);
      messages.push({ role: "tool", content: result, tool_call_id: tc.id });
    }

    // ── Guard: post-round circuit breaker ─────────────────────────────
    const allFailed = toolResults.every((r) => r.is_error);
    const breakerCheck = guard.recordRound(allFailed);
    if (breakerCheck) {
      yield { type: "text_delta", content: breakerCheck };
      yield { type: "turn_complete", tokensIn: totalTokensIn, tokensOut: totalTokensOut };
      return;
    }

    log.debug(`Agent round ${round + 1}: ${toolCalls.length} tool(s) executed, continuing`);
  }

  // Max rounds exceeded
  yield { type: "error", message: `Agent loop exceeded maximum rounds (${maxRounds})` };
  yield { type: "turn_complete", tokensIn: totalTokensIn, tokensOut: totalTokensOut };

  } finally {
    // Always clear active context when the agent loop exits,
    // regardless of whether it completed normally or threw.
    clearActiveContext();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse tool call arguments with repair for common OSS model JSON issues.
 *
 * OSS models (Llama, Qwen, Mistral, DeepSeek) frequently produce:
 *   - Trailing commas: {"a": 1, "b": 2,}
 *   - Single-quoted strings: {'key': 'value'}
 *   - Unquoted keys: {key: "value"}
 *   - Wrapped in markdown: ```json\n{...}\n```
 *   - Empty or whitespace-only strings
 *
 * We try JSON.parse first (fast path), then repair common issues.
 */
function parseToolArgs(raw: string): Record<string, unknown> {
  // Fast path — valid JSON
  try {
    return JSON.parse(raw);
  } catch {
    // Fall through to repair
  }

  let s = raw.trim();

  // Empty arguments → empty object
  if (!s) return {};

  // Strip markdown code fences: ```json\n{...}\n```
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }

  // Trailing commas before closing brackets
  s = s.replace(/,\s*([}\]])/g, "$1");

  // Single-quoted strings → double-quoted
  // Only do this if there are no double quotes at all (avoid breaking mixed quotes)
  if (!s.includes('"') && s.includes("'")) {
    s = s.replace(/'/g, '"');
  }

  // Unquoted keys: { key: "value" } → { "key": "value" }
  s = s.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');

  try {
    return JSON.parse(s);
  } catch {
    // Last resort — the original error is more useful than the repair error
    return JSON.parse(raw);
  }
}

/**
 * Compact a message history by keeping:
 * - System messages
 * - First user message
 * - Last 6 messages
 * With a compaction marker where messages were removed.
 */
function compactMessages(messages: DriverMessage[]): DriverMessage[] {
  if (messages.length <= 8) return messages;

  const result: DriverMessage[] = [];
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  result.push(...systemMsgs);

  if (nonSystem.length > 0) {
    const first = nonSystem[0];
    if (first) result.push(first);
  }

  result.push({
    role: "system",
    content: "[Earlier conversation history was compacted to save context window space.]",
  });

  const tail = nonSystem.slice(-6);
  result.push(...tail);

  return result;
}
