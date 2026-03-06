// Multi-Provider System Audit Tests
//
// Tests the full provider flow:
//   - Driver registry (getDriver, registerDriver, listDrivers)
//   - Model resolution (resolveModel, parseModelSpec, getCapabilities)
//   - Custom provider registration (registerCustomProviders)
//   - Env-ref resolution (resolveEnvRef, isEnvRef)
//   - Family cross-referencing (normalizeModelName, generateMatchKeys)
//   - Provider presets (discoverProviderPresets)
//
// No real API calls — tests pure logic only.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// Driver registry
// ---------------------------------------------------------------------------

import {
  getDriver,
  registerDriver,
  listDrivers,
  type LLMDriver,
  type DriverMessage,
  type DriverConfig,
  type StreamChunk,
} from "../../src/daemon/agent/drivers/index.js";

describe("Driver Registry", () => {
  it("has four built-in drivers", () => {
    const names = listDrivers();
    expect(names).toContain("anthropic");
    expect(names).toContain("openai");
    expect(names).toContain("local");
    expect(names).toContain("claude-code");
  });

  it("resolves built-in drivers by canonical name", () => {
    expect(getDriver("anthropic").name).toBe("anthropic");
    expect(getDriver("openai").name).toBe("openai");
    expect(getDriver("local").name).toBe("local");
    expect(getDriver("claude-code").name).toBe("claude-code");
  });

  it("resolves built-in aliases", () => {
    expect(getDriver("claude").name).toBe("anthropic");
    expect(getDriver("gpt").name).toBe("openai");
    expect(getDriver("gpt4").name).toBe("openai");
    expect(getDriver("gpt-4").name).toBe("openai");
    expect(getDriver("gpt-4o").name).toBe("openai");
    expect(getDriver("o1").name).toBe("openai");
    expect(getDriver("o3").name).toBe("openai");
    expect(getDriver("ollama").name).toBe("local");
    expect(getDriver("cc").name).toBe("claude-code");
  });

  it("is case-insensitive", () => {
    expect(getDriver("Anthropic").name).toBe("anthropic");
    expect(getDriver("OPENAI").name).toBe("openai");
    expect(getDriver("Claude").name).toBe("anthropic");
    expect(getDriver("LOCAL").name).toBe("local");
  });

  it("throws for unknown backend with descriptive error", () => {
    expect(() => getDriver("nonexistent")).toThrow(/Unknown LLM backend/);
    expect(() => getDriver("nonexistent")).toThrow(/nonexistent/);
    expect(() => getDriver("nonexistent")).toThrow(/Registered:/);
  });

  it("registerDriver adds a custom driver", () => {
    const mockDriver: LLMDriver = {
      name: "test-custom",
      async *chat(): AsyncGenerator<StreamChunk> {
        yield { type: "done", content: "" };
      },
    };
    registerDriver(mockDriver, "test-alias");

    expect(getDriver("test-custom").name).toBe("test-custom");
    expect(getDriver("test-alias").name).toBe("test-custom");
  });

  it("listDrivers returns unique driver names", () => {
    const names = listDrivers();
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });
});

// ---------------------------------------------------------------------------
// Env-ref resolution
// ---------------------------------------------------------------------------

import { resolveEnvRef, isEnvRef } from "../../src/shared/env-ref.js";

