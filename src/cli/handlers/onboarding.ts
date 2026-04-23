/**
 * Onboarding executor — runs the side-effect pipeline once the flow has
 * produced a typed {@link OnboardingResult}.
 *
 * Responsibilities (separated from the flow definition by design):
 *   1. API-key verification against the provider.
 *   2. OAuth browser flow (when the user picked an OAuth choice).
 *   3. Local-provider probing (Ollama running? model list? model pick?).
 *   4. LM Studio probing.
 *   5. Config + .env persistence via the existing {@link persistSetup}.
 *   6. Announcing progress + final summary through the host adapter.
 *   7. Switching the active model on the backend.
 *
 * Every external dependency is injected via {@link OnboardingExecutor}
 * options so this module is fully unit-testable without touching the real
 * network, file system, or wizard subsystem. Production callers pass the
 * live implementations; tests pass fakes.
 */

import type { ProviderOption } from "../lib/setup.js";
import type { OAuthConfig } from "../lib/provider-auth.js";
import type { OAuthFlowResult } from "../lib/oauth-flow.js";
import type { OnboardingResult } from "../flows/onboarding.js";
import type { PersistableOnboardingResult } from "./onboarding-persist.js";

// ---------------------------------------------------------------------------
// Host adapter — how the executor talks to the surrounding app
// ---------------------------------------------------------------------------

/**
 * Minimal surface the executor needs from its caller. Keeping this narrow
 * avoids an ambient dependency on the SystemCommandContext shape.
 */
export interface OnboardingHost {
  /** Print a user-visible status line (muted, green, warning, etc). */
  readonly announce: (message: string) => void;
  /** Switch the UI-tracked model immediately. */
  readonly setModel: (model: string) => void;
  /** Persist the model on whichever backend is active. */
  readonly updateSessionModel: (model: string) => Promise<void>;
  /**
   * Show an interactive single-select prompt and resolve with the chosen
   * value. Resolves with `null` if the user cancels. The executor uses this
   * for the Ollama model picker so the flow subsystem can own the UX.
   */
  readonly pickFromList: (opts: OnboardingPickOptions) => Promise<string | null>;
}

export interface OnboardingPickOptions {
  readonly title: string;
  readonly message: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
}

// ---------------------------------------------------------------------------
// External dependencies — injected for testability
// ---------------------------------------------------------------------------

export interface OnboardingDependencies {
  readonly verifyApiKey: (providerId: string, key: string) => Promise<boolean>;
  readonly verifyOllamaRunning: () => Promise<boolean>;
  readonly fetchOllamaModelList: () => Promise<string[]>;
  readonly verifyLMStudioRunning: () => Promise<boolean>;
  readonly runOAuthFlow: (cfg: OAuthConfig) => Promise<OAuthFlowResult>;
  readonly getOAuthConfig: (providerId: string) => OAuthConfig | undefined;
  readonly persistSetup: (result: PersistableOnboardingResult) => Promise<void>;
}

