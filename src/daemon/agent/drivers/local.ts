// Daemon — Local / Ollama driver.
// Streams chat completions from a local Ollama instance.
// Uses the OpenAI-compatible /v1/chat/completions endpoint.
//
// ZERO hardcoded model lists — tool calling and capabilities are detected
// dynamically via Ollama's /api/show endpoint (probed by models.ts).

import type {
  LLMDriver,
  StreamChunk,
  DriverConfig,
  DriverMessage,
} from "./index.js";
import { parseOpenAIStream } from "./openai-stream.js";
import { withTimeout } from "./signal.js";
import { withHttpRetry } from "../../../shared/http-retry.js";
import { redact } from "../../security/redaction.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "http://localhost:11434";

// ---------------------------------------------------------------------------
// Internal types (Ollama OpenAI-compat shapes)
// ---------------------------------------------------------------------------

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Base64-encoded images for vision models. */
  images?: string[];
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export class LocalDriver implements LLMDriver {
  readonly name = "local";

  private get baseUrl(): string {
    const localUrl = process.env.LOCAL_MODEL_URL;
    if (localUrl) return localUrl.replace(/\/v1\/?$/, "");
    return process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
  }

  private convertMessages(messages: DriverMessage[]): OllamaMessage[] {
    return messages.map((msg) => {
      // Handle multi-modal content blocks (vision).
      // Extract text and images separately — Ollama uses a dedicated `images` field.
      let content: string;
      let images: string[] | undefined;

      if (Array.isArray(msg.content)) {
        const textParts: string[] = [];
        const imageParts: string[] = [];
        for (const block of msg.content) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "image") imageParts.push(block.data);
        }
        content = textParts.join("\n");
        if (imageParts.length > 0) images = imageParts;
      } else {
        content = msg.content;
      }

      const base: OllamaMessage = { role: msg.role, content };
      if (images) base.images = images;

      if (msg.tool_calls?.length) {
        base.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }

      if (msg.tool_call_id) {
        base.tool_call_id = msg.tool_call_id;
      }

      return base;
    });
  }

  private convertTools(config: DriverConfig): OllamaTool[] | undefined {
    // Tools already filtered by agent.ts based on dynamic capabilities.
    // If tools are present in config, the model supports them.
    if (!config.tools?.length) return undefined;

    return config.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  async *chat(
    messages: DriverMessage[],
    config: DriverConfig,
  ): AsyncGenerator<StreamChunk> {
    // Model is already resolved by agent.ts — use directly
    const converted = this.convertMessages(messages);
    const tools = this.convertTools(config);

    // Inject system prompt if provided and not present.
    if (config.system_prompt) {
      const hasSystem = converted.some((m) => m.role === "system");
      if (!hasSystem) {
        converted.unshift({ role: "system", content: config.system_prompt });
      }
    }

    // Verify Ollama is reachable.
    try {
      const healthResp = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!healthResp.ok) {
        yield { type: "error", content: `Ollama not reachable at ${this.baseUrl}: HTTP ${healthResp.status}` };
        yield { type: "done", content: "" };
        return;
      }
    } catch (err) {
      yield {
        type: "error",
        content: `Ollama not reachable at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      };
      yield { type: "done", content: "" };
      return;
    }

    // Use Ollama's OpenAI-compatible endpoint.
    const body: Record<string, unknown> = {
      model: config.model,
      messages: converted,
      stream: true,
      options: {
        temperature: config.temperature,
        num_predict: config.max_tokens,
      },
    };

    if (tools) {
      body.tools = tools;
    }

    const signal = withTimeout(config.signal);
    const serialized = JSON.stringify(body);
    const url = `${this.baseUrl}/v1/chat/completions`;

    let response: Response;
    try {
      response = await withHttpRetry(
        () => fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: serialized,
          signal,
        }),
        {
          onRetry: ({ attempt, delayMs, status }) => {
            log.debug(
              `Ollama retry: status=${status} attempt=${attempt + 1} delay=${Math.round(delayMs)}ms`,
            );
          },
        },
      );
    } catch (err) {
      yield {
        type: "error",
        content: `Ollama request failed: ${err instanceof Error ? err.message : String(err)}`,
      };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      yield {
        type: "error",
        content: `Ollama API error ${response.status}: ${redact(errorText)}`,
      };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.body) {
      yield { type: "error", content: "Ollama API returned no body" };
      yield { type: "done", content: "" };
      return;
    }

    // Delegate SSE parsing to shared stream parser.
    // Handles AbortSignal racing, tool call accumulation, and flush-on-end
    // (critical for OSS models that don't send [DONE] or finish_reason).
    yield* parseOpenAIStream({ response, signal });
  }
}
