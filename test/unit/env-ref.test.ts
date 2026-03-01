import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { resolveEnvRef, isEnvRef } from "../../src/shared/env-ref.js";

// ─── resolveEnvRef ──────────────────────────────────────────────────────────

describe("resolveEnvRef", () => {
  const TEST_VAR = "JERIKO_TEST_ENV_REF_VAR";
  const TEST_VALUE = "test-api-key-12345";

  beforeEach(() => {
    process.env[TEST_VAR] = TEST_VALUE;
  });

  afterEach(() => {
    delete process.env[TEST_VAR];
  });

  it("resolves {env:VAR} to the environment variable value", () => {
    expect(resolveEnvRef(`{env:${TEST_VAR}}`)).toBe(TEST_VALUE);
  });

  it("passes through literal strings unchanged", () => {
    expect(resolveEnvRef("sk-abc123")).toBe("sk-abc123");
    expect(resolveEnvRef("https://api.example.com")).toBe("https://api.example.com");
    expect(resolveEnvRef("")).toBe("");
  });

  it("throws when env var is not set", () => {
    delete process.env[TEST_VAR];
    expect(() => resolveEnvRef(`{env:${TEST_VAR}}`)).toThrow(TEST_VAR);
  });

  it("throws when env var is empty string", () => {
    process.env[TEST_VAR] = "";
    expect(() => resolveEnvRef(`{env:${TEST_VAR}}`)).toThrow(TEST_VAR);
  });

  it("does not match partial env ref patterns", () => {
    // These should all pass through as literals
    expect(resolveEnvRef("{env:}")).toBe("{env:}");
    expect(resolveEnvRef("prefix {env:VAR}")).toBe("prefix {env:VAR}");
    expect(resolveEnvRef("{env:VAR} suffix")).toBe("{env:VAR} suffix");
    expect(resolveEnvRef("{ENV:VAR}")).toBe("{ENV:VAR}");
  });

  it("handles underscored variable names", () => {
    process.env.MY_LONG_API_KEY_NAME = "long-key";
    try {
      expect(resolveEnvRef("{env:MY_LONG_API_KEY_NAME}")).toBe("long-key");
    } finally {
      delete process.env.MY_LONG_API_KEY_NAME;
    }
  });
});

// ─── isEnvRef ───────────────────────────────────────────────────────────────

describe("isEnvRef", () => {
  it("returns true for valid env refs", () => {
    expect(isEnvRef("{env:MY_VAR}")).toBe(true);
    expect(isEnvRef("{env:OPENROUTER_API_KEY}")).toBe(true);
    expect(isEnvRef("{env:_PRIVATE}")).toBe(true);
  });

  it("returns false for non-env-ref strings", () => {
    expect(isEnvRef("sk-abc123")).toBe(false);
    expect(isEnvRef("")).toBe(false);
    expect(isEnvRef("{env:}")).toBe(false);
    expect(isEnvRef("prefix {env:VAR}")).toBe(false);
  });
});