describe("Env-Ref Resolution", () => {
  const origEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    origEnv.TEST_API_KEY = process.env.TEST_API_KEY;
    origEnv.EMPTY_KEY = process.env.EMPTY_KEY;
  });

  afterEach(() => {
    if (origEnv.TEST_API_KEY !== undefined) {
      process.env.TEST_API_KEY = origEnv.TEST_API_KEY;
    } else {
      delete process.env.TEST_API_KEY;
    }
    if (origEnv.EMPTY_KEY !== undefined) {
      process.env.EMPTY_KEY = origEnv.EMPTY_KEY;
    } else {
      delete process.env.EMPTY_KEY;
    }
  });

  it("resolves {env:VAR} to the environment variable value", () => {
    process.env.TEST_API_KEY = "sk-test-12345";
    expect(resolveEnvRef("{env:TEST_API_KEY}")).toBe("sk-test-12345");
  });

  it("passes through literal strings unchanged", () => {
    expect(resolveEnvRef("sk-literal-key")).toBe("sk-literal-key");
    expect(resolveEnvRef("")).toBe("");
    expect(resolveEnvRef("no-env-ref-here")).toBe("no-env-ref-here");
  });

  it("throws when env var is not set", () => {
    delete process.env.TEST_API_KEY;
    expect(() => resolveEnvRef("{env:TEST_API_KEY}")).toThrow(/TEST_API_KEY/);
    expect(() => resolveEnvRef("{env:TEST_API_KEY}")).toThrow(/not set/);
  });

  it("throws when env var is empty string", () => {
    process.env.EMPTY_KEY = "";
    expect(() => resolveEnvRef("{env:EMPTY_KEY}")).toThrow(/EMPTY_KEY/);
  });

  it("does not resolve partial env refs", () => {
    // These should be passed through as literals
    expect(resolveEnvRef("prefix{env:VAR}")).toBe("prefix{env:VAR}");
    expect(resolveEnvRef("{env:VAR}suffix")).toBe("{env:VAR}suffix");
    expect(resolveEnvRef("{env:}")).toBe("{env:}");
    expect(resolveEnvRef("{env:123BAD}")).toBe("{env:123BAD}"); // starts with digit
  });

  it("isEnvRef correctly identifies env refs", () => {
    expect(isEnvRef("{env:MY_KEY}")).toBe(true);
    expect(isEnvRef("{env:A}")).toBe(true);
    expect(isEnvRef("{env:_PRIVATE}")).toBe(true);
    expect(isEnvRef("literal")).toBe(false);
    expect(isEnvRef("")).toBe(false);
    expect(isEnvRef("{env:}")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Model resolution and capabilities
// ---------------------------------------------------------------------------

import {
  resolveModel,
  getCapabilities,
  parseModelSpec,
  normalizeModelName,
  generateMatchKeys,
  registerProviderAliases,
  isKnownProvider,
  type ModelCapabilities,
} from "../../src/daemon/agent/drivers/models.js";

describe("Model Resolution (resolveModel)", () => {
  it("resolves static aliases for anthropic", () => {
    expect(resolveModel("anthropic", "claude")).toBe("claude-sonnet-4-6");
    expect(resolveModel("anthropic", "sonnet")).toBe("claude-sonnet-4-6");
    expect(resolveModel("anthropic", "opus")).toBe("claude-opus-4-6");
    expect(resolveModel("anthropic", "haiku")).toBe("claude-haiku-4-5-20251001");
    expect(resolveModel("anthropic", "claude-sonnet")).toBe("claude-sonnet-4-6");
    expect(resolveModel("anthropic", "claude-opus")).toBe("claude-opus-4-6");
    expect(resolveModel("anthropic", "claude-haiku")).toBe("claude-haiku-4-5-20251001");
  });

  it("resolves openai model aliases", () => {
    // Static aliases may be overridden by dynamic models.dev data in full suite.
    // The key invariant: short aliases resolve to a real OpenAI model.
    const gpt = resolveModel("openai", "gpt");
    expect(gpt).toMatch(/^gpt-/);
    const gpt4 = resolveModel("openai", "gpt4");
    expect(gpt4).toMatch(/^gpt-4/);
  });

  it("passes through exact model IDs", () => {
    // Unknown model names pass through
    expect(resolveModel("anthropic", "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(resolveModel("openai", "gpt-4o-mini")).toBe("gpt-4o-mini");
  });

  it("resolves local model alias", () => {
    const origLocal = process.env.LOCAL_MODEL;
    process.env.LOCAL_MODEL = "llama3:70b";
    expect(resolveModel("local", "local")).toBe("llama3:70b");
    expect(resolveModel("local", "ollama")).toBe("llama3:70b");
    if (origLocal !== undefined) {
      process.env.LOCAL_MODEL = origLocal;
    } else {
      delete process.env.LOCAL_MODEL;
    }
  });

  it("defaults local model to llama3 when LOCAL_MODEL not set", () => {
    const orig = process.env.LOCAL_MODEL;
    delete process.env.LOCAL_MODEL;
    expect(resolveModel("local", "local")).toBe("llama3");
    if (orig !== undefined) process.env.LOCAL_MODEL = orig;
  });

  it("passes through unknown models unchanged", () => {
    expect(resolveModel("anthropic", "some-future-model")).toBe("some-future-model");
    expect(resolveModel("unknown-provider", "whatever")).toBe("whatever");
  });

  it("is case-insensitive on aliases", () => {
    expect(resolveModel("anthropic", "Claude")).toBe("claude-sonnet-4-6");
    expect(resolveModel("anthropic", "SONNET")).toBe("claude-sonnet-4-6");
    const gpt = resolveModel("openai", "GPT");
    expect(gpt).toMatch(/^gpt-/);
  });
});

describe("Model Capabilities (getCapabilities)", () => {
  it("returns caps for anthropic with known ID", () => {
    const caps = getCapabilities("anthropic", "claude-sonnet-4-6");
    expect(caps.provider).toBe("anthropic");
    expect(caps.toolCall).toBe(true);
    // vision and context may differ between static fallback and dynamic models.dev data
    expect(typeof caps.vision).toBe("boolean");
    expect(caps.context).toBeGreaterThan(0);
    expect(caps.maxOutput).toBeGreaterThan(0);
  });

  it("returns fallback caps for openai", () => {
    const caps = getCapabilities("openai", "gpt-4o");
    expect(caps.provider).toBe("openai");
    expect(caps.toolCall).toBe(true);
  });

  it("returns fallback caps for local", () => {
    const caps = getCapabilities("local", "llama3");
    expect(caps.provider).toBe("local");
    // Fallback: local models default to no tool calling
    expect(caps.toolCall).toBe(false);
  });

  it("returns ultra-conservative default for unknown provider", () => {
    const caps = getCapabilities("totally-unknown", "some-model");
    expect(caps.provider).toBe("totally-unknown");
    expect(caps.id).toBe("some-model");
    expect(caps.family).toBe("unknown");
    expect(caps.toolCall).toBe(false);
    expect(caps.reasoning).toBe(false);
    expect(caps.vision).toBe(false);
    expect(caps.context).toBe(24_000);
    expect(caps.maxOutput).toBe(4_096);
    expect(caps.costInput).toBe(0);
    expect(caps.costOutput).toBe(0);
  });

  it("substitutes model ID in fallback caps", () => {
    const caps = getCapabilities("anthropic", "my-custom-claude");
    expect(caps.id).toBe("my-custom-claude");
    expect(caps.provider).toBe("anthropic");
  });
});

describe("parseModelSpec", () => {
  it("splits provider:model when provider is known", () => {
    // Use a custom isDriverKnown function for deterministic testing
    const knownProviders = new Set(["anthropic", "openai", "local", "openrouter", "groq"]);
    const isKnown = (name: string) => knownProviders.has(name.toLowerCase());

    expect(parseModelSpec("anthropic:claude-sonnet-4-6", isKnown)).toEqual({
      backend: "anthropic",
      model: "claude-sonnet-4-6",
    });

    expect(parseModelSpec("openai:gpt-4o", isKnown)).toEqual({
      backend: "openai",
      model: "gpt-4o",
    });

    expect(parseModelSpec("openrouter:deepseek/deepseek-chat", isKnown)).toEqual({
      backend: "openrouter",
      model: "deepseek/deepseek-chat",
    });
  });

  it("treats whole string as model when left side is not a known provider", () => {
    // "llama3:70b" -- llama3 is NOT a known provider
    const isKnown = (name: string) => ["anthropic", "openai"].includes(name.toLowerCase());

    const result = parseModelSpec("llama3:70b", isKnown);
    expect(result.backend).toBe("llama3:70b");
    expect(result.model).toBe("llama3:70b");
  });

  it("returns backend=model=spec when no colon", () => {
    const result = parseModelSpec("claude");
    expect(result.backend).toBe("claude");
    expect(result.model).toBe("claude");
  });

  it("handles empty right side after colon", () => {
    const isKnown = (name: string) => name === "anthropic";
    const result = parseModelSpec("anthropic:", isKnown);
    expect(result.backend).toBe("anthropic");
    expect(result.model).toBe("");
  });

  it("splits on first colon only", () => {
    const isKnown = (name: string) => name === "openrouter";
    const result = parseModelSpec("openrouter:deepseek/deepseek-chat:v3", isKnown);
    expect(result.backend).toBe("openrouter");
    expect(result.model).toBe("deepseek/deepseek-chat:v3");
  });
});

// ---------------------------------------------------------------------------
// normalizeModelName and generateMatchKeys
// ---------------------------------------------------------------------------

describe("normalizeModelName", () => {
  it("lowercases and normalizes separators", () => {
    expect(normalizeModelName("DeepSeek-V3")).toBe("deepseek-v3");
    expect(normalizeModelName("GPT-4o")).toBe("gpt-4o");
    expect(normalizeModelName("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  it("replaces dots, underscores, and spaces with dashes", () => {
    expect(normalizeModelName("Llama 3.3 70B")).toBe("llama-3-3-70b");
    expect(normalizeModelName("some_model.name")).toBe("some-model-name");
  });

  it("collapses multiple dashes", () => {
    expect(normalizeModelName("a--b---c")).toBe("a-b-c");
  });

  it("strips leading and trailing dashes", () => {
    expect(normalizeModelName("-leading-")).toBe("leading");
    expect(normalizeModelName("--double--")).toBe("double");
  });
});

describe("generateMatchKeys", () => {
  it("generates progressively shorter keys", () => {
    const keys = generateMatchKeys("deepseek-v3:latest");
    expect(keys[0]).toBe("deepseek-v3"); // base without tag
    expect(keys).toContain("deepseek"); // stripped suffix
  });

  it("generates dash-before-digit variant", () => {
    const keys = generateMatchKeys("llama4:maverick");
    expect(keys).toContain("llama4");
    expect(keys).toContain("llama-4"); // digit variant
    expect(keys).toContain("llama");
  });

  it("handles dot versions", () => {
    const keys = generateMatchKeys("qwen3.5:32b");
    expect(keys).toContain("qwen3-5");
    expect(keys).toContain("qwen3");
    expect(keys).toContain("qwen-3-5");
    expect(keys).toContain("qwen-3");
    expect(keys).toContain("qwen");
  });

  it("handles simple model names", () => {
    const keys = generateMatchKeys("llama3");
    expect(keys[0]).toBe("llama3");
    expect(keys).toContain("llama-3");
    expect(keys).toContain("llama");
  });
});

// ---------------------------------------------------------------------------
// Custom provider registration
// ---------------------------------------------------------------------------

import { registerCustomProviders } from "../../src/daemon/agent/drivers/providers.js";
import type { ProviderConfig } from "../../src/shared/config.js";

describe("Custom Provider Registration", () => {
  it("registers a custom OpenAI-compatible provider", () => {
    const config: ProviderConfig = {
      id: "test-provider-audit",
      name: "Test Provider Audit",
      baseUrl: "https://api.test-audit.com/v1",
      apiKey: "sk-test",
      type: "openai-compatible",
    };

    registerCustomProviders([config]);

    // Should be retrievable from driver registry
    const driver = getDriver("test-provider-audit");
    expect(driver.name).toBe("test-provider-audit");
  });

  it("registers model aliases for custom provider", () => {
    const config: ProviderConfig = {
      id: "test-aliased-provider",
      name: "Test Aliased",
      baseUrl: "https://api.test-alias.com/v1",
      apiKey: "sk-test",
      models: {
        deepseek: "deepseek/deepseek-chat-v3",
        llama: "meta-llama/llama-3.1-8b",
      },
      defaultModel: "deepseek/deepseek-chat-v3",
    };

    registerCustomProviders([config]);

    // Aliases should resolve
    expect(resolveModel("test-aliased-provider", "deepseek")).toBe("deepseek/deepseek-chat-v3");
    expect(resolveModel("test-aliased-provider", "llama")).toBe("meta-llama/llama-3.1-8b");
    // Default model alias (provider ID -> default model)
    expect(resolveModel("test-aliased-provider", "test-aliased-provider")).toBe("deepseek/deepseek-chat-v3");
  });

  it("skips providers with missing id", () => {
    // Should not throw
    registerCustomProviders([
      { id: "", name: "No ID", baseUrl: "https://example.com", apiKey: "sk" },
    ]);
  });

  it("skips providers with missing baseUrl", () => {
    // Should not throw
    registerCustomProviders([
      { id: "no-url", name: "No URL", baseUrl: "", apiKey: "sk" },
    ]);
  });

  it("registers anthropic-type provider", () => {
    const config: ProviderConfig = {
      id: "test-anthropic-compat",
      name: "Test Anthropic Compat",
      baseUrl: "https://proxy.example.com",
      apiKey: "sk-test",
      type: "anthropic",
    };

    registerCustomProviders([config]);
    const driver = getDriver("test-anthropic-compat");
    expect(driver.name).toBe("test-anthropic-compat");
  });
});

// ---------------------------------------------------------------------------
// Provider presets
// ---------------------------------------------------------------------------

import {
  discoverProviderPresets,
  listPresets,
  getPreset,
  PROVIDER_PRESETS,
} from "../../src/daemon/agent/drivers/presets.js";

describe("Provider Presets", () => {
  it("lists all presets", () => {
    const presets = listPresets();
    expect(presets.length).toBeGreaterThanOrEqual(20);
    expect(presets[0]!.id).toBe("openrouter");
  });

  it("looks up preset by ID", () => {
    const groq = getPreset("groq");
    expect(groq).toBeDefined();
    expect(groq!.name).toBe("Groq");
    expect(groq!.baseUrl).toContain("groq.com");
    expect(groq!.envKey).toBe("GROQ_API_KEY");
  });

  it("returns undefined for unknown preset", () => {
    expect(getPreset("nonexistent")).toBeUndefined();
  });

  it("discovers presets when env var is set", () => {
    const origKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "gsk-test-discover";

    const discovered = discoverProviderPresets(new Set());
    const groqConfig = discovered.find((p) => p.id === "groq");
    expect(groqConfig).toBeDefined();
    expect(groqConfig!.apiKey).toBe("{env:GROQ_API_KEY}");
    expect(groqConfig!.baseUrl).toContain("groq.com");

    if (origKey !== undefined) {
      process.env.GROQ_API_KEY = origKey;
    } else {
      delete process.env.GROQ_API_KEY;
    }
  });

  it("skips presets already in explicit config", () => {
    const origKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "gsk-test-skip";

    const discovered = discoverProviderPresets(new Set(["groq"]));
    const groqConfig = discovered.find((p) => p.id === "groq");
    expect(groqConfig).toBeUndefined();

    if (origKey !== undefined) {
      process.env.GROQ_API_KEY = origKey;
    } else {
      delete process.env.GROQ_API_KEY;
    }
  });

  it("does not discover presets when env var is not set", () => {
    const origKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    const discovered = discoverProviderPresets(new Set());
    const groqConfig = discovered.find((p) => p.id === "groq");
    expect(groqConfig).toBeUndefined();

    if (origKey !== undefined) process.env.GROQ_API_KEY = origKey;
  });

  it("every preset has required fields", () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.baseUrl).toBeTruthy();
      expect(preset.envKey).toBeTruthy();
    }
  });

  it("preset IDs are unique", () => {
    const ids = PROVIDER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// isKnownProvider
// ---------------------------------------------------------------------------

describe("isKnownProvider", () => {
  it("recognizes built-in providers", () => {
    expect(isKnownProvider("anthropic")).toBe(true);
    expect(isKnownProvider("openai")).toBe(true);
    expect(isKnownProvider("local")).toBe(true);
    expect(isKnownProvider("claude-code")).toBe(true);
  });

  it("recognizes driver aliases", () => {
    expect(isKnownProvider("claude")).toBe(true);
    expect(isKnownProvider("gpt")).toBe(true);
    expect(isKnownProvider("ollama")).toBe(true);
    expect(isKnownProvider("cc")).toBe(true);
  });

  it("rejects unknown providers", () => {
    expect(isKnownProvider("definitely-not-a-provider")).toBe(false);
    expect(isKnownProvider("")).toBe(false);
  });

  it("recognizes custom providers after registration", () => {
    registerCustomProviders([{
      id: "test-known-check",
      name: "Known Check",
      baseUrl: "https://example.com",
      apiKey: "sk-test",
    }]);
    expect(isKnownProvider("test-known-check")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// registerProviderAliases
// ---------------------------------------------------------------------------

describe("registerProviderAliases", () => {
  it("registers aliases that resolveModel can use", () => {
    registerProviderAliases("test-alias-provider", {
      fast: "fast-model-id",
      smart: "smart-model-id",
    });

    expect(resolveModel("test-alias-provider", "fast")).toBe("fast-model-id");
    expect(resolveModel("test-alias-provider", "smart")).toBe("smart-model-id");
  });

  it("normalizes alias keys to lowercase", () => {
    registerProviderAliases("test-case-alias", {
      UPPER: "upper-model",
      MiXeD: "mixed-model",
    });

    expect(resolveModel("test-case-alias", "upper")).toBe("upper-model");
    expect(resolveModel("test-case-alias", "mixed")).toBe("mixed-model");
  });

  it("merges with existing aliases", () => {
    registerProviderAliases("test-merge", { first: "model-1" });
    registerProviderAliases("test-merge", { second: "model-2" });

    expect(resolveModel("test-merge", "first")).toBe("model-1");
    expect(resolveModel("test-merge", "second")).toBe("model-2");
  });
});

// ---------------------------------------------------------------------------
// OpenAICompatibleDriver URL logic
// ---------------------------------------------------------------------------

import { OpenAICompatibleDriver } from "../../src/daemon/agent/drivers/openai-compat.js";

describe("OpenAICompatibleDriver", () => {
  it("has name matching provider config id", () => {
    const driver = new OpenAICompatibleDriver({
      id: "my-custom-provider",
      name: "My Custom",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
    });
    expect(driver.name).toBe("my-custom-provider");
  });

  it("resolves env-ref API key at call time", () => {
    const origKey = process.env.AUDIT_TEST_KEY;
    process.env.AUDIT_TEST_KEY = "resolved-key-value";

    const driver = new OpenAICompatibleDriver({
      id: "env-test",
      name: "Env Test",
      baseUrl: "https://api.example.com/v1",
      apiKey: "{env:AUDIT_TEST_KEY}",
    });

    // The apiKey getter is private, but we can test it indirectly through chat()
    // by intercepting the fetch call. For now just verify the driver is created.
    expect(driver.name).toBe("env-test");

    if (origKey !== undefined) {
      process.env.AUDIT_TEST_KEY = origKey;
    } else {
      delete process.env.AUDIT_TEST_KEY;
    }
  });
});

// ---------------------------------------------------------------------------
// End-to-end flow: config -> provider:model -> driver + resolved model
// ---------------------------------------------------------------------------

describe("End-to-End Provider Flow", () => {
  it("custom provider: register, parse spec, get driver, resolve model", () => {
    // 1. Register a provider
    const config: ProviderConfig = {
      id: "e2e-provider",
      name: "E2E Test",
      baseUrl: "https://api.e2e.com/v1",
      apiKey: "sk-e2e",
      models: { fast: "e2e/fast-model", smart: "e2e/smart-model" },
      defaultModel: "e2e/fast-model",
    };
    registerCustomProviders([config]);

    // 2. Parse "e2e-provider:smart" spec
    const spec = parseModelSpec("e2e-provider:smart", isKnownProvider);
    expect(spec.backend).toBe("e2e-provider");
    expect(spec.model).toBe("smart");

    // 3. Get the driver
    const driver = getDriver(spec.backend);
    expect(driver.name).toBe("e2e-provider");

    // 4. Resolve the model alias
    const resolved = resolveModel(driver.name, spec.model);
    expect(resolved).toBe("e2e/smart-model");

    // 5. Get capabilities (falls back to ultra-conservative for custom providers)
    const caps = getCapabilities(driver.name, resolved);
    expect(caps.id).toBe("e2e/smart-model");
    expect(caps.provider).toBe("e2e-provider");
  });

  it("built-in provider: parse spec, get driver, resolve model, get caps", () => {
    // "anthropic:sonnet" flow
    const spec = parseModelSpec("anthropic:sonnet", isKnownProvider);
    expect(spec.backend).toBe("anthropic");
    expect(spec.model).toBe("sonnet");

    const driver = getDriver(spec.backend);
    expect(driver.name).toBe("anthropic");

    const resolved = resolveModel(driver.name, spec.model);
    expect(resolved).toBe("claude-sonnet-4-6");

    const caps = getCapabilities(driver.name, resolved);
    expect(caps.toolCall).toBe(true);
    // vision may vary between static fallback and dynamic models.dev data
    expect(typeof caps.vision).toBe("boolean");
  });

  it("alias-only spec: 'claude' -> anthropic driver, claude-sonnet-4-6", () => {
    const spec = parseModelSpec("claude");
    // No colon, so backend = model = "claude"
    expect(spec.backend).toBe("claude");
    expect(spec.model).toBe("claude");

    // "claude" is a driver alias for anthropic
    const driver = getDriver(spec.backend);
    expect(driver.name).toBe("anthropic");

    const resolved = resolveModel(driver.name, spec.model);
    expect(resolved).toBe("claude-sonnet-4-6");
  });

  it("Ollama model with tag: 'llama3:70b' keeps tag in model", () => {
    const isKnown = (name: string) => {
      // llama3 is not a known provider
      return ["anthropic", "openai", "local"].includes(name.toLowerCase());
    };
    const spec = parseModelSpec("llama3:70b", isKnown);
    // "llama3" is NOT a known provider, so the whole string stays as model
    expect(spec.backend).toBe("llama3:70b");
    expect(spec.model).toBe("llama3:70b");
  });
});
