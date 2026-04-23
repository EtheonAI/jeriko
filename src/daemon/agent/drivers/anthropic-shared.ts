// Shared Anthropic API helpers — message conversion, tool conversion, request building.
//
// Used by both AnthropicDriver (native) and AnthropicCompatibleDriver (custom providers).
// Extracts the protocol-specific logic so both drivers share the same conversion code.

import type { DriverConfig, DriverMessage, ContentBlock } from "./index.js";

/** Parse tool call arguments safely — malformed JSON becomes empty object. */
function safeParseArgs(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Anthropic API shapes
// ---------------------------------------------------------------------------

/** Anthropic prompt cache control marker (applied to the last block of a cached segment). */
export interface AnthropicCacheControl {
  type: "ephemeral";
}

export interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking" | "image";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  /** Image source — Anthropic's native vision format. */
  source?: { type: "base64"; media_type: string; data: string };
  /** Mark this block as a cache breakpoint — Anthropic caches the prefix up to & including it. */
  cache_control?: AnthropicCacheControl;
}

/** A system-prompt segment — array form required to carry cache_control. */
export interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: AnthropicCacheControl;
}

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Mark the last tool as a cache breakpoint so tools → system is cached. */
  cache_control?: AnthropicCacheControl;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_VERSION = "2023-06-01";
const THINKING_BETA = "extended-thinking-2025-04-11";
const PROMPT_CACHE_BETA = "prompt-caching-2024-07-31";

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

/**
 * Convert driver-agnostic messages to the Anthropic message format.
 * System messages are extracted — Anthropic puts them in a top-level field.
 */
export function convertToAnthropicMessages(messages: DriverMessage[]): {
  system: string | undefined;
  messages: AnthropicMessage[];
} {
  let system: string | undefined;
  const converted: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // System messages are always plain strings.
      system = typeof msg.content === "string" ? msg.content : "";
      continue;
    }

    if (msg.role === "tool") {
      converted.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id,
            content: typeof msg.content === "string" ? msg.content : "",
          },
        ],
      });
      continue;
    }

    if (msg.role === "assistant" && msg.tool_calls?.length) {
      const blocks: AnthropicContentBlock[] = [];
      const text = typeof msg.content === "string" ? msg.content : "";
      if (text) {
        blocks.push({ type: "text", text });
      }
      for (const tc of msg.tool_calls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: safeParseArgs(tc.arguments),
        });
      }
      converted.push({ role: "assistant", content: blocks });
      continue;
    }

    // User messages may carry multi-modal content blocks (vision).
    if (Array.isArray(msg.content)) {
      const blocks: AnthropicContentBlock[] = [];
      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "text") {
          blocks.push({ type: "text", text: block.text });
        } else if (block.type === "image") {
          blocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: block.mediaType,
              data: block.data,
            },
          });
        }
      }
      converted.push({ role: msg.role as "user" | "assistant", content: blocks });
      continue;
    }

    converted.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  return { system, messages: converted };
}

// ---------------------------------------------------------------------------
// Tool conversion
// ---------------------------------------------------------------------------

/**
 * Convert driver-agnostic tools to Anthropic tool definitions.
 */
export function convertToAnthropicTools(config: DriverConfig): AnthropicToolDef[] | undefined {
  if (!config.tools?.length) return undefined;
  return config.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

export interface AnthropicRequestOptions {
  apiKey: string;
  baseUrl: string;
  customHeaders?: Record<string, string>;
}

/**
 * Build Anthropic API request headers including beta flags.
 */
export function buildAnthropicHeaders(
  opts: AnthropicRequestOptions,
  config: DriverConfig,
): Record<string, string> {
  const betas: string[] = [];
  if (config.extended_thinking) betas.push(THINKING_BETA);
  betas.push(PROMPT_CACHE_BETA);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": opts.apiKey,
    "anthropic-version": API_VERSION,
  };
  if (betas.length > 0) {
    headers["anthropic-beta"] = betas.join(",");
  }

  // Merge custom headers (for proxies, regional endpoints)
  if (opts.customHeaders) {
    Object.assign(headers, opts.customHeaders);
  }

  return headers;
}

/**
 * Build the Anthropic Messages API request body.
 *
 * The `converted.system` field may be either a raw string (non-cached) or a
 * pre-decorated array of `AnthropicSystemBlock` (cache-aware). Callers route
 * through the cache module's `decorateAnthropicRequest()` when they want
 * prompt caching and pass the decorated shape straight through here.
 */
export function buildAnthropicRequestBody(
  config: DriverConfig,
  converted: {
    system: string | AnthropicSystemBlock[] | undefined;
    messages: AnthropicMessage[];
    tools: AnthropicToolDef[] | undefined;
  },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
    stream: true,
  };

  const system = converted.system ?? config.system_prompt;
  if (system !== undefined) body.system = system;
  body.messages = converted.messages;
  if (converted.tools) body.tools = converted.tools;

  if (config.extended_thinking) {
    body.thinking = {
      type: "enabled",
      budget_tokens: Math.min(config.max_tokens * 4, 128_000),
    };
  }

  return body;
}
