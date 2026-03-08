import { describe, expect, it, beforeEach } from "bun:test";

import {
  normalizeModelName,
  generateMatchKeys,
  loadModelRegistry,
  probeLocalModel,
  getCapabilities,
  resolveModel,
  listModels,
  type ModelCapabilities,
} from "../../src/daemon/agent/drivers/models.js";

// ─── normalizeModelName ─────────────────────────────────────────────────────

describe("normalizeModelName", () => {
  it("lowercases and normalizes separators", () => {
    expect(normalizeModelName("DeepSeek-V3")).toBe("deepseek-v3");
    expect(normalizeModelName("GPT-4o")).toBe("gpt-4o");
    expect(normalizeModelName("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  it("replaces dots and underscores with dashes", () => {
    expect(normalizeModelName("qwen3.5")).toBe("qwen3-5");
    expect(normalizeModelName("model_name_v2")).toBe("model-name-v2");
    expect(normalizeModelName("llama.3.3.70B")).toBe("llama-3-3-70b");
  });

  it("replaces spaces with dashes", () => {
    expect(normalizeModelName("Llama 3.3 70B")).toBe("llama-3-3-70b");
    expect(normalizeModelName("DeepSeek R1")).toBe("deepseek-r1");
  });

  it("collapses multiple dashes", () => {
    expect(normalizeModelName("model--name---v2")).toBe("model-name-v2");
  });

  it("trims leading and trailing dashes", () => {
    expect(normalizeModelName("-model-name-")).toBe("model-name");
    expect(normalizeModelName("..model..")).toBe("model");
  });

  it("handles empty string", () => {
    expect(normalizeModelName("")).toBe("");
  });
});

// ─── generateMatchKeys ──────────────────────────────────────────────────────

describe("generateMatchKeys", () => {
  it("strips tag suffix after colon", () => {
    const keys = generateMatchKeys("deepseek-v3.1:671b-cloud");
    expect(keys[0]).toBe("deepseek-v3-1"); // normalized base name
    expect(keys).not.toContain("671b-cloud");
  });

  it("generates progressively shorter keys for deepseek-v3.1", () => {
    const keys = generateMatchKeys("deepseek-v3.1:671b-cloud");
    expect(keys).toContain("deepseek-v3-1");
    expect(keys).toContain("deepseek-v3");
    expect(keys).toContain("deepseek");
  });

  it("generates dash-before-digit variants", () => {
    const keys = generateMatchKeys("llama4:maverick-cloud");
    expect(keys).toContain("llama4");
    expect(keys).toContain("llama-4");
    expect(keys).toContain("llama");
  });

  it("handles qwen3.5 (dot version)", () => {
    const keys = generateMatchKeys("qwen3.5:32b-cloud");
    expect(keys).toContain("qwen3-5"); // dot → dash
    expect(keys).toContain("qwen-3-5"); // dash-before-digit
    expect(keys).toContain("qwen3");
    expect(keys).toContain("qwen-3");
  });

  it("handles deepseek-r1 (reasoning model)", () => {
    const keys = generateMatchKeys("deepseek-r1:671b-cloud");
    expect(keys).toContain("deepseek-r1");
    expect(keys).toContain("deepseek");
  });

  it("handles kimi-k2.5 (compound version)", () => {
    const keys = generateMatchKeys("kimi-k2.5:cloud");
    expect(keys).toContain("kimi-k2-5");
    expect(keys).toContain("kimi-k2");
    expect(keys).toContain("kimi");
  });

  it("handles phi4 (simple name)", () => {
    const keys = generateMatchKeys("phi4:14b-cloud");
    expect(keys).toContain("phi4");
    expect(keys).toContain("phi-4");
    expect(keys).toContain("phi");
  });

  it("handles gemma3 (simple name)", () => {
    const keys = generateMatchKeys("gemma3:27b-cloud");
    expect(keys).toContain("gemma3");
    expect(keys).toContain("gemma-3");
    expect(keys).toContain("gemma");
  });

  it("strips version markers with -v prefix", () => {
    const keys = generateMatchKeys("deepseek-v3:cloud");
    expect(keys).toContain("deepseek-v3");
    expect(keys).toContain("deepseek"); // -v3 stripped
  });

  it("does not produce empty or too-short keys", () => {
    const keys = generateMatchKeys("a1:cloud");
    for (const key of keys) {
      expect(key.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("deduplicates keys", () => {
    const keys = generateMatchKeys("deepseek-v3:cloud");
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });

  it("handles model name without colon tag", () => {
    const keys = generateMatchKeys("llama3");
    expect(keys).toContain("llama3");
    expect(keys).toContain("llama-3");
    expect(keys).toContain("llama");
  });
});

// ─── parseRegistry (all providers) ──────────────────────────────────────────

describe("loadModelRegistry (integration)", () => {
  it("fetches from models.dev and populates capIndex with ALL providers", async () => {
    await loadModelRegistry();

    // Should have parsed models from providers beyond just anthropic/openai
    const allModels = listModels();
    expect(allModels.length).toBeGreaterThan(10);

    // Check that we got anthropic models
    const anthropicModels = listModels("anthropic");
    expect(anthropicModels.length).toBeGreaterThan(0);

    // Check that we got openai models
    const openaiModels = listModels("openai");
    expect(openaiModels.length).toBeGreaterThan(0);

    // Check that capIndex has entries from OTHER providers too
    // (deepinfra, nvidia, llama, io-net, etc.)
    const providers = new Set(allModels.map((m) => m.provider));
    expect(providers.size).toBeGreaterThan(2);
  });

  it("resolves anthropic models correctly after loading", async () => {
    await loadModelRegistry();

    const resolved = resolveModel("anthropic", "claude-sonnet");
    expect(resolved).toBeTruthy();

    const caps = getCapabilities("anthropic", resolved);
    expect(caps.toolCall).toBe(true);
    expect(caps.context).toBeGreaterThan(0);
  });

  it("resolves openai models correctly after loading", async () => {
    await loadModelRegistry();

    const resolved = resolveModel("openai", "gpt-4o");
    expect(resolved).toBeTruthy();

    const caps = getCapabilities("openai", resolved);
    expect(caps.toolCall).toBe(true);
    expect(caps.context).toBeGreaterThan(0);
  });
});

// ─── Cross-reference: Ollama models inherit models.dev capabilities ─────────

describe("cross-reference (family matching)", () => {
  // These tests require models.dev to be loaded. They verify that when we
  // probe an Ollama model, its capabilities are enriched from models.dev.

  it("detects reasoning models from models.dev", async () => {
    await loadModelRegistry();

    // models.dev should contain at least some reasoning-capable models
    const allModels = listModels();
    const reasoningModels = allModels.filter((m) => m.reasoning);

    // There must be reasoning models in the registry (Claude, o1/o3, DeepSeek R1, etc.)
    expect(reasoningModels.length).toBeGreaterThan(0);

    // Verify they have real capabilities (not defaults)
    for (const m of reasoningModels.slice(0, 5)) {
      expect(m.context).toBeGreaterThan(0);
    }
  });

  it("has family entries for common Ollama cloud model families", async () => {
    await loadModelRegistry();

    const allModels = listModels();
    const families = new Set(allModels.map((m) => normalizeModelName(m.family)));

    // These families should be present across all providers on models.dev.
    // We don't check exact names — just that the normalized forms appear.
    const hasLlama = [...families].some((f) => f.includes("llama"));
    const hasQwen = [...families].some((f) => f.includes("qwen"));
    const hasDeepseek = [...families].some((f) => f.includes("deepseek"));

    expect(hasLlama).toBe(true);
    expect(hasQwen).toBe(true);
    expect(hasDeepseek).toBe(true);
  });

  it("match keys for Ollama cloud models overlap with models.dev families", async () => {
    await loadModelRegistry();

    const allModels = listModels();
    const normalizedFamilies = new Set(allModels.map((m) => normalizeModelName(m.family)));
    const normalizedIds = new Set(allModels.map((m) => normalizeModelName(m.id)));
    const allKeys = new Set([...normalizedFamilies, ...normalizedIds]);

    // For each common Ollama cloud model name, check if match keys overlap
    const ollamaModels = [
      "deepseek-v3.1:671b-cloud",
      "deepseek-r1:671b-cloud",
      "qwen3.5:32b-cloud",
      "llama4:maverick-cloud",
      "gemma3:27b-cloud",
    ];

    let matchCount = 0;
    for (const model of ollamaModels) {
      const keys = generateMatchKeys(model);
      const matched = keys.some((k) => allKeys.has(k));
      if (matched) matchCount++;
      else console.log(`Note: no cross-ref match for "${model}" (keys: ${keys.join(", ")})`);
    }

    // At least some Ollama cloud models should have cross-reference matches.
    // The exact count depends on models.dev data, but deepseek is near-universal.
    expect(matchCount).toBeGreaterThan(0);

    // DeepSeek is a very common model across all providers on models.dev
    const deepseekKeys = generateMatchKeys("deepseek-v3.1:671b-cloud");
    expect(deepseekKeys.some((k) => allKeys.has(k))).toBe(true);
  });
});

// ─── getCapabilities fallback chain ─────────────────────────────────────────

describe("getCapabilities fallback", () => {
  it("returns fallback for unknown provider", () => {
    const caps = getCapabilities("xyzzy", "some-model");
    expect(caps.id).toBe("some-model");
    expect(caps.provider).toBe("xyzzy");
    expect(caps.family).toBe("unknown");
    expect(caps.toolCall).toBe(false);
    expect(caps.reasoning).toBe(false);
    expect(caps.context).toBe(24_000);
  });

  it("returns provider-level fallback for known providers", () => {
    const caps = getCapabilities("anthropic", "nonexistent-model-xyz");
    // Should get the anthropic fallback, not the ultra-conservative default
    expect(caps.provider).toBe("anthropic");
    expect(caps.toolCall).toBe(true);
    expect(caps.context).toBeGreaterThan(24_000);
  });

  it("returns local fallback for unknown local model", () => {
    const caps = getCapabilities("local", "some-unknown-model");
    expect(caps.provider).toBe("local");
    expect(caps.toolCall).toBe(false);
    expect(caps.context).toBe(32_768);
  });
});

// ─── resolveModel ───────────────────────────────────────────────────────────

describe("resolveModel", () => {
  it("passes through unknown model names for local provider", () => {
    expect(resolveModel("local", "my-custom-model")).toBe("my-custom-model");
  });

  it("resolves 'local' alias to env or default", () => {
    const original = process.env.LOCAL_MODEL;
    delete process.env.LOCAL_MODEL;
    // Resolves to LOCAL_MODEL env → Ollama-detected model → "llama3" fallback.
    // When Ollama is running, the detected model takes priority over "llama3".
    const resolved = resolveModel("local", "local");
    expect(resolved).toBeTruthy();
    expect(typeof resolved).toBe("string");
    if (original) process.env.LOCAL_MODEL = original;
  });

  it("resolves known aliases to valid model IDs", () => {
    // After models.dev is loaded, dynamic aliases take priority over static ones.
    // The exact model ID depends on models.dev data, but the resolution should
    // produce a non-empty, valid-looking model ID.
    const claude = resolveModel("anthropic", "claude");
    expect(claude).toBeTruthy();
    expect(claude.includes("claude")).toBe(true);

    const opus = resolveModel("anthropic", "opus");
    expect(opus).toBeTruthy();
    expect(opus.includes("opus") || opus.includes("claude")).toBe(true);

    const gpt = resolveModel("openai", "gpt");
    expect(gpt).toBeTruthy();
    expect(gpt.includes("gpt") || gpt.includes("o")).toBe(true);
  });
});
