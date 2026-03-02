/**
 * Tests for CLI setup detection and validation logic.
 *
 * Tests needsSetup(), validateApiKey(), and PROVIDER_OPTIONS without
 * requiring any UI runtime.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  PROVIDER_OPTIONS,
  needsSetup,
  validateApiKey,
} from "../../../src/cli/lib/setup.js";

// ---------------------------------------------------------------------------
// PROVIDER_OPTIONS
// ---------------------------------------------------------------------------

describe("PROVIDER_OPTIONS", () => {
  test("has 3 providers", () => {
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
// needsSetup
// ---------------------------------------------------------------------------

describe("needsSetup", () => {
  // Save original env vars to restore after tests
  let origAnthropic: string | undefined;
  let origOpenAI: string | undefined;

  beforeEach(() => {
    origAnthropic = process.env.ANTHROPIC_API_KEY;
    origOpenAI = process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    // Restore original values
    if (origAnthropic !== undefined) {
      process.env.ANTHROPIC_API_KEY = origAnthropic;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (origOpenAI !== undefined) {
      process.env.OPENAI_API_KEY = origOpenAI;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  test("returns false when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key-1234567890";
    delete process.env.OPENAI_API_KEY;
    expect(needsSetup()).toBe(false);
  });

  test("returns false when OPENAI_API_KEY is set", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-key-1234567890";
    expect(needsSetup()).toBe(false);
  });

  test("returns false when both API keys are set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key-1234567890";
    process.env.OPENAI_API_KEY = "sk-test-key-1234567890";
    expect(needsSetup()).toBe(false);
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
    const provider = PROVIDER_OPTIONS.find((p) => p.id === "anthropic")!;
    expect(provider.needsApiKey).toBe(true);
    expect(provider.envKey).toBe("ANTHROPIC_API_KEY");
  });

  test("selecting Local skips API key step", () => {
    const provider = PROVIDER_OPTIONS.find((p) => p.id === "local")!;
    expect(provider.needsApiKey).toBe(false);
    expect(provider.envKey).toBe("");
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
