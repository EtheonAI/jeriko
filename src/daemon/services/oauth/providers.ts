// OAuth 2.0 provider configurations.
//
// Defines authorization endpoints, token endpoints, scopes, and env var mappings
// for each connector that supports OAuth. API-key-only connectors (Stripe, Twilio,
// PayPal) are not listed here — they continue using /auth.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthProvider {
  /** Internal name matching ConnectorDef.name (e.g. "github", "x"). */
  name: string;
  /** Human-readable label (e.g. "GitHub"). */
  label: string;
  /** OAuth 2.0 authorization endpoint. */
  authUrl: string;
  /** OAuth 2.0 token exchange endpoint. */
  tokenUrl: string;
  /** Scopes to request. */
  scopes: string[];
  /** Env var for OAuth client ID (e.g. "GITHUB_OAUTH_CLIENT_ID"). */
  clientIdVar: string;
  /** Env var for OAuth client secret. */
  clientSecretVar: string;
  /** Env var where the access token is saved (e.g. "GITHUB_TOKEN"). */
  tokenEnvVar: string;
  /** Env var for refresh token (services that issue them). */
  refreshTokenEnvVar?: string;
  /** Use PKCE (Proof Key for Code Exchange). Required by X/Twitter. */
  usePKCE?: boolean;
  /** Extra params to include in the token exchange POST. */
  extraTokenParams?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = [
  {
    name: "github",
    label: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user", "read:org"],
    clientIdVar: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretVar: "GITHUB_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "GITHUB_TOKEN",
  },
  {
    name: "x",
    label: "X (Twitter)",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "dm.read", "dm.write", "offline.access"],
    clientIdVar: "X_OAUTH_CLIENT_ID",
    clientSecretVar: "X_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "X_BEARER_TOKEN",
    refreshTokenEnvVar: "X_REFRESH_TOKEN",
    usePKCE: true,
  },
  {
    name: "gdrive",
    label: "Google Drive",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/drive"],
    clientIdVar: "GDRIVE_OAUTH_CLIENT_ID",
    clientSecretVar: "GDRIVE_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "GDRIVE_ACCESS_TOKEN",
    refreshTokenEnvVar: "GDRIVE_REFRESH_TOKEN",
    extraTokenParams: { access_type: "offline", prompt: "consent" },
  },
  {
    name: "onedrive",
    label: "OneDrive",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["Files.ReadWrite.All", "offline_access"],
    clientIdVar: "ONEDRIVE_OAUTH_CLIENT_ID",
    clientSecretVar: "ONEDRIVE_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "ONEDRIVE_ACCESS_TOKEN",
    refreshTokenEnvVar: "ONEDRIVE_REFRESH_TOKEN",
  },
  {
    name: "vercel",
    label: "Vercel",
    authUrl: "https://vercel.com/integrations/oauth/authorize",
    tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
    scopes: [],
    clientIdVar: "VERCEL_OAUTH_CLIENT_ID",
    clientSecretVar: "VERCEL_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "VERCEL_TOKEN",
  },
] as const;

/** Look up an OAuth provider by connector name. */
export function getOAuthProvider(name: string): OAuthProvider | undefined {
  return OAUTH_PROVIDERS.find((p) => p.name === name);
}

/** Check whether a connector supports OAuth (vs API-key-only). */
export function isOAuthCapable(name: string): boolean {
  return OAUTH_PROVIDERS.some((p) => p.name === name);
}
