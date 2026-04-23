/**
 * Onboarding flow — declarative first-launch provider setup.
 *
 * The flow models the *interactive* slice only. Side effects (API-key
 * verification, OAuth browser dance, Ollama model detection,
 * config/.env persistence) live in the caller's `onComplete` handler
 * because they require async I/O that the wizard engine itself does not
 * (and should not) know about.
 *
 * Step layout (stable positional indices after the engine compacts skipped
 * resolvers):
 *   0. Provider select   — always rendered.
 *   1. Either auth-method select OR api-key password, depending on
 *      whether the chosen provider exposes multiple auth choices.
 *   2. api-key password  — rendered only after a multi-auth picker when
 *      the user picked the api-key option.
 *
 * `parseResults` consumes the compacted answer array and produces a typed
 * {@link OnboardingResult} carrying the resolved method so the caller can
 * switch on `result.method` without re-deriving anything.
 */

import type { ProviderOption } from "../lib/setup.js";
import { getProviderOptions, validateApiKey, MIN_API_KEY_LENGTH } from "../lib/setup.js";
import { getAvailableAuthChoices, type AuthChoice, type AuthMethod } from "../lib/provider-auth.js";
import type { WizardFlow } from "./types.js";
import type { WizardStep, WizardStepResolver } from "../types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * How the onboarding flow resolved authentication for the chosen provider.
 *
 *   - "api-key":  user entered a key (single-auth path, or multi-auth
 *                 api-key branch).
 *   - "oauth":    user picked an OAuth-PKCE choice in the multi-auth
 *                 picker; caller must execute the browser flow.
 *   - "ollama":   provider id === "local"; caller must detect Ollama +
 *                 (optionally) prompt for a model.
 *   - "lmstudio": provider id === "lmstudio"; caller must detect the
 *                 server.
 *   - "none":     provider does not require authentication (rare —
 *                 reserved for future non-Ollama keyless providers).
 */
export type OnboardingMethod = "api-key" | "oauth" | "ollama" | "lmstudio" | "none";

/**
 * Typed result emitted to `onComplete` after the wizard finishes.
 * `apiKey` is always present (empty string when the path doesn't prompt
 * for a key) so consumers can read it without a type narrow.
 * `authChoiceId` is only non-empty for multi-auth providers.
 */
export interface OnboardingResult {
  readonly method: OnboardingMethod;
  readonly provider: ProviderOption;
  readonly apiKey: string;
  readonly authChoiceId: string;
}

