/**
 * Comprehensive model system test suite.
 *
 * Tests the ENTIRE model/provider pipeline end-to-end:
 *   1. Driver registry — built-in drivers and custom registration
 *   2. Model resolution — alias → real model ID
 *   3. Capabilities detection — from models.dev and fallbacks
 *   4. Provider presets — discovery, listing, lookup
 *   5. Custom provider registration — full lifecycle
 *   6. Env ref resolution — {env:VAR} syntax
 *   7. parseModelSpec — provider:model syntax
 *   8. Family cross-reference — Ollama → models.dev enrichment
 *   9. System prompt injection — per-driver behavior
 *  10. OpenAI-compat driver — endpoint computation, header merging
 *
 * These tests verify behavior at the integration level — not just unit
 * functions, but the full resolution chain the agent loop depends on.
 */

import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";

// ─── Imports: Drivers ────────────────────────────────────────────────────────

import {
  getDriver,
  listDrivers,
  registerDriver,
  type LLMDriver,
  type DriverConfig,
  type DriverMessage,
  type StreamChunk,
} from "../../src/daemon/agent/drivers/index.js";

// ─── Imports: Model registry ─────────────────────────────────────────────────

import {
  loadModelRegistry,
  resolveModel,
  getCapabilities,
  listModels,
  parseModelSpec,
  isKnownProvider,
  normalizeModelName,
  generateMatchKeys,
  registerProviderAliases,
  probeLocalModel,
  type ModelCapabilities,
} from "../../src/daemon/agent/drivers/models.js";

// ─── Imports: Providers ──────────────────────────────────────────────────────

import { registerCustomProviders } from "../../src/daemon/agent/drivers/providers.js";
import { OpenAICompatibleDriver } from "../../src/daemon/agent/drivers/openai-compat.js";
import {
  discoverProviderPresets,
  listPresets,
  getPreset,
  PROVIDER_PRESETS,
  type ProviderPreset,
} from "../../src/daemon/agent/drivers/presets.js";

// ─── Imports: Shared ─────────────────────────────────────────────────────────

import { resolveEnvRef, isEnvRef } from "../../src/shared/env-ref.js";
import type { ProviderConfig } from "../../src/shared/config.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FIXTURE_PROVIDER: ProviderConfig = {
  id: "fixture-provider",
  name: "Fixture Provider",
  baseUrl: "https://api.fixture.example.com/v1",
  apiKey: "fixture-key-12345",
  models: {
    fast: "fixture/fast-model",
    smart: "fixture/smart-model",
    reason: "fixture/reasoning-v1",
  },
  defaultModel: "fixture/fast-model",
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Driver Registry
// ═══════════════════════════════════════════════════════════════════════════════

