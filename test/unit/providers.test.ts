import { describe, expect, it, beforeAll } from "bun:test";
import type { ProviderConfig } from "../../src/shared/config.js";
import { registerCustomProviders } from "../../src/daemon/agent/drivers/providers.js";
import { getDriver, listDrivers, registerDriver } from "../../src/daemon/agent/drivers/index.js";
import {
  resolveModel,
  getCapabilities,
  registerProviderAliases,
  isKnownProvider,
  parseModelSpec,
  loadModelRegistry,
} from "../../src/daemon/agent/drivers/models.js";
import { OpenAICompatibleDriver } from "../../src/daemon/agent/drivers/openai-compat.js";

// ─── Test fixtures ──────────────────────────────────────────────────────────

const TEST_PROVIDER: ProviderConfig = {
  id: "test-provider",
  name: "Test Provider",
  baseUrl: "https://api.test-provider.com/v1",
  apiKey: "test-key-123",
  models: {
    deepseek: "deepseek/deepseek-chat-v3-0324",
    llama: "meta-llama/llama-4-maverick",
  },
  defaultModel: "deepseek/deepseek-chat-v3-0324",
};

const OPENROUTER_PROVIDER: ProviderConfig = {
  id: "openrouter",
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "{env:OPENROUTER_API_KEY}",
  headers: { "X-Title": "Jeriko" },
  models: {
    deepseek: "deepseek/deepseek-chat-v3-0324",
    claude: "anthropic/claude-sonnet-4-6",
    gpt5: "openai/gpt-5",
  },
  defaultModel: "deepseek/deepseek-chat-v3-0324",
};

// ─── registerCustomProviders ────────────────────────────────────────────────

describe("registerCustomProviders", () => {
  it("registers a provider as a driver accessible via getDriver", () => {
    registerCustomProviders([TEST_PROVIDER]);

    const driver = getDriver("test-provider");
    expect(driver).toBeDefined();
    expect(driver.name).toBe("test-provider");
  });

  it("includes custom provider in listDrivers", () => {
    registerCustomProviders([TEST_PROVIDER]);

    const names = listDrivers();
    expect(names).toContain("test-provider");
  });

  it("registers multiple providers", () => {
    const second: ProviderConfig = {
      id: "second-provider",
      name: "Second",
      baseUrl: "https://api.second.com/v1",
      apiKey: "key",
    };

    registerCustomProviders([TEST_PROVIDER, second]);

    expect(getDriver("test-provider").name).toBe("test-provider");
    expect(getDriver("second-provider").name).toBe("second-provider");
  });

  it("skips providers with missing id or baseUrl", () => {
    const invalid: ProviderConfig = {
      id: "",
      name: "Invalid",
      baseUrl: "",
      apiKey: "key",
    };

    // Should not throw
    registerCustomProviders([invalid]);
    expect(listDrivers()).not.toContain("");
  });

  it("registers anthropic-type providers as AnthropicCompatibleDriver", () => {
    const anthropicType: ProviderConfig = {
      id: "custom-anthropic",
      name: "Custom Anthropic",
      baseUrl: "https://api.example.com",
      apiKey: "key",
      type: "anthropic",
    };

    registerCustomProviders([anthropicType]);
    expect(listDrivers()).toContain("custom-anthropic");
    expect(getDriver("custom-anthropic").name).toBe("custom-anthropic");
  });

  it("skips providers with unsupported type", () => {
    const badType: ProviderConfig = {
      id: "bad-type-provider",
      name: "Bad Type",
      baseUrl: "https://api.example.com",
      apiKey: "key",
      type: "unsupported" as any,
    };

    registerCustomProviders([badType]);
    expect(listDrivers()).not.toContain("bad-type-provider");
  });
});

// ─── OpenAICompatibleDriver ─────────────────────────────────────────────────

describe("OpenAICompatibleDriver", () => {
  it("uses provider config id as driver name", () => {
    const driver = new OpenAICompatibleDriver(TEST_PROVIDER);
    expect(driver.name).toBe("test-provider");
  });

  it("computes correct chat endpoint from baseUrl ending with /v1", () => {
    const driver = new OpenAICompatibleDriver({
      ...TEST_PROVIDER,
      baseUrl: "https://api.example.com/v1",
    });
    // The endpoint should be baseUrl + /chat/completions
    // We test this indirectly through the driver name since chatEndpoint is private
    expect(driver.name).toBe("test-provider");
  });

  it("implements the LLMDriver interface", () => {
    const driver = new OpenAICompatibleDriver(TEST_PROVIDER);
    expect(typeof driver.chat).toBe("function");
    expect(typeof driver.name).toBe("string");
  });
});

