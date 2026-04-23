// Daemon — Anthropic-compatible driver for custom providers.
//
// Instantiated per provider from ProviderConfig at boot (when type: "anthropic").
// Enables custom providers that speak the Anthropic Messages API protocol:
//   - Anthropic API proxies (corporate, regional)
//   - Self-hosted Anthropic-compatible endpoints
//   - Any provider that implements the Anthropic Messages API
//
// Uses the same shared conversion logic as the native AnthropicDriver.
// API keys are resolved lazily via resolveEnvRef() at call time.

import type {
  LLMDriver,
  StreamChunk,
  DriverConfig,
  DriverMessage,
} from "./index.js";
import type { ProviderConfig } from "../../../shared/config.js";
import { resolveEnvRef } from "../../../shared/env-ref.js";
import { withTimeout } from "./signal.js";
import { parseAnthropicStream } from "./anthropic-stream.js";
import {
  convertToAnthropicMessages,
  convertToAnthropicTools,
  buildAnthropicRequestBody,
  buildAnthropicHeaders,
} from "./anthropic-shared.js";
import { withHttpRetry } from "../../../shared/http-retry.js";
import { redact } from "../../security/redaction.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export class AnthropicCompatibleDriver implements LLMDriver {
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
   * Determine the messages endpoint URL.
   * Anthropic Messages API endpoint: /v1/messages
   */
  private get messagesEndpoint(): string {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    if (base.endsWith("/v1")) {
      return `${base}/messages`;
    }
    return `${base}/v1/messages`;
  }

  async *chat(
    messages: DriverMessage[],
    config: DriverConfig,
  ): AsyncGenerator<StreamChunk> {
    const { system, messages: converted } = convertToAnthropicMessages(messages);
    const tools = convertToAnthropicTools(config);

    // Resolve custom headers (may contain env refs)
    const customHeaders: Record<string, string> = {};
    if (this.config.headers) {
      for (const [key, value] of Object.entries(this.config.headers)) {
        customHeaders[key] = resolveEnvRef(value);
      }
    }

    const headers = buildAnthropicHeaders(
      { apiKey: this.apiKey, baseUrl: this.config.baseUrl, customHeaders },
      config,
    );

    const body = buildAnthropicRequestBody(config, { system, messages: converted, tools });

    const signal = withTimeout(config.signal);
    const serialized = JSON.stringify(body);
    const providerName = this.config.name;

    let response: Response;
    try {
      response = await withHttpRetry(
        () => fetch(this.messagesEndpoint, { method: "POST", headers, body: serialized, signal }),
        {
          onRetry: ({ attempt, delayMs, status }) => {
            log.debug(
              `${providerName} retry: status=${status} attempt=${attempt + 1} delay=${Math.round(delayMs)}ms`,
            );
          },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", content: `${providerName} request failed: ${msg}` };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      yield {
        type: "error",
        content: `${providerName} API error ${response.status}: ${redact(errorText)}`,
      };
      yield { type: "done", content: "" };
      return;
    }

    yield* parseAnthropicStream({ response, providerName: this.config.name });
  }
}
