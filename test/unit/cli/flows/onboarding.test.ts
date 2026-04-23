/**
 * Tests for the onboarding flow.
 *
 * Covers every branch the wizard engine can exercise:
 *   - provider select (step 0) shape
 *   - single-auth providers (step 1 is password)
 *   - multi-auth providers (step 1 is select, step 2 is password or skipped)
 *   - keyless providers (Ollama, LM Studio) — steps 1 + 2 skipped
 *   - parseResults method derivation for every path
 */

import { describe, test, expect } from "bun:test";
import { createOnboardingFlow, toWizardConfig } from "../../../../src/cli/flows/index.js";
import type { ProviderOption } from "../../../../src/cli/lib/setup.js";

// ---------------------------------------------------------------------------
// Test providers — shaped after the real catalogue so resolveOnboardingMethod
// picks the same branches, but isolated from the live preset registry.
// ---------------------------------------------------------------------------

const TEST_PROVIDERS: readonly ProviderOption[] = [
  { id: "anthropic",  name: "Claude",     envKey: "ANTHROPIC_API_KEY",  model: "claude",     needsApiKey: true },
  { id: "openrouter", name: "OpenRouter", envKey: "OPENROUTER_API_KEY", model: "openrouter", needsApiKey: true },
  { id: "local",      name: "Ollama",     envKey: "",                   model: "local",      needsApiKey: false },
  { id: "lmstudio",   name: "LM Studio",  envKey: "LMSTUDIO_API_KEY",   model: "lmstudio",   needsApiKey: false },
];

function flow(daemonAvailable = false) {
  return createOnboardingFlow({
    providers: TEST_PROVIDERS,
    daemonAvailable,
    onComplete: () => {},
  });
}

// ---------------------------------------------------------------------------
// Step 0 — provider select
// ---------------------------------------------------------------------------

describe("createOnboardingFlow / step 0 (provider select)", () => {
  test("is a static select step listing every injected provider", () => {
    const step = flow().steps[0];
    if (typeof step === "function" || step === undefined) {
      throw new Error("step 0 should be static");
    }
    expect(step.type).toBe("select");
    if (step.type !== "select") return;
    expect(step.options.map((o) => o.value)).toEqual([
      "anthropic", "openrouter", "local", "lmstudio",
    ]);
    // First entry carries the "recommended" hint; keyless providers carry
    // the "no API key needed" hint.
    expect(step.options[0]!.hint).toBe("recommended");
    expect(step.options[2]!.hint).toBe("no API key needed");
    expect(step.options[3]!.hint).toBe("no API key needed");
  });
});

// ---------------------------------------------------------------------------
// Step 1 — authOrApiKeyStep
// ---------------------------------------------------------------------------

