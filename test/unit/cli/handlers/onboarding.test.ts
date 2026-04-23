/**
 * Tests for the onboarding executor — the side-effect pipeline that runs
 * after the wizard produces a typed {@link OnboardingResult}.
 *
 * Every external dependency is injected, so this file exercises:
 *   - API-key verification (verified + unverified branches)
 *   - OAuth success + failure
 *   - Ollama detection (missing, no models, one model, multiple)
 *   - LM Studio detection (running + missing)
 *   - Persistence (result shape handed to persistSetup)
 *   - Host signalling (announce, setModel, updateSessionModel)
 *
 * No real network, no real filesystem, no React.
 */

import { describe, test, expect } from "bun:test";
import {
  createOnboardingExecutor,
  type OnboardingDependencies,
  type OnboardingHost,
} from "../../../../src/cli/handlers/onboarding.js";
import type { OnboardingResult } from "../../../../src/cli/flows/onboarding.js";
import type { ProviderOption } from "../../../../src/cli/lib/setup.js";
import type { OAuthConfig } from "../../../../src/cli/lib/provider-auth.js";
import type { PersistableOnboardingResult } from "../../../../src/cli/handlers/onboarding-persist.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface Spy {
  readonly announcements: string[];
  readonly modelsSet: string[];
  readonly sessionModelsSet: string[];
  readonly persisted: PersistableOnboardingResult[];
  pickResult: string | null;
  readonly pickCalls: Array<{ title: string; message: string; optionValues: string[] }>;
}

function makeSpy(): Spy {
  return {
    announcements: [],
    modelsSet: [],
    sessionModelsSet: [],
    persisted: [],
    pickResult: null,
    pickCalls: [],
  };
}

function makeHost(spy: Spy): OnboardingHost {
  return {
    announce: (msg) => { spy.announcements.push(msg); },
    setModel: (m) => { spy.modelsSet.push(m); },
    updateSessionModel: async (m) => { spy.sessionModelsSet.push(m); },
    pickFromList: async (opts) => {
      spy.pickCalls.push({
        title: opts.title,
        message: opts.message,
        optionValues: opts.options.map((o) => o.value),
      });
      return spy.pickResult;
    },
  };
}

interface DepSpy {
  readonly verifyApiKeyCalls: Array<[string, string]>;
  readonly ollamaRunningValue: boolean;
  readonly ollamaModels: string[];
  readonly lmstudioRunningValue: boolean;
  readonly oauthConfig: OAuthConfig | undefined;
  readonly oauthThrow: boolean;
  readonly oauthKey: string;
  readonly verifyApiKeyResult: boolean;
}

interface BuildDepsOptions {
  readonly verifyApiKeyResult?: boolean;
  readonly ollamaRunning?: boolean;
  readonly ollamaModels?: string[];
  readonly lmstudioRunning?: boolean;
  readonly oauthConfig?: OAuthConfig | undefined;
  readonly oauthThrow?: boolean;
  readonly oauthKey?: string;
}

