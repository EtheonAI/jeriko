/**
 * Onboarding flow — declarative replacement for the deleted Setup component.
 *
 * Two logical steps:
 *   1. Provider selection (select step, dynamic options from
 *      getProviderOptions()).
 *   2. API key entry (password step) — conditionally skipped for providers
 *      where `needsApiKey === false` (Ollama, local servers).
 *
 * The flow's `parseResults` rehydrates the chosen ProviderOption from the
 * raw id stored at step 0 — callers get a typed OnboardingResult, not a
 * string[].
 */

import type { ProviderOption } from "../lib/setup.js";
import { getProviderOptions, validateApiKey, MIN_API_KEY_LENGTH } from "../lib/setup.js";
import type { WizardFlow } from "./types.js";
import type { WizardStepResolver } from "../types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OnboardingResult {
  readonly provider: ProviderOption;
  /** Empty string when the provider does not require an API key. */
  readonly apiKey: string;
}

export interface OnboardingFlowOptions {
  readonly onComplete: (result: OnboardingResult) => void | Promise<void>;
  /**
   * Optional injection used by tests that don't want to depend on the real
   * driver presets registry. Defaults to live `getProviderOptions()`.
   */
  readonly providers?: readonly ProviderOption[];
}

// ---------------------------------------------------------------------------
// Step builders — isolated from the flow factory for testability
// ---------------------------------------------------------------------------

function providerSelectStep(providers: readonly ProviderOption[]): WizardStepResolver {
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

function providerHint(p: ProviderOption, isRecommended: boolean): string | undefined {
  if (!p.needsApiKey) return "no API key needed";
  if (isRecommended) return "recommended";
  return undefined;
}

/**
 * API key step: only rendered for providers where `needsApiKey` is true.
 * Returns `null` for providers that don't need one, which tells the Wizard
 * engine to skip the step (the empty-string placeholder fills results[1]).
 */
function apiKeyStep(
  providers: readonly ProviderOption[],
): WizardStepResolver {
  return (previous) => {
    const providerId = previous[0] ?? "";
    const provider = providers.find((p) => p.id === providerId);
    if (provider === undefined) return null;
    if (!provider.needsApiKey) return null;
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
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the onboarding WizardFlow. Callers inject their own onComplete
 * callback (typically `handleOnboardingComplete` in app.tsx) and, if
 * they want, a provider list for tests.
 */
export function createOnboardingFlow(opts: OnboardingFlowOptions): WizardFlow<OnboardingResult> {
  const providers = opts.providers ?? getProviderOptions();

  return {
    id: "onboarding",
    title: "Welcome to Jeriko",
    steps: [
      providerSelectStep(providers),
      apiKeyStep(providers),
    ],
    parseResults: (raw) => {
      const providerId = raw[0] ?? "";
      const provider = providers.find((p) => p.id === providerId);
      if (provider === undefined) {
        throw new Error(`Unknown provider id "${providerId}"`);
      }
      const apiKey = raw[1] ?? "";
      return { provider, apiKey };
    },
    onComplete: opts.onComplete,
  };
}
