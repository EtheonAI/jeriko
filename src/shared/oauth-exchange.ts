// OAuth code→token exchange — shared logic for relay servers.
//
// This module is used by both relay implementations (Bun + CF Worker) to
// exchange an authorization code for tokens when the relay holds the client
// secret. The daemon only needs this for self-hosted mode (direct exchange).
//
// Provider-specific token exchange details (URL, auth method, extra params)
// are defined here as a single source of truth, mirroring the relevant subset
// of the daemon's OAuthProvider definitions.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Provider-specific configuration for token exchange. */
export interface TokenExchangeProvider {
  /** Provider name (matches OAuthProvider.name). */
  name: string;
  /** OAuth 2.0 token exchange endpoint. */
  tokenUrl: string;
  /**
   * How to authenticate the token exchange request.
   * - "body" (default): Send client_id + client_secret in the POST body.
   * - "basic": Send client_secret as HTTP Basic auth (Stripe-style).
   */
  tokenExchangeAuth: "body" | "basic";
  /** Extra params to include in the token exchange POST (e.g. access_type). */
  extraTokenParams?: Record<string, string>;
}

/** Result of a successful token exchange. */
export interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  tokenType?: string;
}

/** Options for exchangeCodeForTokens(). */
export interface ExchangeOptions {
  provider: TokenExchangeProvider;
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  codeVerifier?: string;
  /** Provider-specific context. Used to resolve tokenUrl placeholders like {shop} for Shopify. */
  context?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Provider exchange configurations (single source of truth)
// ---------------------------------------------------------------------------

/**
 * Token exchange configurations for all OAuth providers.
 *
 * This map mirrors the token exchange fields from the daemon's OAuthProvider
 * definitions. It's kept separate because the relay doesn't need (and shouldn't
 * import) the full daemon provider module.
 */
export const TOKEN_EXCHANGE_PROVIDERS: ReadonlyMap<string, TokenExchangeProvider> = new Map([
  ["stripe", {
    name: "stripe",
    tokenUrl: "https://api.stripe.com/v1/oauth/token",
    tokenExchangeAuth: "basic",
  }],
  ["github", {
    name: "github",
    tokenUrl: "https://github.com/login/oauth/access_token",
    tokenExchangeAuth: "body",
  }],
  ["x", {
    name: "x",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    tokenExchangeAuth: "body",
  }],
  ["gdrive", {
    name: "gdrive",
    tokenUrl: "https://oauth2.googleapis.com/token",
    tokenExchangeAuth: "body",
    extraTokenParams: { access_type: "offline", prompt: "consent" },
  }],
  ["onedrive", {
    name: "onedrive",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    tokenExchangeAuth: "body",
  }],
  ["vercel", {
    name: "vercel",
    tokenUrl: "https://api.vercel.com/login/oauth/token",
    tokenExchangeAuth: "body",
  }],
  ["gmail", {
    name: "gmail",
    tokenUrl: "https://oauth2.googleapis.com/token",
    tokenExchangeAuth: "body",
    extraTokenParams: { access_type: "offline", prompt: "consent" },
  }],
  ["outlook", {
    name: "outlook",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    tokenExchangeAuth: "body",
  }],
  ["hubspot", {
    name: "hubspot",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    tokenExchangeAuth: "body",
  }],
  ["shopify", {
    name: "shopify",
    tokenUrl: "https://{shop}.myshopify.com/admin/oauth/access_token",
    tokenExchangeAuth: "body",
  }],
  ["square", {
    name: "square",
    tokenUrl: "https://connect.squareup.com/oauth2/token",
    tokenExchangeAuth: "body",
  }],
  ["gitlab", {
    name: "gitlab",
    tokenUrl: "https://gitlab.com/oauth/token",
    tokenExchangeAuth: "body",
  }],
  ["digitalocean", {
    name: "digitalocean",
    tokenUrl: "https://cloud.digitalocean.com/v1/oauth/token",
    tokenExchangeAuth: "body",
  }],
  ["notion", {
    name: "notion",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    tokenExchangeAuth: "basic",
  }],
  ["linear", {
    name: "linear",
    tokenUrl: "https://api.linear.app/oauth/token",
    tokenExchangeAuth: "body",
  }],
  ["jira", {
    name: "jira",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    tokenExchangeAuth: "body",
  }],
  ["airtable", {
    name: "airtable",
    tokenUrl: "https://airtable.com/oauth2/v1/token",
    tokenExchangeAuth: "body",
  }],
  ["asana", {
    name: "asana",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    tokenExchangeAuth: "body",
  }],
  ["mailchimp", {
    name: "mailchimp",
    tokenUrl: "https://login.mailchimp.com/oauth2/token",
    tokenExchangeAuth: "body",
  }],
  ["dropbox", {
    name: "dropbox",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    tokenExchangeAuth: "body",
  }],
  ["salesforce", {
    name: "salesforce",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    tokenExchangeAuth: "body",
  }],
]);

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

/**
 * Exchange an OAuth authorization code for access/refresh tokens.
 *
 * Handles provider-specific auth methods:
 *   - "body": client_id + client_secret in the POST body (most providers)
 *   - "basic": HTTP Basic auth with client_secret as username (Stripe)
 *
 * @throws Error if the token exchange fails (HTTP error or no access_token)
 */
export async function exchangeCodeForTokens(opts: ExchangeOptions): Promise<TokenExchangeResult> {
  const { provider, code, redirectUri, clientId, clientSecret, codeVerifier } = opts;
  const useBasicAuth = provider.tokenExchangeAuth === "basic";

  // Build token exchange parameters
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };

