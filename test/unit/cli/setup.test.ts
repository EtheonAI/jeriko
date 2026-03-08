/**
 * Tests for CLI setup detection and validation logic.
 *
 * Tests needsSetup(), validateApiKey(), PROVIDER_OPTIONS (static fallback),
 * and getProviderOptions() (dynamic registry) without requiring any UI runtime.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  PROVIDER_OPTIONS,
  PROVIDER_ENV_KEYS,
  getProviderOptions,
  needsSetup,
  validateApiKey,
  validateUrl,
  type ProviderOption,
} from "../../../src/cli/lib/setup.js";

// ---------------------------------------------------------------------------
// PROVIDER_OPTIONS (static fallback — always 3 built-in providers)
// ---------------------------------------------------------------------------

describe("PROVIDER_OPTIONS (static)", () => {
  test("has 3 built-in providers", () => {
    expect(PROVIDER_OPTIONS.length).toBe(3);
  });

  test("first provider is Anthropic (recommended)", () => {
    expect(PROVIDER_OPTIONS[0]!.id).toBe("anthropic");
    expect(PROVIDER_OPTIONS[0]!.name).toBe("Claude (Anthropic)");
    expect(PROVIDER_OPTIONS[0]!.envKey).toBe("ANTHROPIC_API_KEY");
    expect(PROVIDER_OPTIONS[0]!.model).toBe("claude");
    expect(PROVIDER_OPTIONS[0]!.needsApiKey).toBe(true);
  });

  test("second provider is OpenAI", () => {
    expect(PROVIDER_OPTIONS[1]!.id).toBe("openai");
    expect(PROVIDER_OPTIONS[1]!.name).toBe("GPT (OpenAI)");
    expect(PROVIDER_OPTIONS[1]!.envKey).toBe("OPENAI_API_KEY");
    expect(PROVIDER_OPTIONS[1]!.model).toBe("gpt4");
    expect(PROVIDER_OPTIONS[1]!.needsApiKey).toBe(true);
  });

  test("third provider is Local (no API key needed)", () => {
    expect(PROVIDER_OPTIONS[2]!.id).toBe("local");
    expect(PROVIDER_OPTIONS[2]!.name).toBe("Local (Ollama)");
    expect(PROVIDER_OPTIONS[2]!.envKey).toBe("");
    expect(PROVIDER_OPTIONS[2]!.model).toBe("local");
    expect(PROVIDER_OPTIONS[2]!.needsApiKey).toBe(false);
  });

  test("all providers have required fields", () => {
    for (const p of PROVIDER_OPTIONS) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(typeof p.model).toBe("string");
      expect(typeof p.needsApiKey).toBe("boolean");
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getProviderOptions() — dynamic registry (built-in + presets)
// ---------------------------------------------------------------------------

describe("getProviderOptions()", () => {
  test("returns at least 3 built-in providers", () => {
    const options = getProviderOptions();
    expect(options.length).toBeGreaterThanOrEqual(3);
  });

  test("built-in providers come first (Anthropic, OpenAI, Local)", () => {
    const options = getProviderOptions();
    expect(options[0]!.id).toBe("anthropic");
    expect(options[1]!.id).toBe("openai");
    expect(options[2]!.id).toBe("local");
  });

  test("includes preset providers beyond built-ins", () => {
    const options = getProviderOptions();
    // Presets module should be available in the test env
    // At minimum we expect more than the 3 built-ins
    if (options.length > 3) {
      const presetIds = options.slice(3).map((p) => p.id);
      // Verify some well-known presets are present
      expect(presetIds).toContain("groq");
      expect(presetIds).toContain("openrouter");
    }
  });

  test("no duplicate IDs", () => {
    const options = getProviderOptions();
    const ids = options.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("all options have required fields", () => {
    const options = getProviderOptions();
    for (const p of options) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(typeof p.model).toBe("string");
      expect(typeof p.needsApiKey).toBe("boolean");
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  test("preset providers use provider:model format", () => {
    const options = getProviderOptions();
    for (const p of options.slice(3)) {
      // Preset models should be "id:defaultModel" or just "id"
      if (p.model.includes(":")) {
        expect(p.model.startsWith(p.id + ":")).toBe(true);
      } else {
        expect(p.model).toBe(p.id);
      }
    }
  });

  test("preset providers have correct needsApiKey based on baseUrl", () => {
    const options = getProviderOptions();
    for (const p of options.slice(3)) {
      // Local servers (127.0.0.1/localhost) don't need API keys
      if (p.id === "lmstudio") {
        expect(p.needsApiKey).toBe(false);
      } else {
        expect(p.needsApiKey).toBe(true);
      }
      expect(p.envKey.length).toBeGreaterThan(0);
    }
  });

  test("returns a fresh array each call (not shared reference)", () => {
    const a = getProviderOptions();
    const b = getProviderOptions();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// validateApiKey
// ---------------------------------------------------------------------------

describe("validateApiKey", () => {
  test("accepts a valid API key", () => {
    expect(validateApiKey("sk-abc123def456ghi789")).toBe(true);
  });

  test("accepts a long key", () => {
    expect(validateApiKey("a".repeat(100))).toBe(true);
  });

  test("rejects empty string", () => {
    expect(validateApiKey("")).toBe(false);
  });

  test("rejects short key (< 10 chars)", () => {
    expect(validateApiKey("short")).toBe(false);
    expect(validateApiKey("123456789")).toBe(false);
  });

  test("accepts exactly 10 chars", () => {
    expect(validateApiKey("1234567890")).toBe(true);
  });

  test("rejects key with spaces", () => {
    expect(validateApiKey("sk abc123def456")).toBe(false);
  });

  test("rejects key with tabs", () => {
    expect(validateApiKey("sk\tabc123def456")).toBe(false);
  });

  test("rejects key with newlines", () => {
    expect(validateApiKey("sk\nabc123def456")).toBe(false);
  });

  test("trims whitespace before validating", () => {
    // "  short  " trimmed is "short" (5 chars) — too short
    expect(validateApiKey("  short  ")).toBe(false);
    // "  validkey1234  " trimmed is "validkey1234" (12 chars) — valid
    expect(validateApiKey("  validkey1234  ")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateUrl
// ---------------------------------------------------------------------------

describe("validateUrl", () => {
  test("accepts valid http URL", () => {
    expect(validateUrl("http://127.0.0.1:11434")).toBeUndefined();
  });

  test("accepts valid https URL", () => {
    expect(validateUrl("https://api.example.com/v1")).toBeUndefined();
  });

  test("rejects empty string", () => {
    expect(validateUrl("")).toBeDefined();
    expect(validateUrl("   ")).toBeDefined();
  });

  test("rejects non-http protocol", () => {
    expect(validateUrl("ftp://example.com")).toBeDefined();
    expect(validateUrl("file:///etc/passwd")).toBeDefined();
  });

  test("rejects unparseable URL", () => {
    expect(validateUrl("not a url")).toBeDefined();
  });

  test("trims whitespace", () => {
    expect(validateUrl("  http://localhost:8080  ")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PROVIDER_ENV_KEYS
// ---------------------------------------------------------------------------

describe("PROVIDER_ENV_KEYS", () => {
  test("includes all built-in provider keys", () => {
    expect(PROVIDER_ENV_KEYS).toContain("ANTHROPIC_API_KEY");
    expect(PROVIDER_ENV_KEYS).toContain("OPENAI_API_KEY");
  });

  test("includes major preset provider keys", () => {
    expect(PROVIDER_ENV_KEYS).toContain("GROQ_API_KEY");
    expect(PROVIDER_ENV_KEYS).toContain("DEEPSEEK_API_KEY");
    expect(PROVIDER_ENV_KEYS).toContain("OPENROUTER_API_KEY");
    expect(PROVIDER_ENV_KEYS).toContain("GOOGLE_API_KEY");
    expect(PROVIDER_ENV_KEYS).toContain("MISTRAL_API_KEY");
  });

  test("has no duplicates", () => {
    const set = new Set(PROVIDER_ENV_KEYS);
    expect(set.size).toBe(PROVIDER_ENV_KEYS.length);
  });
});

// ---------------------------------------------------------------------------
// needsSetup
// ---------------------------------------------------------------------------

describe("needsSetup", () => {
  // Save and restore ALL provider env vars to avoid test pollution
  const savedEnvVars: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      savedEnvVars[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      if (savedEnvVars[key] !== undefined) {
        process.env[key] = savedEnvVars[key];
      } else {
        delete process.env[key];
      }
    }
  });

  test("returns false when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key-1234567890";
    expect(needsSetup()).toBe(false);
  });

  test("returns false when OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test-key-1234567890";
    expect(needsSetup()).toBe(false);
  });

  test("returns false when GROQ_API_KEY is set", () => {
    process.env.GROQ_API_KEY = "gsk-test-key-1234567890";
    expect(needsSetup()).toBe(false);
  });

  test("returns false when any provider key is set", () => {
    // Test a sample of keys beyond the original two
    for (const key of ["DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "XAI_API_KEY", "GOOGLE_API_KEY"]) {
      // Clear all first
      for (const k of PROVIDER_ENV_KEYS) delete process.env[k];
      process.env[key] = "test-value";
      expect(needsSetup()).toBe(false);
    }
  });

  // Note: We can't easily test the "config file exists" path without
  // mocking the filesystem or using a temp directory for XDG_CONFIG_HOME.
  // The env var checks are the primary paths tested here.
});

// ---------------------------------------------------------------------------
// Integration: provider selection flow
// ---------------------------------------------------------------------------

describe("Setup Flow", () => {
  test("selecting Anthropic requires API key", () => {
    const options = getProviderOptions();
    const provider = options.find((p) => p.id === "anthropic")!;
    expect(provider.needsApiKey).toBe(true);
    expect(provider.envKey).toBe("ANTHROPIC_API_KEY");
  });

  test("selecting Local skips API key step", () => {
    const options = getProviderOptions();
    const provider = options.find((p) => p.id === "local")!;
    expect(provider.needsApiKey).toBe(false);
    expect(provider.envKey).toBe("");
  });

  test("selecting a preset provider requires API key", () => {
    const options = getProviderOptions();
    const groq = options.find((p) => p.id === "groq");
    if (groq) {
      expect(groq.needsApiKey).toBe(true);
      expect(groq.envKey).toBe("GROQ_API_KEY");
      expect(groq.model).toBe("groq:llama-3.1-8b-instant");
    }
  });

  test("valid key passes validation for Anthropic", () => {
    const key = "sk-ant-api03-abcdef1234567890abcdef1234567890";
    expect(validateApiKey(key)).toBe(true);
  });

  test("valid key passes validation for OpenAI", () => {
    const key = "sk-proj-abcdefghijklmnopqrstuvwxyz";
    expect(validateApiKey(key)).toBe(true);
  });
});
