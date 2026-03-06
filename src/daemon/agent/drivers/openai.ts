// Daemon — OpenAI driver.
// Streams chat completions via the OpenAI Chat Completions API.
//
// Delegates to OpenAICompatibleDriver — the OpenAI Chat Completions protocol
// IS the "OpenAI-compatible" protocol. Maintaining separate conversion code
// for the canonical provider was pure duplication (ADR-003).
//
// The OpenAI driver is a thin wrapper that configures an OpenAICompatibleDriver
// with OPENAI_API_KEY and OPENAI_BASE_URL from the environment.

import type {
  LLMDriver,
  StreamChunk,
  DriverConfig,
  DriverMessage,
} from "./index.js";
import { OpenAICompatibleDriver } from "./openai-compat.js";

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export class OpenAIDriver implements LLMDriver {
  readonly name = "openai";

  /**
   * The underlying OpenAI-compatible driver, created lazily on first use.
   * Lazy to allow environment variables to be set after module load but before
   * first API call (common in test and init scenarios).
   */
  private _delegate: OpenAICompatibleDriver | null = null;

  private get delegate(): OpenAICompatibleDriver {
    if (!this._delegate) {
      this._delegate = new OpenAICompatibleDriver({
        id: "openai",
        name: "OpenAI",
        baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: "{env:OPENAI_API_KEY}",
        type: "openai-compatible",
      });
    }
    return this._delegate;
  }

  async *chat(
    messages: DriverMessage[],
    config: DriverConfig,
  ): AsyncGenerator<StreamChunk> {
    yield* this.delegate.chat(messages, config);
  }
}