function makeDeps(
  spy: Spy,
  opts: BuildDepsOptions = {},
): OnboardingDependencies & { readonly calls: DepSpy } {
  const calls: DepSpy = {
    verifyApiKeyCalls: [],
    ollamaRunningValue: opts.ollamaRunning ?? true,
    ollamaModels: opts.ollamaModels ?? [],
    lmstudioRunningValue: opts.lmstudioRunning ?? true,
    oauthConfig: opts.oauthConfig,
    oauthThrow: opts.oauthThrow ?? false,
    oauthKey: opts.oauthKey ?? "sk-oauth-resolved",
    verifyApiKeyResult: opts.verifyApiKeyResult ?? true,
  };

  const deps: OnboardingDependencies = {
    verifyApiKey: async (providerId, key) => {
      calls.verifyApiKeyCalls.push([providerId, key]);
      return calls.verifyApiKeyResult;
    },
    verifyOllamaRunning: async () => calls.ollamaRunningValue,
    fetchOllamaModelList: async () => [...calls.ollamaModels],
    verifyLMStudioRunning: async () => calls.lmstudioRunningValue,
    runOAuthFlow: async () => {
      if (calls.oauthThrow) throw new Error("auth callback timed out");
      return { key: calls.oauthKey };
    },
    getOAuthConfig: () => calls.oauthConfig,
    persistSetup: async (r) => { spy.persisted.push(r); },
  };

  return { ...deps, calls };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const CLAUDE: ProviderOption = {
  id: "anthropic", name: "Claude", envKey: "ANTHROPIC_API_KEY",
  model: "claude", needsApiKey: true,
};

const OPENROUTER: ProviderOption = {
  id: "openrouter", name: "OpenRouter", envKey: "OPENROUTER_API_KEY",
  model: "openrouter", needsApiKey: true,
};

const OLLAMA: ProviderOption = {
  id: "local", name: "Ollama", envKey: "",
  model: "local", needsApiKey: false,
};

const LMSTUDIO: ProviderOption = {
  id: "lmstudio", name: "LM Studio", envKey: "LMSTUDIO_API_KEY",
  model: "lmstudio", needsApiKey: false,
};

const FAKE_OAUTH_CONFIG: OAuthConfig = {
  authUrl: "https://auth.example/authorize",
  tokenUrl: "https://auth.example/token",
  clientId: "jeriko-test",
  pkce: true,
  envKey: "OPENROUTER_API_KEY",
};

// ---------------------------------------------------------------------------
// Tests — API key path
// ---------------------------------------------------------------------------

describe("onboarding executor / api-key path", () => {
  test("verified key persists with the supplied provider + key", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { verifyApiKeyResult: true });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    const result: OnboardingResult = {
      method: "api-key", provider: CLAUDE, apiKey: "sk-verified", authChoiceId: "",
    };
    await exec.execute(result);

    expect(deps.calls.verifyApiKeyCalls).toEqual([["anthropic", "sk-verified"]]);
    expect(spy.persisted).toEqual([{
      provider: "anthropic", model: "claude",
      apiKey: "sk-verified", envKey: "ANTHROPIC_API_KEY",
      localModel: undefined,
    }]);
    expect(spy.modelsSet).toEqual(["claude"]);
    expect(spy.sessionModelsSet).toEqual(["claude"]);
    expect(spy.announcements.some((m) => m.includes("verified"))).toBe(true);
    expect(spy.announcements.some((m) => m.includes("Setup complete"))).toBe(true);
  });

  test("unverified key + no confirm surface → does NOT persist (safe default)", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { verifyApiKeyResult: false });
    // Host without a confirm() method — the non-interactive default.
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({
      method: "api-key", provider: CLAUDE, apiKey: "sk-unverified", authChoiceId: "",
    });

    expect(spy.persisted).toEqual([]);
    expect(spy.announcements.some((m) => m.includes("could not be verified"))).toBe(true);
    expect(spy.announcements.some((m) => m.toLowerCase().includes("cancelled"))).toBe(true);
  });

  test("unverified key + user confirms proceed → persists best-effort", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { verifyApiKeyResult: false });
    const host: OnboardingHost = {
      ...makeHost(spy),
      confirm: async (opts) => {
        spy.announcements.push(`[confirm] ${opts.title}`);
        return true;
      },
    };
    const exec = createOnboardingExecutor({ host, deps });

    await exec.execute({
      method: "api-key", provider: CLAUDE, apiKey: "sk-still-save", authChoiceId: "",
    });

    expect(spy.persisted).toHaveLength(1);
    expect(spy.persisted[0]!.apiKey).toBe("sk-still-save");
    expect(spy.announcements.some((m) => m.includes("[confirm]"))).toBe(true);
  });

  test("unverified key + user cancels → does NOT persist", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { verifyApiKeyResult: false });
    const host: OnboardingHost = {
      ...makeHost(spy),
      confirm: async () => false,
    };
    const exec = createOnboardingExecutor({ host, deps });

    await exec.execute({
      method: "api-key", provider: CLAUDE, apiKey: "sk-reject", authChoiceId: "",
    });

    expect(spy.persisted).toEqual([]);
    expect(spy.announcements.some((m) => m.toLowerCase().includes("cancelled"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — OAuth path
// ---------------------------------------------------------------------------

describe("onboarding executor / oauth path", () => {
  test("success persists the OAuth-returned key under the provider envKey", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { oauthConfig: FAKE_OAUTH_CONFIG, oauthKey: "sk-oauth-123" });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({
      method: "oauth", provider: OPENROUTER, authChoiceId: "openrouter-oauth", apiKey: "",
    });

    expect(spy.persisted[0]!.apiKey).toBe("sk-oauth-123");
    expect(spy.persisted[0]!.envKey).toBe("OPENROUTER_API_KEY");
    expect(spy.announcements.some((m) => m.includes("Authenticated successfully"))).toBe(true);
  });

  test("missing oauth config short-circuits without persisting", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { oauthConfig: undefined });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({
      method: "oauth", provider: OPENROUTER, authChoiceId: "openrouter-oauth", apiKey: "",
    });

    expect(spy.persisted).toEqual([]);
    expect(spy.announcements.some((m) => m.toLowerCase().includes("oauth"))).toBe(true);
  });

  test("OAuth flow failure surfaces the reason and does not persist", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { oauthConfig: FAKE_OAUTH_CONFIG, oauthThrow: true });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({
      method: "oauth", provider: OPENROUTER, authChoiceId: "openrouter-oauth", apiKey: "",
    });

    expect(spy.persisted).toEqual([]);
    expect(spy.announcements.some((m) => m.includes("auth callback timed out"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — Ollama path
// ---------------------------------------------------------------------------

describe("onboarding executor / ollama path", () => {
  test("ollama not running: announces + persists without a local model", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { ollamaRunning: false });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({ method: "ollama", provider: OLLAMA, apiKey: "", authChoiceId: "" });

    expect(spy.persisted[0]!.localModel).toBeUndefined();
    expect(spy.announcements.some((m) => m.includes("Ollama not detected"))).toBe(true);
  });

  test("ollama running but no models: persist without a local model", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { ollamaRunning: true, ollamaModels: [] });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({ method: "ollama", provider: OLLAMA, apiKey: "", authChoiceId: "" });

    expect(spy.persisted[0]!.localModel).toBeUndefined();
    expect(spy.announcements.some((m) => m.includes("no models"))).toBe(true);
  });

  test("single model auto-selects without invoking the picker", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { ollamaModels: ["llama3.2:latest"] });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({ method: "ollama", provider: OLLAMA, apiKey: "", authChoiceId: "" });

    expect(spy.pickCalls).toEqual([]);
    expect(spy.persisted[0]!.localModel).toBe("llama3.2:latest");
  });

  test("multiple models invoke the picker and persist the selection", async () => {
    const spy = makeSpy();
    spy.pickResult = "deepseek-coder:latest";
    const deps = makeDeps(spy, { ollamaModels: ["llama3", "deepseek-coder:latest", "mistral"] });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({ method: "ollama", provider: OLLAMA, apiKey: "", authChoiceId: "" });

    expect(spy.pickCalls).toHaveLength(1);
    expect(spy.pickCalls[0]!.optionValues).toEqual(["llama3", "deepseek-coder:latest", "mistral"]);
    expect(spy.persisted[0]!.localModel).toBe("deepseek-coder:latest");
  });

  test("picker cancellation persists without a local model", async () => {
    const spy = makeSpy();
    spy.pickResult = null;
    const deps = makeDeps(spy, { ollamaModels: ["llama3", "mistral"] });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({ method: "ollama", provider: OLLAMA, apiKey: "", authChoiceId: "" });

    expect(spy.persisted).toHaveLength(1);
    expect(spy.persisted[0]!.localModel).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — LM Studio path
// ---------------------------------------------------------------------------

describe("onboarding executor / lmstudio path", () => {
  test("running announces detection", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { lmstudioRunning: true });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({ method: "lmstudio", provider: LMSTUDIO, apiKey: "", authChoiceId: "" });

    expect(spy.announcements.some((m) => m.includes("LM Studio detected"))).toBe(true);
    expect(spy.persisted).toHaveLength(1);
  });

  test("not running announces the missing notice and still persists", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy, { lmstudioRunning: false });
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    await exec.execute({ method: "lmstudio", provider: LMSTUDIO, apiKey: "", authChoiceId: "" });

    expect(spy.announcements.some((m) => m.includes("LM Studio not detected"))).toBe(true);
    expect(spy.persisted).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests — "none" path (keyless non-Ollama providers)
// ---------------------------------------------------------------------------

describe("onboarding executor / none path", () => {
  test("persists with an empty api key + no local model", async () => {
    const spy = makeSpy();
    const deps = makeDeps(spy);
    const exec = createOnboardingExecutor({ host: makeHost(spy), deps });

    const keyless: ProviderOption = {
      id: "local-raw", name: "Keyless", envKey: "",
      model: "keyless", needsApiKey: false,
    };
    await exec.execute({ method: "none", provider: keyless, apiKey: "", authChoiceId: "" });

    expect(spy.persisted).toEqual([{
      provider: "local-raw", model: "keyless",
      apiKey: "", envKey: "", localModel: undefined,
    }]);
    expect(spy.modelsSet).toEqual(["keyless"]);
  });
});
