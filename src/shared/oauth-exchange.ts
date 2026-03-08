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

/** Provider-specific configuration for OAuth flows (auth URL building + token exchange). */
export interface TokenExchangeProvider {
  /** Provider name (matches OAuthProvider.name). */
  name: string;
  /** OAuth 2.0 authorization endpoint (where the browser is sent). */
  authUrl: string;
  /** OAuth 2.0 token exchange endpoint. */
  tokenUrl: string;
  /** Scopes to request. Joined by scopeSeparator (default: space per RFC 6749). */
  scopes: string[];
  /**
   * Separator for joining scopes in the authorization URL.
   * Most providers use " " (space, per RFC 6749). Meta APIs (Instagram, Threads)
   * use "," (comma). Default: " ".
   */
  scopeSeparator?: string;
  /** Whether to use PKCE (RFC 7636). Required by X/Twitter, Vercel, Airtable. */
  usePKCE?: boolean;
  /**
   * How to authenticate the token exchange request.
   * - "body" (default): Send client_id + client_secret in the POST body.
   * - "basic": Send client_secret as HTTP Basic auth (Stripe-style).
   */
  tokenExchangeAuth: "body" | "basic";
  /** Extra params to include in the authorization URL (e.g. access_type, prompt). */
  extraAuthParams?: Record<string, string>;
  /** Extra params to include in the token exchange POST. */
  extraTokenParams?: Record<string, string>;
  /**
   * If true, omit `response_type=code` from the authorization URL.
   * Most OAuth 2.0 providers require it, but Stripe Apps does not —
   * their authorize endpoint only expects client_id, redirect_uri, and state.
   */
  skipResponseType?: boolean;
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
export const TOKEN_EXCHANGE_PROVIDERS: ReadonlyMap<string, TokenExchangeProvider> = new Map<string, TokenExchangeProvider>([
  ["stripe", {
    name: "stripe",
    authUrl: "https://connect.stripe.com/oauth/authorize",
    tokenUrl: "https://connect.stripe.com/oauth/token",
    scopes: ["read_write"],
    tokenExchangeAuth: "basic",
  }],
  ["github", {
    name: "github",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user", "read:org"],
    tokenExchangeAuth: "body",
  }],
  ["x", {
    name: "x",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "dm.read", "dm.write", "offline.access"],
    usePKCE: true,
    tokenExchangeAuth: "body",
  }],
  ["gdrive", {
    name: "gdrive",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/drive"],
    tokenExchangeAuth: "body",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    extraTokenParams: { access_type: "offline", prompt: "consent" },
  }],
  ["vercel", {
    name: "vercel",
    authUrl: "https://vercel.com/oauth/authorize",
    tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
    scopes: [],
    usePKCE: true,
    tokenExchangeAuth: "body",
  }],
  ["gmail", {
    name: "gmail",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send"],
    tokenExchangeAuth: "body",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    extraTokenParams: { access_type: "offline", prompt: "consent" },
  }],
  ["hubspot", {
    name: "hubspot",
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.companies.read", "crm.objects.companies.write", "crm.objects.deals.read", "crm.objects.deals.write", "crm.objects.owners.read", "crm.objects.quotes.read", "crm.objects.quotes.write", "crm.objects.products.read", "crm.objects.products.write", "crm.objects.invoices.read", "crm.objects.invoices.write", "crm.objects.orders.read", "crm.objects.orders.write", "crm.lists.read", "crm.lists.write", "crm.import", "crm.export", "oauth", "conversations.read", "conversations.write"],
    tokenExchangeAuth: "body",
  }],
  ["shopify", {
    name: "shopify",
    authUrl: "https://{shop}.myshopify.com/admin/oauth/authorize",
    tokenUrl: "https://{shop}.myshopify.com/admin/oauth/access_token",
    scopes: ["read_products", "write_products", "read_orders", "write_orders", "read_customers", "write_customers", "read_inventory", "write_inventory"],
    tokenExchangeAuth: "body",
    skipResponseType: true,
  }],
  ["instagram", {
    name: "instagram",
    authUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments", "instagram_business_content_publish"],
    scopeSeparator: ",",
    tokenExchangeAuth: "body",
  }],
  ["threads", {
    name: "threads",
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: ["threads_basic", "threads_content_publish", "threads_manage_insights", "threads_manage_replies", "threads_read_replies"],
    scopeSeparator: ",",
    tokenExchangeAuth: "body",
  }],
  ["square", {
    name: "square",
    authUrl: "https://connect.squareup.com/oauth2/authorize",
    tokenUrl: "https://connect.squareup.com/oauth2/token",
    scopes: ["PAYMENTS_READ", "PAYMENTS_WRITE", "ORDERS_READ", "ORDERS_WRITE", "CUSTOMERS_READ", "CUSTOMERS_WRITE", "ITEMS_READ", "ITEMS_WRITE", "INVENTORY_READ", "INVENTORY_WRITE", "MERCHANT_PROFILE_READ"],
    tokenExchangeAuth: "body",
  }],
  ["gitlab", {
    name: "gitlab",
    authUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    scopes: ["api", "read_user", "read_repository"],
    tokenExchangeAuth: "body",
  }],
  ["notion", {
    name: "notion",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    tokenExchangeAuth: "basic",
  }],
  ["linear", {
    name: "linear",
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scopes: ["read", "write", "issues:create", "comments:create"],
    tokenExchangeAuth: "body",
  }],
  ["jira", {
    name: "jira",
    authUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: ["read:jira-work", "write:jira-work", "read:jira-user", "offline_access"],
    tokenExchangeAuth: "body",
    extraAuthParams: { audience: "api.atlassian.com", prompt: "consent" },
  }],
  ["airtable", {
    name: "airtable",
    authUrl: "https://airtable.com/oauth2/v1/authorize",
    tokenUrl: "https://airtable.com/oauth2/v1/token",
    scopes: ["data.records:read", "data.records:write", "schema.bases:read", "schema.bases:write"],
    usePKCE: true,
    tokenExchangeAuth: "body",
  }],
  ["asana", {
    name: "asana",
    authUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    scopes: ["default"],
    tokenExchangeAuth: "body",
  }],
  ["mailchimp", {
    name: "mailchimp",
    authUrl: "https://login.mailchimp.com/oauth2/authorize",
    tokenUrl: "https://login.mailchimp.com/oauth2/token",
    scopes: [],
    tokenExchangeAuth: "body",
  }],
  ["dropbox", {
    name: "dropbox",
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scopes: ["files.metadata.read", "files.metadata.write", "files.content.read", "files.content.write", "sharing.read", "sharing.write", "account_info.read"],
    tokenExchangeAuth: "body",
    extraAuthParams: { token_access_type: "offline" },
  }],
  ["discord", {
    name: "discord",
    authUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scopes: ["bot", "guilds", "guilds.members.read", "messages.read"],
    tokenExchangeAuth: "body",
  }],
]);