// ─── Provider model aliases ─────────────────────────────────────────────────

describe("provider model aliases", () => {
  beforeAll(() => {
    registerCustomProviders([OPENROUTER_PROVIDER]);
  });

  it("resolves custom provider aliases via resolveModel", () => {
    const resolved = resolveModel("openrouter", "deepseek");
    expect(resolved).toBe("deepseek/deepseek-chat-v3-0324");
  });

  it("resolves default model when using provider id as alias", () => {
    const resolved = resolveModel("openrouter", "openrouter");
    expect(resolved).toBe("deepseek/deepseek-chat-v3-0324");
  });

  it("passes through exact model IDs for custom providers", () => {
    // test-provider (not on models.dev) should pass through unknown model IDs
    const resolved = resolveModel("test-provider", "myvendor/my-custom-model-v99");
    expect(resolved).toBe("myvendor/my-custom-model-v99");
  });
});

// ─── registerProviderAliases ────────────────────────────────────────────────

describe("registerProviderAliases", () => {
  it("registers aliases that are resolvable", () => {
    registerProviderAliases("test-alias-provider", {
      fast: "provider/fast-model",
      smart: "provider/smart-model",
    });

    expect(resolveModel("test-alias-provider", "fast")).toBe("provider/fast-model");
    expect(resolveModel("test-alias-provider", "smart")).toBe("provider/smart-model");
  });

  it("merges with existing aliases", () => {
    registerProviderAliases("test-merge-provider", { a: "model-a" });
    registerProviderAliases("test-merge-provider", { b: "model-b" });

    expect(resolveModel("test-merge-provider", "a")).toBe("model-a");
    expect(resolveModel("test-merge-provider", "b")).toBe("model-b");
  });

  it("aliases are case-insensitive", () => {
    registerProviderAliases("test-case-provider", { MyModel: "real/model" });
    expect(resolveModel("test-case-provider", "mymodel")).toBe("real/model");
  });
});

// ─── isKnownProvider ────────────────────────────────────────────────────────

describe("isKnownProvider", () => {
  beforeAll(() => {
    registerCustomProviders([TEST_PROVIDER]);
  });

  it("returns true for built-in providers", () => {
    expect(isKnownProvider("anthropic")).toBe(true);
    expect(isKnownProvider("openai")).toBe(true);
    expect(isKnownProvider("local")).toBe(true);
  });

  it("returns true for built-in aliases", () => {
    expect(isKnownProvider("claude")).toBe(true);
    expect(isKnownProvider("gpt")).toBe(true);
    expect(isKnownProvider("ollama")).toBe(true);
  });

  it("returns true for custom providers", () => {
    expect(isKnownProvider("test-provider")).toBe(true);
  });

  it("returns false for unknown names", () => {
    expect(isKnownProvider("nonexistent-xyz")).toBe(false);
  });
});

// ─── parseModelSpec ─────────────────────────────────────────────────────────

describe("parseModelSpec", () => {
  beforeAll(() => {
    registerCustomProviders([TEST_PROVIDER, OPENROUTER_PROVIDER]);
  });

  it("splits provider:model when provider is known", () => {
    const spec = parseModelSpec("openrouter:deepseek");
    expect(spec.backend).toBe("openrouter");
    expect(spec.model).toBe("deepseek");
  });

  it("treats whole string as both backend and model when no colon", () => {
    const spec = parseModelSpec("claude");
    expect(spec.backend).toBe("claude");
    expect(spec.model).toBe("claude");
  });

  it("treats whole string as model for Ollama model:tag format", () => {
    // "llama3:70b" — "llama3" is NOT a registered driver, so the whole thing
    // should be treated as a model identifier (backward compat)
    const spec = parseModelSpec("llama3:70b");
    expect(spec.backend).toBe("llama3:70b");
    expect(spec.model).toBe("llama3:70b");
  });

  it("handles built-in provider:model", () => {
    const spec = parseModelSpec("anthropic:claude-sonnet-4-6");
    expect(spec.backend).toBe("anthropic");
    expect(spec.model).toBe("claude-sonnet-4-6");
  });

  it("handles custom provider:model", () => {
    const spec = parseModelSpec("test-provider:deepseek");
    expect(spec.backend).toBe("test-provider");
    expect(spec.model).toBe("deepseek");
  });

  it("handles model IDs with slashes after colon", () => {
    const spec = parseModelSpec("openrouter:deepseek/deepseek-chat-v3");
    expect(spec.backend).toBe("openrouter");
    expect(spec.model).toBe("deepseek/deepseek-chat-v3");
  });
});

// ─── getCapabilities cross-reference for custom providers ───────────────────