export interface OnboardingFlowOptions {
  readonly onComplete: (result: OnboardingResult) => void | Promise<void>;
  /**
   * Whether the daemon socket is reachable. Controls which OAuth choices
   * are offered — relay-backed OAuth (OpenRouter) requires the daemon.
   * Defaults to `false` so tests and in-process mode get the safe subset.
   */
  readonly daemonAvailable?: boolean;
  /**
   * Optional injection used by tests that don't want to depend on the
   * live driver presets registry. Defaults to {@link getProviderOptions}.
   */
  readonly providers?: readonly ProviderOption[];
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for testability
// ---------------------------------------------------------------------------

/**
 * Does this provider render an auth-method picker in the flow? True only
 * when the provider exposes more than one auth choice (e.g. OpenRouter:
 * OAuth or API key). Keyless providers and single-auth providers do not
 * render the picker.
 */
export function hasMultiAuth(
  provider: ProviderOption,
  daemonAvailable: boolean,
): boolean {
  if (provider.id === "local" || provider.id === "lmstudio") return false;
  if (!provider.needsApiKey) return false;
  const choices = getAvailableAuthChoices(provider.id, daemonAvailable);
  return (choices?.length ?? 0) > 1;
}

/**
 * Derive the final auth method from the accumulated answers.
 * Returns `null` only when the provider id is unknown — callers should
 * treat that as a programmer error.
 */
export function resolveOnboardingMethod(
  providerId: string,
  authChoiceId: string,
  providers: readonly ProviderOption[],
  daemonAvailable: boolean,
): OnboardingMethod | null {
  const provider = providers.find((p) => p.id === providerId);
  if (provider === undefined) return null;

  if (provider.id === "local") return "ollama";
  if (provider.id === "lmstudio") return "lmstudio";

  if (hasMultiAuth(provider, daemonAvailable)) {
    const choices = getAvailableAuthChoices(provider.id, daemonAvailable)!;
    const picked = choices.find((c) => c.id === authChoiceId);
    const method: AuthMethod | undefined = picked?.method;
    return method === "oauth-pkce" ? "oauth" : "api-key";
  }

  return provider.needsApiKey ? "api-key" : "none";
}

// ---------------------------------------------------------------------------
// Step builders
// ---------------------------------------------------------------------------

function providerSelectStep(providers: readonly ProviderOption[]): WizardStep {
  return {
    type: "select",
    message: "Choose your AI provider:",
    options: providers.map((p, i) => ({
      value: p.id,
      label: p.name,
      hint: providerHint(p, i === 0),
    })),
  };
}

function providerHint(p: ProviderOption, isFirst: boolean): string | undefined {
  if (!p.needsApiKey) return "no API key needed";
  if (isFirst) return "recommended";
  return undefined;
}

function apiKeyPasswordStep(provider: ProviderOption): WizardStep {
  return {
    type: "password",
    message: `Enter your ${provider.name} API key:`,
    validate: (v) => {
      const trimmed = v.trim();
      if (trimmed.length === 0) return "API key is required";
      if (trimmed.length < MIN_API_KEY_LENGTH) {
        return `API key must be at least ${MIN_API_KEY_LENGTH} characters`;
      }
      if (!validateApiKey(trimmed)) return "API key must not contain whitespace";
      return undefined;
    },
  };
}

/**
 * Step 1 — resolves to whichever prompt the selected provider actually
 * needs next:
 *   - multi-auth provider  → auth-method select
 *   - single-auth provider → api-key password
 *   - keyless provider     → null (skip)
 */
function authOrApiKeyStep(
  providers: readonly ProviderOption[],
  daemonAvailable: boolean,
): WizardStepResolver {
  return (previous) => {
    const providerId = previous[0] ?? "";
    const provider = providers.find((p) => p.id === providerId);
    if (provider === undefined) return null;
    if (provider.id === "local" || provider.id === "lmstudio") return null;
    if (!provider.needsApiKey) return null;

    if (hasMultiAuth(provider, daemonAvailable)) {
      const choices = getAvailableAuthChoices(provider.id, daemonAvailable)!;
      return {
        type: "select",
        message: `How would you like to authenticate ${provider.name}?`,
        options: choices.map((c: AuthChoice) => ({
          value: c.id,
          label: c.label,
          hint: c.hint,
        })),
      };
    }

    return apiKeyPasswordStep(provider);
  };
}

/**
 * Step 2 — renders a password prompt only after a multi-auth picker when
 * the user chose the api-key branch. Otherwise null.
 */
function postMultiAuthApiKeyStep(
  providers: readonly ProviderOption[],
  daemonAvailable: boolean,
): WizardStepResolver {
  return (previous) => {
    const providerId = previous[0] ?? "";
    const authChoiceId = previous[1] ?? "";
    const provider = providers.find((p) => p.id === providerId);
    if (provider === undefined) return null;
    if (!hasMultiAuth(provider, daemonAvailable)) return null;

    const method = resolveOnboardingMethod(providerId, authChoiceId, providers, daemonAvailable);
    if (method !== "api-key") return null;

    return apiKeyPasswordStep(provider);
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the onboarding WizardFlow. The caller supplies the typed
 * `onComplete` — that is the single seam where all async side effects
 * (verification, OAuth, persistence) run.
 */
export function createOnboardingFlow(opts: OnboardingFlowOptions): WizardFlow<OnboardingResult> {
  const providers = opts.providers ?? getProviderOptions();
  const daemonAvailable = opts.daemonAvailable ?? false;

  return {
    id: "onboarding",
    title: "Welcome to Jeriko",
    steps: [
      providerSelectStep(providers),
      authOrApiKeyStep(providers, daemonAvailable),
      postMultiAuthApiKeyStep(providers, daemonAvailable),
    ],
    parseResults: (raw): OnboardingResult => {
      // The wizard engine compacts `raw` — dynamic steps that resolved to
      // null leave no slot in the answer array. `raw[1]` is therefore
      // either the auth-method pick (multi-auth path) or the api key
      // (single-auth path). We disambiguate by asking the provider
      // directly rather than trusting positional indices.
      const providerId = raw[0] ?? "";
      const provider = providers.find((p) => p.id === providerId);
      if (provider === undefined) {
        throw new Error(`Unknown provider id "${providerId}"`);
      }

      const multiAuth = hasMultiAuth(provider, daemonAvailable);
      const authChoiceId = multiAuth ? (raw[1] ?? "") : "";
      const apiKey = multiAuth ? (raw[2] ?? "") : (raw[1] ?? "");

      const method = resolveOnboardingMethod(providerId, authChoiceId, providers, daemonAvailable);
      if (method === null) {
        throw new Error(`Cannot resolve onboarding method for provider "${providerId}"`);
      }

      return { method, provider, apiKey, authChoiceId };
    },
    onComplete: opts.onComplete,
  };
}