  if (!useBasicAuth) {
    params.client_id = clientId;
    params.client_secret = clientSecret;
  }

  if (codeVerifier) {
    params.code_verifier = codeVerifier;
  }

  // Build request headers
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (useBasicAuth) {
    // Stripe-style: secret key as Basic auth username, empty password.
    // Use btoa() for cross-runtime compatibility (works in Node, Bun, and CF Workers).
    headers.Authorization = `Basic ${btoa(clientSecret + ":")}`;
  }

  // Resolve provider-specific placeholders in tokenUrl (e.g. {shop} for Shopify)
  let tokenUrl = provider.tokenUrl;
  if (opts.context) {
    for (const [key, value] of Object.entries(opts.context)) {
      tokenUrl = tokenUrl.replace(`{${key}}`, value);
    }
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Token exchange failed for ${provider.name}: HTTP ${response.status} — ${body.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = data.access_token as string | undefined;

  if (!accessToken) {
    throw new Error(
      `Token exchange returned no access_token for ${provider.name} (keys: ${Object.keys(data).join(", ")})`,
    );
  }

  return {
    accessToken,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    scope: data.scope as string | undefined,
    tokenType: data.token_type as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/** Options for refreshAccessToken(). */
export interface RefreshOptions {
  provider: TokenExchangeProvider;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}

/**
 * Refresh an OAuth access token using a refresh token.
 *
 * @throws Error if the refresh fails
 */
export async function refreshAccessToken(opts: RefreshOptions): Promise<TokenExchangeResult> {
  const { provider, refreshToken, clientId, clientSecret, scope } = opts;
  const useBasicAuth = provider.tokenExchangeAuth === "basic";

  const params: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };

  if (!useBasicAuth) {
    params.client_id = clientId;
    params.client_secret = clientSecret;
  }

  if (scope) {
    params.scope = scope;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (useBasicAuth) {
    headers.Authorization = `Basic ${btoa(clientSecret + ":")}`;
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Token refresh failed for ${provider.name}: HTTP ${response.status} — ${body.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = data.access_token as string | undefined;

  if (!accessToken) {
    throw new Error(
      `Token refresh returned no access_token for ${provider.name}`,
    );
  }

  return {
    accessToken,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    scope: data.scope as string | undefined,
    tokenType: data.token_type as string | undefined,
  };
}