export interface OnboardingExecutor {
  readonly execute: (result: OnboardingResult) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Copy — centralized so wording stays consistent and translation-ready
// ---------------------------------------------------------------------------

export interface OnboardingCopy {
  readonly verifyingKey: string;
  readonly keyVerified: string;
  readonly keyUnverified: string;
  readonly openingBrowser: string;
  readonly authSucceeded: string;
  readonly authFailed: (reason: string) => string;
  readonly checkingOllama: string;
  readonly ollamaMissing: string;
  readonly ollamaNoModels: string;
  readonly ollamaUsing: (model: string) => string;
  readonly ollamaPickTitle: string;
  readonly ollamaPickMessage: (count: number) => string;
  readonly ollamaCancelled: string;
  readonly checkingLMStudio: string;
  readonly lmstudioDetected: string;
  readonly lmstudioMissing: string;
  readonly oauthUnavailable: string;
  readonly setupComplete: (provider: string, model: string) => string;
}

export const DEFAULT_ONBOARDING_COPY: OnboardingCopy = {
  verifyingKey: "Verifying API key…",
  keyVerified: "✓ API key verified",
  keyUnverified: "API key could not be verified (continuing anyway)",
  openingBrowser: "Opening browser for authentication…",
  authSucceeded: "✓ Authenticated successfully",
  authFailed: (reason) => `OAuth failed: ${reason}`,
  checkingOllama: "Checking Ollama…",
  ollamaMissing:
    "Ollama not detected.\n" +
    "  Install: https://ollama.com\n" +
    "  Then run: ollama pull llama3",
  ollamaNoModels:
    "Ollama is running but no models are installed.\n" +
    "  Run: ollama pull <model>\n" +
    "  Examples: llama3, deepseek-coder, mistral, qwen2",
  ollamaUsing: (model) => `✓ Ollama detected — using ${model}`,
  ollamaPickTitle: "Ollama Models",
  ollamaPickMessage: (count) => `${count} models found — choose one:`,
  ollamaCancelled: "Ollama model selection cancelled.",
  checkingLMStudio: "Checking LM Studio…",
  lmstudioDetected: "✓ LM Studio detected",
  lmstudioMissing:
    "LM Studio not detected.\n" +
    "  Download: https://lmstudio.ai\n" +
    "  Start LM Studio and load a model",
  oauthUnavailable: "OAuth is not configured for this provider.",
  setupComplete: (provider, model) =>
    `✓ Setup complete!\n  Provider: ${provider}\n  Model:    ${model}\n\nType a message to start chatting. Use /connect to add channels.`,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface OnboardingExecutorOptions {
  readonly host: OnboardingHost;
  readonly deps: OnboardingDependencies;
  readonly copy?: OnboardingCopy;
}

/**
 * Build an onboarding executor. All behaviour flows through the supplied
 * {@link OnboardingHost} + {@link OnboardingDependencies}; the executor
 * itself owns only the branching logic between the five methods.
 */
export function createOnboardingExecutor(opts: OnboardingExecutorOptions): OnboardingExecutor {
  const { host, deps } = opts;
  const copy = opts.copy ?? DEFAULT_ONBOARDING_COPY;

  const resolveApiKey = async (providerId: string, key: string): Promise<boolean> => {
    host.announce(copy.verifyingKey);
    const ok = await deps.verifyApiKey(providerId, key);
    host.announce(ok ? copy.keyVerified : copy.keyUnverified);
    return true;
  };

  const resolveOAuth = async (provider: ProviderOption): Promise<string | null> => {
    const oauthConfig = deps.getOAuthConfig(provider.id);
    if (oauthConfig === undefined) {
      host.announce(copy.oauthUnavailable);
      return null;
    }
    host.announce(copy.openingBrowser);
    try {
      const result = await deps.runOAuthFlow(oauthConfig);
      host.announce(copy.authSucceeded);
      return result.key;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      host.announce(copy.authFailed(message));
      return null;
    }
  };

  const resolveOllamaModel = async (): Promise<string | undefined> => {
    host.announce(copy.checkingOllama);
    const running = await deps.verifyOllamaRunning();
    if (!running) {
      host.announce(copy.ollamaMissing);
      return undefined;
    }

    const models = await deps.fetchOllamaModelList();
    if (models.length === 0) {
      host.announce(copy.ollamaNoModels);
      return undefined;
    }
    if (models.length === 1) {
      host.announce(copy.ollamaUsing(models[0]!));
      return models[0];
    }

    const picked = await host.pickFromList({
      title: copy.ollamaPickTitle,
      message: copy.ollamaPickMessage(models.length),
      options: models.map((m) => ({ value: m, label: m })),
    });
    if (picked === null) {
      host.announce(copy.ollamaCancelled);
      return undefined;
    }
    return picked;
  };

  const resolveLMStudio = async (): Promise<void> => {
    host.announce(copy.checkingLMStudio);
    const running = await deps.verifyLMStudioRunning();
    host.announce(running ? copy.lmstudioDetected : copy.lmstudioMissing);
  };

  return {
    async execute(result) {
      const { provider } = result;

      let apiKey = "";
      let localModel: string | undefined;

      switch (result.method) {
        case "api-key": {
          await resolveApiKey(provider.id, result.apiKey);
          apiKey = result.apiKey;
          break;
        }
        case "oauth": {
          const token = await resolveOAuth(provider);
          if (token === null) return;
          apiKey = token;
          break;
        }
        case "ollama": {
          localModel = await resolveOllamaModel();
          break;
        }
        case "lmstudio": {
          await resolveLMStudio();
          break;
        }
        case "none":
          break;
      }

      await deps.persistSetup({
        provider: provider.id,
        model: provider.model,
        apiKey,
        envKey: provider.envKey,
        localModel,
      });

      const displayModel = localModel ?? provider.model;
      host.setModel(provider.model);
      await host.updateSessionModel(provider.model);

      host.announce(copy.setupComplete(provider.name, displayModel));
    },
  };
}