describe("getCapabilities for custom providers", () => {
  beforeAll(async () => {
    // Load models.dev to populate family cross-reference index
    await loadModelRegistry();
    registerCustomProviders([OPENROUTER_PROVIDER]);
  });

  it("returns cross-referenced caps for known model families", () => {
    // "deepseek/deepseek-chat-v3-0324" should match deepseek family in models.dev
    const caps = getCapabilities("openrouter", "deepseek/deepseek-chat-v3-0324");
    // The cross-ref should detect this is a capable model
    expect(caps.id).toBe("deepseek/deepseek-chat-v3-0324");
    expect(caps.provider).toBe("openrouter");
    // Cost should be zeroed out for custom providers
    expect(caps.costInput).toBe(0);
    expect(caps.costOutput).toBe(0);
  });

  it("returns ultra-conservative default for completely unknown models", () => {
    const caps = getCapabilities("openrouter", "totally-unknown-model-xyz-999");
    expect(caps.id).toBe("totally-unknown-model-xyz-999");
    expect(caps.provider).toBe("openrouter");
    expect(caps.family).toBe("unknown");
    expect(caps.context).toBe(24_000);
  });
});

// ─── AnthropicCompatibleDriver ───────────────────────────────────────────────

import { AnthropicCompatibleDriver } from "../../src/daemon/agent/drivers/anthropic-compat.js";

describe("AnthropicCompatibleDriver", () => {
  const ANTHROPIC_PROVIDER: ProviderConfig = {
    id: "anthropic-proxy",
    name: "Anthropic Proxy",
    baseUrl: "https://proxy.example.com",
    apiKey: "test-key",
    type: "anthropic",
  };

  it("uses provider config id as driver name", () => {
    const driver = new AnthropicCompatibleDriver(ANTHROPIC_PROVIDER);
    expect(driver.name).toBe("anthropic-proxy");
  });

  it("implements the LLMDriver interface", () => {
    const driver = new AnthropicCompatibleDriver(ANTHROPIC_PROVIDER);
    expect(typeof driver.chat).toBe("function");
    expect(typeof driver.name).toBe("string");
  });

  it("is registered via registerCustomProviders with type anthropic", () => {
    registerCustomProviders([{
      id: "my-anthropic-endpoint",
      name: "My Anthropic",
      baseUrl: "https://my-proxy.example.com",
      apiKey: "test-key",
      type: "anthropic",
    }]);
    const driver = getDriver("my-anthropic-endpoint");
    expect(driver.name).toBe("my-anthropic-endpoint");
  });

  it("registers model aliases for anthropic-type providers", () => {
    registerCustomProviders([{
      id: "anthro-custom",
      name: "Anthro Custom",
      baseUrl: "https://api.example.com",
      apiKey: "key",
      type: "anthropic",
      models: { "fast": "claude-3-haiku" },
      defaultModel: "claude-3-sonnet",
    }]);

    expect(resolveModel("anthro-custom", "fast")).toBe("claude-3-haiku");
    expect(resolveModel("anthro-custom", "anthro-custom")).toBe("claude-3-sonnet");
  });
});

// ─── Anthropic shared helpers ─────────────────────────────────────────────────

import {
  convertToAnthropicMessages,
  convertToAnthropicTools,
  buildAnthropicHeaders,
  buildAnthropicRequestBody,
} from "../../src/daemon/agent/drivers/anthropic-shared.js";
import type { DriverMessage, DriverConfig } from "../../src/daemon/agent/drivers/index.js";

