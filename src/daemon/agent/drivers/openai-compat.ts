// Daemon — OpenAI-compatible driver for custom providers.
//
// Instantiated per provider from ProviderConfig at boot. Each instance is
// registered in the driver registry under the provider's `id`.
//
// Supports any OpenAI-compatible endpoint: OpenRouter, DeepInfra, Together AI,
// Groq, custom URLs, etc. API keys are resolved lazily via resolveEnvRef()
// so environment variables are read at call time, not at boot.
//
// Delegates all SSE parsing to the shared parseOpenAIStream().

import type {
  LLMDriver,
  StreamChunk,
  DriverConfig,
  DriverMessage,
} from "./index.js";
import type { ProviderConfig } from "../../../shared/config.js";
import { resolveEnvRef } from "../../../shared/env-ref.js";
import { parseOpenAIStream } from "./openai-stream.js";

// ---------------------------------------------------------------------------
// Internal types (OpenAI API shapes)
// ---------------------------------------------------------------------------

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAITool {
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

export class OpenAICompatibleDriver implements LLMDriver {
  readonly name: string;
  private readonly config: ProviderConfig;

  constructor(providerConfig: ProviderConfig) {
    this.name = providerConfig.id;
    this.config = providerConfig;
  }

  /** Resolve the API key at call time (supports env var references). */
  private get apiKey(): string {
    return resolveEnvRef(this.config.apiKey);
  }

  /**
   * Determine the chat completions endpoint URL.
   * If baseUrl already ends with /v1, append /chat/completions.
   * Otherwise, append /v1/chat/completions.
   */
  private get chatEndpoint(): string {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    if (base.endsWith("/v1")) {
      return `${base}/chat/completions`;
    }
    return `${base}/v1/chat/completions`;
  }

  private convertMessages(messages: DriverMessage[]): OpenAIMessage[] {
    return messages.map((msg) => {
      const base: OpenAIMessage = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.tool_calls?.length) {
        base.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
        if (!msg.content) base.content = null;
      }

      if (msg.tool_call_id) {
        base.tool_call_id = msg.tool_call_id;
      }

      return base;
    });
  }

  private convertTools(config: DriverConfig): OpenAITool[] | undefined {
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
    // Dynamic reasoning detection from capabilities
    const isReasoning = config.capabilities?.reasoning ?? false;
    const converted = this.convertMessages(messages);
    const tools = this.convertTools(config);

    // Inject system prompt — reasoning models don't support system role
    if (config.system_prompt && !isReasoning) {
      const hasSystem = converted.some((m) => m.role === "system");
      if (!hasSystem) {
        converted.unshift({ role: "system", content: config.system_prompt });
      }
    }

    // Reasoning models: convert system messages to user messages
    if (isReasoning) {
      for (const msg of converted) {
        if (msg.role === "system") {
          msg.role = "user";
        }
      }
    }

    // Build headers: auth + content type + provider-specific custom headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    // Merge custom headers from provider config
    if (this.config.headers) {
      for (const [key, value] of Object.entries(this.config.headers)) {
        headers[key] = resolveEnvRef(value);
      }
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages: converted,
      stream: true,
      stream_options: { include_usage: true },
    };

    // Reasoning models use different parameter names
    if (isReasoning) {
      body.max_completion_tokens = config.max_tokens;
    } else {
      body.max_tokens = config.max_tokens;
      body.temperature = config.temperature;
    }

    // Tools only if model supports them
    if (tools && !isReasoning) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    let response: Response;
    try {
      response = await fetch(this.chatEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: config.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", content: `${this.config.name} request failed: ${msg}` };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: "error", content: `${this.config.name} API error ${response.status}: ${errorText}` };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.body) {
      yield { type: "error", content: `${this.config.name} API returned no body` };
      yield { type: "done", content: "" };
      return;
    }

    // Delegate SSE parsing to the shared stream parser.
    yield* parseOpenAIStream({ response, signal: config.signal });
  }
}
