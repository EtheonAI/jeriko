/**
 * Tests for the onboarding flow.
 *
 * Covers:
 *   - step 0 (provider select) surface
 *   - step 1 conditional skip for providers with needsApiKey=false
 *   - step 1 rendering for providers that need an API key
 *   - parseResults for happy path and unknown-provider error
 */

import { describe, test, expect } from "bun:test";
import { createOnboardingFlow } from "../../../../src/cli/flows/index.js";
import type { ProviderOption } from "../../../../src/cli/lib/setup.js";

const TEST_PROVIDERS: readonly ProviderOption[] = [
  { id: "anthropic", name: "Claude",  envKey: "ANTHROPIC_API_KEY", model: "claude",  needsApiKey: true },
  { id: "openai",    name: "OpenAI",  envKey: "OPENAI_API_KEY",    model: "gpt4",    needsApiKey: true },
  { id: "local",     name: "Ollama",  envKey: "",                  model: "local",   needsApiKey: false },
];

describe("createOnboardingFlow", () => {
  test("step 0 is a select step listing the provided providers", () => {
    const flow = createOnboardingFlow({ providers: TEST_PROVIDERS, onComplete: () => {} });
    const resolver = flow.steps[0];
    expect(typeof resolver).toBe("object");
    // Static select step
    const step = typeof resolver === "function" ? null : resolver!;
    expect(step?.type).toBe("select");
    if (step?.type !== "select") throw new Error("expected select step");
    expect(step.options.map((o) => o.value)).toEqual(["anthropic", "openai", "local"]);
  });

  test("step 1 resolves to null for providers without API key (skip)", () => {
    const flow = createOnboardingFlow({ providers: TEST_PROVIDERS, onComplete: () => {} });
    const resolver = flow.steps[1];
    if (typeof resolver !== "function") throw new Error("step 1 should be dynamic");
    expect(resolver(["local"])).toBeNull();
  });

  test("step 1 resolves to a password step for providers with API key", () => {
    const flow = createOnboardingFlow({ providers: TEST_PROVIDERS, onComplete: () => {} });
    const resolver = flow.steps[1];
    if (typeof resolver !== "function") throw new Error("step 1 should be dynamic");
    const step = resolver(["openai"]);
    expect(step).not.toBeNull();
    expect(step!.type).toBe("password");
    if (step!.type === "password") {
      expect(step.message).toContain("OpenAI");
    }
  });

  test("step 1 validator rejects too-short keys", () => {
    const flow = createOnboardingFlow({ providers: TEST_PROVIDERS, onComplete: () => {} });
    const resolver = flow.steps[1];
    if (typeof resolver !== "function") throw new Error("step 1 should be dynamic");
    const step = resolver(["anthropic"]);
    if (step?.type !== "password") throw new Error("expected password step");
    expect(step.validate!("short")).toBeDefined();
    expect(step.validate!("")).toBeDefined();
    expect(step.validate!("has whitespace")).toBeDefined();
    expect(step.validate!("sk-valid-long-key-1234567890")).toBeUndefined();
  });

  test("parseResults returns typed OnboardingResult for needsApiKey=true", () => {
    const flow = createOnboardingFlow({ providers: TEST_PROVIDERS, onComplete: () => {} });
    const result = flow.parseResults(["openai", "sk-test-key-value"]);
    expect(result.provider.id).toBe("openai");
    expect(result.apiKey).toBe("sk-test-key-value");
  });

  test("parseResults handles needsApiKey=false with empty-string placeholder", () => {
    const flow = createOnboardingFlow({ providers: TEST_PROVIDERS, onComplete: () => {} });
    const result = flow.parseResults(["local", ""]);
    expect(result.provider.id).toBe("local");
    expect(result.apiKey).toBe("");
  });

  test("parseResults throws for unknown provider id", () => {
    const flow = createOnboardingFlow({ providers: TEST_PROVIDERS, onComplete: () => {} });
    expect(() => flow.parseResults(["not-real", ""])).toThrow();
  });

  test("onComplete is called with typed result end-to-end (through toWizardConfig)", async () => {
    let received: { provider: ProviderOption; apiKey: string } | null = null;
    const flow = createOnboardingFlow({
      providers: TEST_PROVIDERS,
      onComplete: (r) => { received = r; },
    });
    const { toWizardConfig } = await import("../../../../src/cli/flows/index.js");
    const cfg = toWizardConfig(flow);
    await cfg.onComplete(["anthropic", "sk-abc-1234567890"]);
    expect(received?.provider.id).toBe("anthropic");
    expect(received?.apiKey).toBe("sk-abc-1234567890");
  });
});