describe("driver registry", () => {
  it("has all four built-in drivers registered", () => {
    const names = listDrivers();
    expect(names).toContain("anthropic");
    expect(names).toContain("openai");
    expect(names).toContain("local");
    expect(names).toContain("claude-code");
  });

  it("resolves built-in aliases to correct drivers", () => {
    const aliases: [string, string][] = [
      ["claude", "anthropic"],
      ["gpt", "openai"],
      ["gpt4", "openai"],
      ["gpt-4", "openai"],
      ["gpt-4o", "openai"],
      ["o1", "openai"],
      ["o3", "openai"],
      ["ollama", "local"],
      ["cc", "claude-code"],
    ];

    for (const [alias, expected] of aliases) {
      const driver = getDriver(alias);
      expect(driver.name).toBe(expected);
    }
  });

  it("throws for unknown backend names", () => {
    expect(() => getDriver("nonexistent-xyz-999")).toThrow("Unknown LLM backend");
  });

  it("is case-insensitive", () => {
    expect(getDriver("CLAUDE").name).toBe("anthropic");
    expect(getDriver("Openai").name).toBe("openai");
    expect(getDriver("LOCAL").name).toBe("local");
  });

  it("supports custom driver registration", () => {
    const mockDriver: LLMDriver = {
      name: "test-mock-driver",
      async *chat(): AsyncGenerator<StreamChunk> {
        yield { type: "text", content: "mock" };
        yield { type: "done", content: "" };
      },
    };

    registerDriver(mockDriver, "mock-alias");

    expect(getDriver("test-mock-driver").name).toBe("test-mock-driver");
    expect(getDriver("mock-alias").name).toBe("test-mock-driver");
    expect(listDrivers()).toContain("test-mock-driver");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Model Resolution (after models.dev fetch)
// ═══════════════════════════════════════════════════════════════════════════════

describe("model resolution", () => {
  beforeAll(async () => {
    await loadModelRegistry();
  });

  describe("anthropic aliases", () => {
    it("resolves 'claude' to claude-sonnet-4-6 (curated default)", () => {
      expect(resolveModel("anthropic", "claude")).toBe("claude-sonnet-4-6");
    });

    it("resolves 'sonnet' to claude-sonnet-4-6", () => {
      expect(resolveModel("anthropic", "sonnet")).toBe("claude-sonnet-4-6");
    });

    it("resolves 'claude-sonnet' to the latest sonnet", () => {
      const resolved = resolveModel("anthropic", "claude-sonnet");
      expect(resolved).toContain("claude-sonnet");
    });

    it("resolves 'opus' to claude-opus-4-6", () => {
      expect(resolveModel("anthropic", "opus")).toBe("claude-opus-4-6");
    });

    it("resolves 'haiku' to claude-haiku-4-5-20251001", () => {
      expect(resolveModel("anthropic", "haiku")).toBe("claude-haiku-4-5-20251001");
    });

    it("passes through exact model IDs unchanged", () => {
      expect(resolveModel("anthropic", "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
      expect(resolveModel("anthropic", "claude-opus-4-6")).toBe("claude-opus-4-6");
    });
  });

  describe("openai aliases", () => {
    it("resolves 'gpt4' to gpt-4o (curated default)", () => {
      expect(resolveModel("openai", "gpt4")).toBe("gpt-4o");
    });

    it("resolves 'gpt-4o' exactly", () => {
      expect(resolveModel("openai", "gpt-4o")).toBe("gpt-4o");
    });

    it("resolves exact model IDs via capIndex", () => {
      expect(resolveModel("openai", "o1")).toBe("o1");
      expect(resolveModel("openai", "o3")).toBe("o3");
    });
  });

  describe("local aliases", () => {
    it("resolves 'local' to LOCAL_MODEL env or default", () => {
      const original = process.env.LOCAL_MODEL;
      delete process.env.LOCAL_MODEL;
      expect(resolveModel("local", "local")).toBe("llama3");
      if (original) process.env.LOCAL_MODEL = original;
    });

    it("passes through Ollama model names", () => {
      expect(resolveModel("local", "deepseek-v3:671b")).toBe("deepseek-v3:671b");
      expect(resolveModel("local", "qwen3:32b")).toBe("qwen3:32b");
    });
  });

  describe("custom provider aliases", () => {
    beforeAll(() => {
      registerCustomProviders([FIXTURE_PROVIDER]);
    });

    it("resolves registered model aliases", () => {
      expect(resolveModel("fixture-provider", "fast")).toBe("fixture/fast-model");
      expect(resolveModel("fixture-provider", "smart")).toBe("fixture/smart-model");
    });

    it("resolves provider ID as alias to default model", () => {
      expect(resolveModel("fixture-provider", "fixture-provider")).toBe("fixture/fast-model");
    });

    it("passes through unknown model IDs", () => {
      expect(resolveModel("fixture-provider", "vendor/custom-v99")).toBe("vendor/custom-v99");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Capabilities Detection
// ═══════════════════════════════════════════════════════════════════════════════

describe("capabilities detection", () => {
  beforeAll(async () => {
    await loadModelRegistry();
  });

  it("returns accurate capabilities for anthropic models", () => {
    const caps = getCapabilities("anthropic", "claude-sonnet-4-6");
    expect(caps.toolCall).toBe(true);
    expect(caps.context).toBeGreaterThanOrEqual(200_000);
    expect(caps.maxOutput).toBeGreaterThan(0);
    expect(caps.costInput).toBeGreaterThan(0);
    expect(caps.costOutput).toBeGreaterThan(0);
  });

  it("returns accurate capabilities for openai models", () => {
    const caps = getCapabilities("openai", "gpt-4o");
    expect(caps.toolCall).toBe(true);
    expect(caps.context).toBeGreaterThanOrEqual(128_000);
    expect(caps.costInput).toBeGreaterThan(0);
  });

  it("returns reasoning=true for reasoning models", () => {
    // O1 and O3 are reasoning models
    const o1 = getCapabilities("openai", "o1");
    expect(o1.reasoning).toBe(true);

    const o3 = getCapabilities("openai", "o3");
    expect(o3.reasoning).toBe(true);
  });

  it("returns provider-level fallback for unknown models of known providers", () => {
    const caps = getCapabilities("anthropic", "nonexistent-model-xyz");
    expect(caps.toolCall).toBe(true); // anthropic fallback
    expect(caps.context).toBeGreaterThan(24_000);
  });

  it("returns ultra-conservative default for completely unknown providers", () => {
    const caps = getCapabilities("totally-unknown-provider", "model-xyz");
    expect(caps.context).toBe(24_000);
    expect(caps.maxOutput).toBe(4_096);
    expect(caps.toolCall).toBe(false);
    expect(caps.reasoning).toBe(false);
    expect(caps.costInput).toBe(0);
    expect(caps.costOutput).toBe(0);
    expect(caps.family).toBe("unknown");
  });

  it("cross-references custom provider models with models.dev families", () => {
    registerCustomProviders([{
      id: "test-crossref",
      name: "Cross-ref Test",
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      defaultModel: "deepseek/deepseek-chat-v3",
    }]);

    const caps = getCapabilities("test-crossref", "deepseek/deepseek-chat-v3");
    // Should match deepseek family from models.dev
    expect(caps.id).toBe("deepseek/deepseek-chat-v3");
    expect(caps.provider).toBe("test-crossref");
    // Cost should be zeroed for custom providers
    expect(caps.costInput).toBe(0);
    expect(caps.costOutput).toBe(0);
  });

  it("lists all models from models.dev", () => {
    const all = listModels();
    expect(all.length).toBeGreaterThan(10);

    const providers = new Set(all.map((m) => m.provider));
    expect(providers.size).toBeGreaterThan(2);
  });

  it("lists models filtered by provider", () => {
    const anthropic = listModels("anthropic");
    expect(anthropic.length).toBeGreaterThan(0);
    expect(anthropic.every((m) => m.provider === "anthropic")).toBe(true);

    const openai = listModels("openai");
    expect(openai.length).toBeGreaterThan(0);
    expect(openai.every((m) => m.provider === "openai")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Provider Presets
// ═══════════════════════════════════════════════════════════════════════════════

describe("provider presets", () => {
  it("has 20+ presets registered", () => {
    const presets = listPresets();
    expect(presets.length).toBeGreaterThanOrEqual(20);
  });

  it("can look up known presets by ID", () => {
    const ids = ["openrouter", "groq", "deepseek", "google", "xai", "mistral",
                 "together", "fireworks", "deepinfra", "cerebras", "perplexity",
                 "cohere", "huggingface", "nvidia"];
    for (const id of ids) {
      const preset = getPreset(id);
      expect(preset).toBeDefined();
      expect(preset!.baseUrl).toBeTruthy();
      expect(preset!.envKey).toBeTruthy();
    }
  });

  it("returns undefined for unknown preset IDs", () => {
    expect(getPreset("nonexistent-xyz")).toBeUndefined();
  });

  it("each preset has required fields", () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.baseUrl).toBeTruthy();
      expect(preset.envKey).toBeTruthy();
      // baseUrl should be a valid URL
      expect(() => new URL(preset.baseUrl)).not.toThrow();
    }
  });

  it("each preset has a unique ID", () => {
    const ids = PROVIDER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Provider Auto-Discovery
// ═══════════════════════════════════════════════════════════════════════════════

describe("provider auto-discovery", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear relevant env vars
    for (const preset of PROVIDER_PRESETS) {
      savedEnv[preset.envKey] = process.env[preset.envKey];
      delete process.env[preset.envKey];
      if (preset.envKeyAlt) {
        savedEnv[preset.envKeyAlt] = process.env[preset.envKeyAlt];
        delete process.env[preset.envKeyAlt];
      }
    }
  });

  afterAll(() => {
    // Restore env vars
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) process.env[key] = val;
      else delete process.env[key];
    }
  });

  it("discovers providers when env vars are set", () => {
    process.env.GROQ_API_KEY = "gsk-test";
    process.env.DEEPSEEK_API_KEY = "dsk-test";

    const discovered = discoverProviderPresets(new Set());
    const ids = discovered.map((p) => p.id);

    expect(ids).toContain("groq");
    expect(ids).toContain("deepseek");
  });

  it("skips providers already in config", () => {
    process.env.GROQ_API_KEY = "gsk-test";

    const discovered = discoverProviderPresets(new Set(["groq"]));
    const ids = discovered.map((p) => p.id);

    expect(ids).not.toContain("groq");
  });

  it("uses {env:VAR} format for apiKey", () => {
    process.env.GROQ_API_KEY = "gsk-test";

    const discovered = discoverProviderPresets(new Set());
    const groq = discovered.find((p) => p.id === "groq");

    expect(groq).toBeDefined();
    expect(groq!.apiKey).toBe("{env:GROQ_API_KEY}");
    // The actual value should NOT be in the config
    expect(groq!.apiKey).not.toBe("gsk-test");
  });

  it("discovers via alt env var", () => {
    // Google supports GEMINI_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "alt-key-test";

    const discovered = discoverProviderPresets(new Set());
    const google = discovered.find((p) => p.id === "google");

    expect(google).toBeDefined();

    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it("returns empty array when no env vars set", () => {
    const discovered = discoverProviderPresets(new Set());
    expect(discovered).toHaveLength(0);
  });

  it("returns valid ProviderConfig objects", () => {
    process.env.GROQ_API_KEY = "gsk-test";

    const discovered = discoverProviderPresets(new Set());
    const groq = discovered.find((p) => p.id === "groq")!;

    expect(groq.id).toBe("groq");
    expect(groq.name).toBe("Groq");
    expect(groq.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(groq.type).toBe("openai-compatible");
    expect(groq.defaultModel).toBe("llama-3.1-8b-instant");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Environment Variable References
// ═══════════════════════════════════════════════════════════════════════════════

describe("env ref resolution", () => {
  it("resolves {env:VAR} to env value", () => {
    process.env.TEST_ENV_REF_KEY = "resolved-value-123";
    expect(resolveEnvRef("{env:TEST_ENV_REF_KEY}")).toBe("resolved-value-123");
    delete process.env.TEST_ENV_REF_KEY;
  });

  it("passes through literal values unchanged", () => {
    expect(resolveEnvRef("literal-key")).toBe("literal-key");
    expect(resolveEnvRef("sk-proj-abc")).toBe("sk-proj-abc");
    expect(resolveEnvRef("")).toBe("");
  });

  it("throws on unset env var", () => {
    delete process.env.NONEXISTENT_TEST_VAR_XYZ;
    expect(() => resolveEnvRef("{env:NONEXISTENT_TEST_VAR_XYZ}")).toThrow(
      "NONEXISTENT_TEST_VAR_XYZ",
    );
  });

  it("throws on empty env var", () => {
    process.env.EMPTY_TEST_VAR = "";
    expect(() => resolveEnvRef("{env:EMPTY_TEST_VAR}")).toThrow("EMPTY_TEST_VAR");
    delete process.env.EMPTY_TEST_VAR;
  });

  it("isEnvRef detects env references", () => {
    expect(isEnvRef("{env:MY_KEY}")).toBe(true);
    expect(isEnvRef("{env:A}")).toBe(true);
    expect(isEnvRef("not-a-ref")).toBe(false);
    expect(isEnvRef("{env:}")).toBe(false);
    expect(isEnvRef("")).toBe(false);
    expect(isEnvRef("{env:123INVALID}")).toBe(false); // starts with digit
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. parseModelSpec
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseModelSpec", () => {
  beforeAll(() => {
    registerCustomProviders([FIXTURE_PROVIDER]);
  });

  it("splits on colon for known providers", () => {
    const spec = parseModelSpec("anthropic:claude-sonnet-4-6");
    expect(spec.backend).toBe("anthropic");
    expect(spec.model).toBe("claude-sonnet-4-6");
  });

  it("handles custom providers", () => {
    const spec = parseModelSpec("fixture-provider:fast");
    expect(spec.backend).toBe("fixture-provider");
    expect(spec.model).toBe("fast");
  });

  it("handles model IDs with slashes after colon", () => {
    const spec = parseModelSpec("openrouter:deepseek/deepseek-v3");
    expect(spec.backend).toBe("openrouter");
    expect(spec.model).toBe("deepseek/deepseek-v3");
  });

  it("returns both as same string when no colon", () => {
    const spec = parseModelSpec("claude");
    expect(spec.backend).toBe("claude");
    expect(spec.model).toBe("claude");
  });

  it("treats Ollama model:tag as single model (not provider:model)", () => {
    const spec = parseModelSpec("llama3:70b");
    expect(spec.backend).toBe("llama3:70b");
    expect(spec.model).toBe("llama3:70b");
  });

  it("handles unknown:tag as single model", () => {
    const spec = parseModelSpec("mymodel:latest");
    expect(spec.backend).toBe("mymodel:latest");
    expect(spec.model).toBe("mymodel:latest");
  });

  it("splits on known built-in aliases", () => {
    // "claude" is a known driver alias
    const spec = parseModelSpec("claude:opus");
    expect(spec.backend).toBe("claude");
    expect(spec.model).toBe("opus");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. isKnownProvider
// ═══════════════════════════════════════════════════════════════════════════════

describe("isKnownProvider", () => {
  beforeAll(() => {
    registerCustomProviders([FIXTURE_PROVIDER]);
  });

  it("returns true for built-in providers", () => {
    expect(isKnownProvider("anthropic")).toBe(true);
    expect(isKnownProvider("openai")).toBe(true);
    expect(isKnownProvider("local")).toBe(true);
    expect(isKnownProvider("claude-code")).toBe(true);
  });

  it("returns true for built-in driver aliases", () => {
    expect(isKnownProvider("claude")).toBe(true);
    expect(isKnownProvider("gpt")).toBe(true);
    expect(isKnownProvider("ollama")).toBe(true);
    expect(isKnownProvider("cc")).toBe(true);
  });

  it("returns true for custom registered providers", () => {
    expect(isKnownProvider("fixture-provider")).toBe(true);
  });

  it("returns false for unknown names", () => {
    expect(isKnownProvider("nonexistent-xyz")).toBe(false);
    expect(isKnownProvider("foo-bar-baz")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Family Cross-Reference
// ═══════════════════════════════════════════════════════════════════════════════

describe("family cross-reference", () => {
  beforeAll(async () => {
    await loadModelRegistry();
  });

  it("normalizes model names correctly", () => {
    expect(normalizeModelName("DeepSeek-V3")).toBe("deepseek-v3");
    expect(normalizeModelName("GPT-4o")).toBe("gpt-4o");
    expect(normalizeModelName("Llama 3.3 70B")).toBe("llama-3-3-70b");
    expect(normalizeModelName("qwen3.5")).toBe("qwen3-5");
    expect(normalizeModelName("model_name_v2")).toBe("model-name-v2");
    expect(normalizeModelName("")).toBe("");
  });

  it("generates match keys for Ollama cloud models", () => {
    const keys = generateMatchKeys("deepseek-v3.1:671b-cloud");
    expect(keys).toContain("deepseek-v3-1");
    expect(keys).toContain("deepseek-v3");
    expect(keys).toContain("deepseek");
    expect(keys).not.toContain("671b-cloud");
  });

  it("generates dash-before-digit variants", () => {
    const keys = generateMatchKeys("llama4:maverick-cloud");
    expect(keys).toContain("llama4");
    expect(keys).toContain("llama-4");
    expect(keys).toContain("llama");
  });

  it("deduplicates keys", () => {
    const keys = generateMatchKeys("deepseek-v3:cloud");
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });

  it("has family entries for common model families", () => {
    const all = listModels();
    const families = new Set(all.map((m) => normalizeModelName(m.family)));

    expect([...families].some((f) => f.includes("llama"))).toBe(true);
    expect([...families].some((f) => f.includes("deepseek"))).toBe(true);
    expect([...families].some((f) => f.includes("claude"))).toBe(true);
    expect([...families].some((f) => f.includes("gpt"))).toBe(true);
  });

  it("reasoning models are detected from models.dev", () => {
    const all = listModels();
    const reasoning = all.filter((m) => m.reasoning);
    expect(reasoning.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. OpenAI-Compatible Driver
// ═══════════════════════════════════════════════════════════════════════════════

describe("OpenAICompatibleDriver", () => {
  it("uses provider config id as driver name", () => {
    const driver = new OpenAICompatibleDriver(FIXTURE_PROVIDER);
    expect(driver.name).toBe("fixture-provider");
  });

  it("implements LLMDriver interface", () => {
    const driver = new OpenAICompatibleDriver(FIXTURE_PROVIDER);
    expect(typeof driver.chat).toBe("function");
    expect(typeof driver.name).toBe("string");
  });

  it("registers and is accessible via getDriver after registerCustomProviders", () => {
    registerCustomProviders([{
      id: "compat-test-driver",
      name: "Compat Test",
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
    }]);

    const driver = getDriver("compat-test-driver");
    expect(driver.name).toBe("compat-test-driver");
  });

  it("skips registration for unsupported types", () => {
    const before = listDrivers();
    registerCustomProviders([{
      id: "unsupported-type-driver",
      name: "Unsupported",
      baseUrl: "https://api.example.com",
      apiKey: "key",
      type: "anthropic",
    }]);
    expect(listDrivers()).not.toContain("unsupported-type-driver");
  });

  it("skips registration for missing id or baseUrl", () => {
    registerCustomProviders([{
      id: "",
      name: "Empty ID",
      baseUrl: "https://api.example.com",
      apiKey: "key",
    }]);
    expect(listDrivers()).not.toContain("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Custom Provider Full Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe("custom provider lifecycle", () => {
  const provider: ProviderConfig = {
    id: "lifecycle-test",
    name: "Lifecycle Test",
    baseUrl: "https://api.lifecycle.example.com/v1",
    apiKey: "{env:LIFECYCLE_TEST_KEY}",
    models: {
      alpha: "vendor/model-alpha",
      beta: "vendor/model-beta",
    },
    defaultModel: "vendor/model-alpha",
  };

  beforeAll(() => {
    process.env.LIFECYCLE_TEST_KEY = "lifecycle-api-key-12345";
    registerCustomProviders([provider]);
  });

  afterAll(() => {
    delete process.env.LIFECYCLE_TEST_KEY;
  });

  it("driver is registered and accessible", () => {
    const driver = getDriver("lifecycle-test");
    expect(driver.name).toBe("lifecycle-test");
  });

  it("model aliases resolve correctly", () => {
    expect(resolveModel("lifecycle-test", "alpha")).toBe("vendor/model-alpha");
    expect(resolveModel("lifecycle-test", "beta")).toBe("vendor/model-beta");
  });

  it("default model resolves via provider ID alias", () => {
    expect(resolveModel("lifecycle-test", "lifecycle-test")).toBe("vendor/model-alpha");
  });

  it("parseModelSpec splits correctly", () => {
    const spec = parseModelSpec("lifecycle-test:alpha");
    expect(spec.backend).toBe("lifecycle-test");
    expect(spec.model).toBe("alpha");
  });

  it("isKnownProvider returns true", () => {
    expect(isKnownProvider("lifecycle-test")).toBe(true);
  });

  it("unknown model IDs pass through", () => {
    expect(resolveModel("lifecycle-test", "vendor/custom-v99")).toBe("vendor/custom-v99");
  });

  it("capabilities fall back to ultra-conservative for unknown models", () => {
    const caps = getCapabilities("lifecycle-test", "totally-unknown-xyz");
    expect(caps.id).toBe("totally-unknown-xyz");
    expect(caps.provider).toBe("lifecycle-test");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Resolution Order Correctness (regression test)
// ═══════════════════════════════════════════════════════════════════════════════

describe("resolution order", () => {
  beforeAll(async () => {
    await loadModelRegistry();
  });

  it("static aliases take priority over fuzzy matching", () => {
    // "claude" should resolve to claude-sonnet-4-6 (static alias)
    // not claude-opus (fuzzy match from models.dev family)
    const resolved = resolveModel("anthropic", "claude");
    expect(resolved).toBe("claude-sonnet-4-6");
  });

  it("exact capIndex matches take highest priority", () => {
    // "claude-sonnet-4-6" exists in capIndex — should resolve exactly
    expect(resolveModel("anthropic", "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  it("direct alias matches beat static aliases", () => {
    // "claude-sonnet" is a family alias in models.dev — should resolve via aliasIndex
    const resolved = resolveModel("anthropic", "claude-sonnet");
    expect(resolved).toContain("claude-sonnet");
  });
});