describe("createOnboardingFlow / step 1 (auth-or-api-key)", () => {
  test("renders a password step for single-auth providers (Anthropic)", () => {
    const resolver = flow().steps[1];
    if (typeof resolver !== "function") throw new Error("step 1 should be dynamic");
    const step = resolver(["anthropic"]);
    expect(step?.type).toBe("password");
    if (step?.type === "password") {
      expect(step.message).toContain("Claude");
    }
  });

  test("renders an auth-method select for multi-auth providers (OpenRouter, daemon available)", () => {
    const resolver = flow(true).steps[1];
    if (typeof resolver !== "function") throw new Error("step 1 should be dynamic");
    const step = resolver(["openrouter"]);
    expect(step?.type).toBe("select");
    if (step?.type === "select") {
      const values = step.options.map((o) => o.value);
      // The OpenRouter auth def exposes both oauth-pkce and api-key choices.
      expect(values).toContain("openrouter-oauth");
      expect(values).toContain("openrouter-api-key");
    }
  });

  test("multi-auth collapses to single-auth when daemon is unavailable (OAuth requires relay)", () => {
    const resolver = flow(false).steps[1];
    if (typeof resolver !== "function") throw new Error("step 1 should be dynamic");
    // OpenRouter OAuth uses the relay; without the daemon the choice list
    // drops to one → the flow renders the password prompt directly.
    const step = resolver(["openrouter"]);
    expect(step?.type).toBe("password");
  });

  test("skips step 1 entirely for keyless providers", () => {
    const resolver = flow().steps[1];
    if (typeof resolver !== "function") throw new Error("step 1 should be dynamic");
    expect(resolver(["local"])).toBeNull();
    expect(resolver(["lmstudio"])).toBeNull();
  });

  test("password validator rejects too-short / whitespaced keys", () => {
    const resolver = flow().steps[1];
    if (typeof resolver !== "function") throw new Error("step 1 should be dynamic");
    const step = resolver(["anthropic"]);
    if (step?.type !== "password") throw new Error("expected password step");
    expect(step.validate!("")).toBeDefined();
    expect(step.validate!("short")).toBeDefined();
    expect(step.validate!("has whitespace")).toBeDefined();
    expect(step.validate!("sk-valid-long-key-1234567890")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Step 2 — post-multi-auth password
// ---------------------------------------------------------------------------

describe("createOnboardingFlow / step 2 (post-multi-auth password)", () => {
  test("renders a password step only after a multi-auth API-key choice", () => {
    const resolver = flow(true).steps[2];
    if (typeof resolver !== "function") throw new Error("step 2 should be dynamic");
    const step = resolver(["openrouter", "openrouter-api-key"]);
    expect(step?.type).toBe("password");
    if (step?.type === "password") {
      expect(step.message).toContain("OpenRouter");
    }
  });

  test("is skipped after a multi-auth OAuth choice", () => {
    const resolver = flow(true).steps[2];
    if (typeof resolver !== "function") throw new Error("step 2 should be dynamic");
    expect(resolver(["openrouter", "openrouter-oauth"])).toBeNull();
  });

  test("is skipped for single-auth providers (password was already step 1)", () => {
    const resolver = flow().steps[2];
    if (typeof resolver !== "function") throw new Error("step 2 should be dynamic");
    expect(resolver(["anthropic"])).toBeNull();
  });

  test("is skipped for keyless providers", () => {
    const resolver = flow().steps[2];
    if (typeof resolver !== "function") throw new Error("step 2 should be dynamic");
    expect(resolver(["local"])).toBeNull();
    expect(resolver(["lmstudio"])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseResults — method derivation
// ---------------------------------------------------------------------------

describe("createOnboardingFlow / parseResults", () => {
  test("single-auth api-key: raw[1] carries the key", () => {
    const r = flow().parseResults(["anthropic", "sk-abcdefg1234567890"]);
    expect(r.method).toBe("api-key");
    expect(r.provider.id).toBe("anthropic");
    expect(r.apiKey).toBe("sk-abcdefg1234567890");
  });

  test("multi-auth api-key: raw[1] is the choice, raw[2] is the key", () => {
    const r = flow(true).parseResults([
      "openrouter",
      "openrouter-api-key",
      "sk-or-1234567890abcdef",
    ]);
    expect(r.method).toBe("api-key");
    expect(r.apiKey).toBe("sk-or-1234567890abcdef");
    expect(r.authChoiceId).toBe("openrouter-api-key");
  });

  test("multi-auth oauth: method resolves to oauth, apiKey stays empty", () => {
    const r = flow(true).parseResults(["openrouter", "openrouter-oauth"]);
    expect(r.method).toBe("oauth");
    expect(r.authChoiceId).toBe("openrouter-oauth");
    expect(r.apiKey).toBe("");
  });

  test("local (Ollama): method=ollama regardless of trailing answers", () => {
    const r = flow().parseResults(["local"]);
    expect(r.method).toBe("ollama");
    expect(r.apiKey).toBe("");
  });

  test("lmstudio: method=lmstudio", () => {
    const r = flow().parseResults(["lmstudio"]);
    expect(r.method).toBe("lmstudio");
    expect(r.apiKey).toBe("");
  });

  test("throws on an unknown provider id", () => {
    expect(() => flow().parseResults(["ghost"])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// toWizardConfig — end-to-end through the adapter
// ---------------------------------------------------------------------------

describe("createOnboardingFlow / toWizardConfig", () => {
  test("onComplete receives the typed result for single-auth path", async () => {
    type Seen = { method: string; apiKey: string };
    let seen: Seen | null = null;
    const f = createOnboardingFlow({
      providers: TEST_PROVIDERS,
      onComplete: (r) => { seen = { method: r.method, apiKey: r.apiKey }; },
    });
    await toWizardConfig(f).onComplete(["anthropic", "sk-end-to-end-123456"]);
    expect(seen!.method).toBe("api-key");
    expect(seen!.apiKey).toBe("sk-end-to-end-123456");
  });

  test("onComplete receives ollama for keyless local provider", async () => {
    let method = "";
    const f = createOnboardingFlow({
      providers: TEST_PROVIDERS,
      onComplete: (r) => { method = r.method; },
    });
    await toWizardConfig(f).onComplete(["local"]);
    expect(method).toBe("ollama");
  });
});