// ---------------------------------------------------------------------------
// Auth URL building (used by relay to build auth URLs directly)
// ---------------------------------------------------------------------------

/** Result of building an authorization URL. Includes PKCE verifier if applicable. */
export interface AuthorizationUrlResult {
  /** Full authorization URL to redirect the browser to. */
  url: string;
  /** PKCE code verifier (must be stored and sent during token exchange). */
  codeVerifier?: string;
}

/**
 * Build an OAuth authorization URL for a provider.
 *
 * Used by the relay to build auth URLs directly — the relay owns the client IDs
 * (as CF Worker secrets), so the daemon doesn't need baked-in client IDs.
 *
 * @param provider    Provider config from TOKEN_EXCHANGE_PROVIDERS
 * @param clientId    OAuth client ID (from relay env secrets)
 * @param redirectUri Callback URL (e.g. https://bot.jeriko.ai/oauth/:provider/callback)
 * @param state       Composite state token (userId.sessionToken)
 * @param context     Provider-specific context. Used to resolve authUrl placeholders like {shop} for Shopify.
 */
export async function buildAuthorizationUrl(
  provider: TokenExchangeProvider,
  clientId: string,
  redirectUri: string,
  state: string,
  context?: Record<string, string>,
): Promise<AuthorizationUrlResult> {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  // Most OAuth 2.0 providers require response_type=code.
  // Stripe Apps is an exception — their authorize endpoint rejects it.
  if (!provider.skipResponseType) {
    params.set("response_type", "code");
  }

  if (provider.scopes.length > 0) {
    params.set("scope", provider.scopes.join(provider.scopeSeparator ?? " "));
  }

  // PKCE for providers that require it.
  // Note: PKCE generation is synchronous here (uses node:crypto).
  // The CF Worker relay calls this function — CF Workers support node:crypto
  // via the nodejs_compat compatibility flag.
  let codeVerifier: string | undefined;
  if (provider.usePKCE) {
    const crypto = await import("node:crypto");
    codeVerifier = crypto.randomBytes(32).toString("base64url").replace(/[^a-zA-Z0-9\-._~]/g, "").slice(0, 128);
    const challenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }

  // Extra auth params (e.g. access_type=offline, prompt=consent)
  if (provider.extraAuthParams) {
    for (const [key, value] of Object.entries(provider.extraAuthParams)) {
      params.set(key, value);
    }
  }

  // Resolve provider-specific placeholders in authUrl (e.g. {shop} for Shopify)
  let authUrl = provider.authUrl;
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      authUrl = authUrl.replace(`{${key}}`, value);
    }
  }

  return {
    url: `${authUrl}?${params.toString()}`,
    codeVerifier,
  };
}

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

  if (provider.extraTokenParams) {
    for (const [key, value] of Object.entries(provider.extraTokenParams)) {
      params[key] = value;
    }
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
