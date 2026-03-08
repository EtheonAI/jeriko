/**
 * Provider Auth — Authentication method definitions for each AI provider.
 *
 * Each provider defines one or more auth methods (OAuth, API key, local).
 * The onboarding wizard uses this to determine what to ask the user.
 *
 * Mirrors OpenClaw's auth-choice pattern: providers that support OAuth
 * offer it as the primary option with API key as fallback.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported authentication methods for AI providers. */
export type AuthMethod = "oauth-pkce" | "api-key" | "local";


/** A single auth choice offered to the user. */
export interface AuthChoice {
  /** Unique identifier for this auth method. */
  id: string;
  /** Display label in the wizard. */
  label: string;
  /** Short hint shown beside the option. */
  hint?: string;
  /** The auth method type. */
  method: AuthMethod;
}

/** OAuth configuration for providers that support it. */
export interface OAuthConfig {
  /** Authorization URL to open in the browser. */
  authUrl: string;
  /** Token/key exchange URL (POST). */
  tokenUrl: string;
  /** OAuth client ID (or env var to read it from). */
  clientId: string;
  /** Scopes to request (space-separated). */
  scopes?: string;
  /** Whether the flow uses PKCE (code_challenge). */
  pkce: boolean;
  /** Custom parameters for the auth URL. */
  extraAuthParams?: Record<string, string>;
  /**
   * Response field containing the API key/token.
   * Default: "key" (OpenRouter), "access_token" (standard OAuth).
   */
  responseKeyField?: string;
  /** The env var to store the resulting key in. */
  envKey: string;
  /**
   * Fixed callback port required by the provider.
   * Some providers only allow specific ports for callback URLs.
   */
  callbackPort?: number;
  /**
   * Use the relay (bot.jeriko.ai) as the callback URL.
   * For providers that require HTTPS on specific ports (443/3000).
   * The relay receives the callback and forwards to the daemon via WebSocket.
   */
  useRelay?: boolean;
  /** Provider name for relay routing (e.g. "openrouter"). Required when useRelay is true. */
  relayProvider?: string;
}

/** Full auth definition for a provider. */
export interface ProviderAuthDef {
  /** Provider ID (matches preset ID or built-in ID). */
  providerId: string;
  /** Available auth choices, ordered by preference. */
  choices: readonly AuthChoice[];
  /** OAuth config (only for providers with an OAuth choice). */
  oauth?: OAuthConfig;
}

// ---------------------------------------------------------------------------
// Auth definitions — providers with OAuth support
// ---------------------------------------------------------------------------

const OPENROUTER_AUTH: ProviderAuthDef = {
  providerId: "openrouter",
  choices: [
    {
      id: "openrouter-oauth",
      label: "Sign in with OpenRouter",
      hint: "opens browser, no API key needed",
      method: "oauth-pkce",
    },
    {
      id: "openrouter-api-key",
      label: "API key",
      hint: "paste from openrouter.ai/keys",
      method: "api-key",
    },
  ],
  oauth: {
    authUrl: "https://openrouter.ai/auth",
    tokenUrl: "https://openrouter.ai/api/v1/auth/keys",
    clientId: "jeriko",
    pkce: true,
    responseKeyField: "key",
    envKey: "OPENROUTER_API_KEY",
    useRelay: true, // OpenRouter requires HTTPS on port 443 or 3000 — use relay
    relayProvider: "openrouter",
  },
};

const GOOGLE_AUTH: ProviderAuthDef = {
  providerId: "google",
  choices: [
    {
      id: "google-api-key",
      label: "API key",
      hint: "paste from aistudio.google.com",
      method: "api-key",
    },
  ],
};

const HUGGINGFACE_AUTH: ProviderAuthDef = {
  providerId: "huggingface",
  choices: [
    {
      id: "hf-api-key",
      label: "Access token",
      hint: "paste from huggingface.co/settings/tokens",
      method: "api-key",
    },
  ],
};

const GITHUB_MODELS_AUTH: ProviderAuthDef = {
  providerId: "github-models",
  choices: [
    {
      id: "github-models-api-key",
      label: "Personal access token",
      hint: "paste from github.com/settings/tokens",
      method: "api-key",
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Auth definitions for providers that have custom auth flows.
 * Providers not in this map default to simple API key entry.
 */
const AUTH_REGISTRY = new Map<string, ProviderAuthDef>([
  ["openrouter", OPENROUTER_AUTH],
  ["google", GOOGLE_AUTH],
  ["huggingface", HUGGINGFACE_AUTH],
  ["github-models", GITHUB_MODELS_AUTH],
]);

/**
 * Get the auth definition for a provider.
 * Returns undefined if the provider uses the default API key flow.
 */
export function getProviderAuth(providerId: string): ProviderAuthDef | undefined {
  return AUTH_REGISTRY.get(providerId);
}

/**
 * Check if a provider supports OAuth.
 */
export function hasOAuth(providerId: string): boolean {
  const def = AUTH_REGISTRY.get(providerId);
  return def?.choices.some((c) => c.method === "oauth-pkce") ?? false;
}

/**
 * Get the OAuth config for a provider.
 * Returns undefined if the provider doesn't support OAuth.
 */
export function getOAuthConfig(providerId: string): OAuthConfig | undefined {
  return AUTH_REGISTRY.get(providerId)?.oauth;
}

/**
 * Get available auth choices for a provider, filtered by daemon availability.
 *
 * OAuth flows that require the relay (useRelay: true) need the daemon running
 * to receive the callback. When the daemon is unavailable, these choices are
 * filtered out so the user isn't offered an option that will fail.
 *
 * @returns Filtered auth choices. If no auth def exists, returns undefined
 *          (caller should fall through to default API key flow).
 */
export function getAvailableAuthChoices(
  providerId: string,
  daemonAvailable: boolean,
): readonly AuthChoice[] | undefined {
  const authDef = AUTH_REGISTRY.get(providerId);
  if (!authDef) return undefined;

  if (daemonAvailable) return authDef.choices;

  // Filter out OAuth choices that depend on the relay/daemon
  const oauthConfig = authDef.oauth;
  const filtered = authDef.choices.filter((choice) => {
    if (choice.method !== "oauth-pkce") return true;
    // Keep OAuth if it doesn't use the relay (local callback works without daemon)
    return oauthConfig ? !oauthConfig.useRelay : false;
  });

  return filtered.length > 0 ? filtered : undefined;
}