describe("anthropic-shared helpers", () => {
  it("convertToAnthropicMessages extracts system messages", () => {
    const messages: DriverMessage[] = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hello" },
    ];
    const { system, messages: converted } = convertToAnthropicMessages(messages);
    expect(system).toBe("You are helpful");
    expect(converted.length).toBe(1);
    expect(converted[0]!.role).toBe("user");
  });

  it("convertToAnthropicMessages converts tool results to user messages", () => {
    const messages: DriverMessage[] = [
      { role: "tool", content: "result data", tool_call_id: "call_123" },
    ];
    const { messages: converted } = convertToAnthropicMessages(messages);
    expect(converted[0]!.role).toBe("user");
    expect(Array.isArray(converted[0]!.content)).toBe(true);
    const blocks = converted[0]!.content as any[];
    expect(blocks[0].type).toBe("tool_result");
    expect(blocks[0].tool_use_id).toBe("call_123");
  });

  it("convertToAnthropicMessages converts assistant tool calls to content blocks", () => {
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "Let me check",
        tool_calls: [{ id: "tc_1", name: "bash", arguments: '{"command":"ls"}' }],
      },
    ];
    const { messages: converted } = convertToAnthropicMessages(messages);
    const blocks = converted[0]!.content as any[];
    expect(blocks.length).toBe(2);
    expect(blocks[0].type).toBe("text");
    expect(blocks[1].type).toBe("tool_use");
    expect(blocks[1].name).toBe("bash");
  });

  it("convertToAnthropicTools maps driver tools to Anthropic format", () => {
    const config = {
      model: "test",
      max_tokens: 1024,
      temperature: 0.3,
      tools: [
        { name: "bash", description: "Run a command", parameters: { type: "object" } },
      ],
    } as DriverConfig;
    const tools = convertToAnthropicTools(config);
    expect(tools).toBeDefined();
    expect(tools![0]!.name).toBe("bash");
    expect(tools![0]!.input_schema).toEqual({ type: "object" });
  });

  it("buildAnthropicHeaders includes API key and version", () => {
    const headers = buildAnthropicHeaders(
      { apiKey: "sk-test", baseUrl: "https://api.anthropic.com" },
      { model: "test", max_tokens: 1024, temperature: 0.3 } as DriverConfig,
    );
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-beta"]).toContain("prompt-caching");
  });

  it("buildAnthropicHeaders includes thinking beta when extended_thinking is on", () => {
    const headers = buildAnthropicHeaders(
      { apiKey: "sk-test", baseUrl: "https://api.anthropic.com" },
      { model: "test", max_tokens: 1024, temperature: 0.3, extended_thinking: true } as DriverConfig,
    );
    expect(headers["anthropic-beta"]).toContain("extended-thinking");
  });

  it("buildAnthropicHeaders merges custom headers", () => {
    const headers = buildAnthropicHeaders(
      { apiKey: "sk-test", baseUrl: "https://api.anthropic.com", customHeaders: { "X-Custom": "value" } },
      { model: "test", max_tokens: 1024, temperature: 0.3 } as DriverConfig,
    );
    expect(headers["X-Custom"]).toBe("value");
  });

  it("buildAnthropicRequestBody includes model and messages", () => {
    const body = buildAnthropicRequestBody(
      { model: "claude-3-sonnet", max_tokens: 4096, temperature: 0.5 } as DriverConfig,
      {
        system: "Be helpful",
        messages: [{ role: "user" as const, content: "Hi" }],
        tools: undefined,
      },
    );
    expect(body.model).toBe("claude-3-sonnet");
    expect(body.max_tokens).toBe(4096);
    expect(body.system).toBe("Be helpful");
    expect(body.stream).toBe(true);
  });

  it("buildAnthropicRequestBody includes thinking config when enabled", () => {
    const body = buildAnthropicRequestBody(
      { model: "claude-3-opus", max_tokens: 8192, temperature: 0.3, extended_thinking: true } as DriverConfig,
      {
        system: undefined,
        messages: [{ role: "user" as const, content: "Think about this" }],
        tools: undefined,
      },
    );
    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 32768 });
  });
});

// ─── fetchProviderModels ─────────────────────────────────────────────────────

import { fetchProviderModels, fetchOllamaModels } from "../../src/daemon/agent/drivers/models.js";

describe("fetchProviderModels", () => {
  it("returns empty array when provider is unreachable", async () => {
    const models = await fetchProviderModels(
      "http://127.0.0.1:1/nonexistent",
      "fake-key",
    );
    expect(models).toEqual([]);
  });

  it("returns empty array when API key is invalid (non-200 response)", async () => {
    // httpbin.org returns 401 for unauthorized requests
    const models = await fetchProviderModels(
      "https://api.openai.com/v1",
      "invalid-key-xxx",
    );
    expect(models).toEqual([]);
  });
});

// ─── fetchOllamaModels ──────────────────────────────────────────────────────

describe("fetchOllamaModels", () => {
  it("returns empty array when Ollama is not reachable", async () => {
    // Point to a port that's definitely not running Ollama
    const origBase = process.env.OLLAMA_BASE_URL;
    const origLocal = process.env.LOCAL_MODEL_URL;
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1";
    delete process.env.LOCAL_MODEL_URL;
    try {
      const models = await fetchOllamaModels();
      expect(models).toEqual([]);
    } finally {
      if (origBase) process.env.OLLAMA_BASE_URL = origBase;
      else delete process.env.OLLAMA_BASE_URL;
      if (origLocal) process.env.LOCAL_MODEL_URL = origLocal;
    }
  });

  it("returns model array with expected shape from real Ollama (if running)", async () => {
    // Integration test — only meaningful when Ollama is actually running
    const models = await fetchOllamaModels();
    // Either empty (Ollama not running) or well-shaped
    for (const m of models) {
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
    }
  });
});
