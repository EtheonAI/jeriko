// Daemon — LLM Driver registry.
// Maps backend names to their driver implementation.
// Every driver streams chunks through the same interface.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single tool call extracted from an LLM response. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON-encoded arguments
}

/** The result of executing a tool call. */
export interface ToolResult {
  tool_call_id: string;
  content: string;
  is_error: boolean;
}

/** An atomic piece of a streaming LLM response. */
export interface StreamChunk {
  type: "text" | "tool_call" | "thinking" | "done" | "error";
  content: string;
  tool_call?: ToolCall;
}

// ---------------------------------------------------------------------------
// Multi-modal content blocks (vision, audio, etc.)
// ---------------------------------------------------------------------------

/** A text content block within a multi-modal message. */
export interface TextBlock {
  type: "text";
  text: string;
}

/** An image content block for vision-capable models. */
export interface ImageBlock {
  type: "image";
  /** Base64-encoded image data (without data URI prefix). */
  data: string;
  /** MIME type: "image/jpeg", "image/png", "image/gif", "image/webp". */
  mediaType: string;
}

/** A content block in a multi-modal message. */
export type ContentBlock = TextBlock | ImageBlock;

/**
 * Extract the text content from a DriverMessage, regardless of whether
 * content is a plain string or an array of ContentBlocks.
 *
 * Used for token estimation, logging, and persistence where only the
 * text representation is needed.
 */
export function messageText(msg: DriverMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** Configuration forwarded to every driver's chat method. */
export interface DriverConfig {
  model: string;
  max_tokens: number;
  temperature: number;
  tools?: DriverTool[];
  extended_thinking?: boolean;
  system_prompt?: string;
  /** Dynamic model capabilities from the registry. Drivers read this instead
   *  of maintaining hardcoded model lists. */
  capabilities?: import("./models.js").ModelCapabilities;
  /** Optional AbortSignal for cancellation/timeout. */
  signal?: AbortSignal;
}

/** A tool definition in the driver-agnostic format. */
export interface DriverTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/** A message in the driver-agnostic format. */
export interface DriverMessage {
  role: "user" | "assistant" | "system" | "tool";
  /**
   * Message content — plain string (most messages) or an array of content
   * blocks for multi-modal messages (e.g. user sends text + image).
   *
   * ContentBlock[] is only used for user messages with attached images
   * when the model supports vision. All other roles use plain strings.
   */
  content: string | ContentBlock[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * The contract every LLM driver must satisfy.
 *
 * Drivers are stateless — all connection/model info is passed through
 * `DriverConfig` on every call. Streaming is mandatory: callers iterate
 * the returned async generator to consume chunks as they arrive.
 */
export interface LLMDriver {
  /** Human-readable driver name (e.g. "anthropic", "openai", "local"). */
  readonly name: string;

  /**
   * Stream a chat completion.
   *
   * @param messages  Conversation history in driver-agnostic format.
   * @param config    Model, temperature, tools, etc.
   * @yields         StreamChunk items ending with type "done".
   */
  chat(
    messages: DriverMessage[],
    config: DriverConfig,
  ): AsyncGenerator<StreamChunk>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

import { AnthropicDriver } from "./anthropic.js";
import { OpenAIDriver } from "./openai.js";
import { LocalDriver } from "./local.js";
import { ClaudeCodeDriver } from "./claude-code.js";

const drivers = new Map<string, LLMDriver>();

/** Register a driver under one or more names. */
function register(driver: LLMDriver, ...aliases: string[]): void {
  drivers.set(driver.name, driver);
  for (const alias of aliases) {
    drivers.set(alias, driver);
  }
}

// Eagerly register the four built-in drivers.
register(new AnthropicDriver(), "claude");
register(new OpenAIDriver(), "gpt", "gpt4", "gpt-4", "gpt-4o", "o1", "o3");
register(new LocalDriver(), "ollama");
register(new ClaudeCodeDriver(), "cc");

/**
 * Look up a driver by backend name.
 *
 * @param backend  "anthropic" | "openai" | "local" or any registered alias.
 * @throws         If no driver is registered for the given name.
 */
export function getDriver(backend: string): LLMDriver {
  const driver = drivers.get(backend.toLowerCase());
  if (!driver) {
    throw new Error(
      `Unknown LLM backend "${backend}". Registered: ${[...new Set(drivers.values())].map((d) => d.name).join(", ")}`,
    );
  }
  return driver;
}

/**
 * Register a custom driver (e.g. from a plugin).
 */
export function registerDriver(driver: LLMDriver, ...aliases: string[]): void {
  register(driver, ...aliases);
}

/** List all unique registered driver names. */
export function listDrivers(): string[] {
  return [...new Set([...drivers.values()].map((d) => d.name))];
}
