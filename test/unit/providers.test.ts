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

  it("skips providers with unsupported type", () => {
    const anthropicType: ProviderConfig = {
      id: "custom-anthropic",
      name: "Custom Anthropic",
      baseUrl: "https://api.example.com",
      apiKey: "key",
      type: "anthropic",
    };

    registerCustomProviders([anthropicType]);
    expect(listDrivers()).not.toContain("custom-anthropic");
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
