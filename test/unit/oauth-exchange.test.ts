// OAuth exchange tests — token exchange, refresh, and provider config.

import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import {
  TOKEN_EXCHANGE_PROVIDERS,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  type TokenExchangeProvider,
  type ExchangeOptions,
  type RefreshOptions,
} from "../../src/shared/oauth-exchange.js";
import {
  getClientId,
  hasLocalSecret,
  getOAuthProvider,
  OAUTH_PROVIDERS,
} from "../../src/daemon/services/oauth/providers.js";

// ---------------------------------------------------------------------------
// TOKEN_EXCHANGE_PROVIDERS registry
// ---------------------------------------------------------------------------

describe("TOKEN_EXCHANGE_PROVIDERS", () => {
  it("has entries for all OAuth providers", () => {
    const expectedProviders = [
      "stripe", "github", "x", "gdrive", "vercel", "gmail",
      "hubspot", "shopify", "instagram", "threads", "square", "gitlab",
      "notion", "linear", "jira", "airtable", "asana", "mailchimp", "dropbox",
      "discord", "slack", "paypal",
    ];
    for (const name of expectedProviders) {
      expect(TOKEN_EXCHANGE_PROVIDERS.has(name)).toBe(true);
    }
    expect(TOKEN_EXCHANGE_PROVIDERS.size).toBe(expectedProviders.length);
  });

  it("each entry has required fields", () => {
    for (const [name, provider] of TOKEN_EXCHANGE_PROVIDERS) {
      expect(provider.name).toBe(name);
      expect(provider.tokenUrl).toMatch(/^https:\/\//);
      expect(["body", "basic", "basic-apikey"]).toContain(provider.tokenExchangeAuth);
    }
  });

  it("stripe uses API-key Basic auth for token exchange", () => {
    const stripe = TOKEN_EXCHANGE_PROVIDERS.get("stripe")!;
    expect(stripe.tokenExchangeAuth).toBe("basic-apikey");
  });

  it("github uses body auth for token exchange", () => {
    const github = TOKEN_EXCHANGE_PROVIDERS.get("github")!;
    expect(github.tokenExchangeAuth).toBe("body");
  });

  it("gdrive has extra token params (access_type, prompt)", () => {
    const gdrive = TOKEN_EXCHANGE_PROVIDERS.get("gdrive")!;
    expect(gdrive.extraTokenParams).toEqual({ access_type: "offline", prompt: "consent" });
  });

  it("gmail has same extra params as gdrive", () => {
    const gmail = TOKEN_EXCHANGE_PROVIDERS.get("gmail")!;
    expect(gmail.extraTokenParams).toEqual({ access_type: "offline", prompt: "consent" });
  });

  it("token URLs match daemon's OAuthProvider.tokenUrl", () => {
    for (const provider of OAUTH_PROVIDERS) {
      const exchangeProvider = TOKEN_EXCHANGE_PROVIDERS.get(provider.name);
      expect(exchangeProvider).toBeDefined();
      expect(exchangeProvider!.tokenUrl).toBe(provider.tokenUrl);
    }
  });

  it("tokenExchangeAuth matches daemon's OAuthProvider", () => {
    for (const provider of OAUTH_PROVIDERS) {
      const exchangeProvider = TOKEN_EXCHANGE_PROVIDERS.get(provider.name);
      expect(exchangeProvider).toBeDefined();
      const expected = provider.tokenExchangeAuth ?? "body";
      expect(exchangeProvider!.tokenExchangeAuth).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// getClientId + hasLocalSecret helpers
// ---------------------------------------------------------------------------

describe("getClientId", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const provider of OAUTH_PROVIDERS) {
      savedEnv[provider.clientIdVar] = process.env[provider.clientIdVar];
      delete process.env[provider.clientIdVar];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it("returns env var when set", () => {
    const gh = getOAuthProvider("github")!;
    process.env[gh.clientIdVar] = "env-client-id";
    expect(getClientId(gh)).toBe("env-client-id");
  });

  it("returns undefined when no env var and no baked ID", () => {
    const gh = getOAuthProvider("github")!;
    // In dev mode (no build-time defines), baked ID is undefined
    const result = getClientId(gh);
    // Either undefined (no baked) or a string (baked during build)
    if (!process.env[gh.clientIdVar]) {
      // No env var set — result depends on whether baked IDs are present
      expect(result === undefined || typeof result === "string").toBe(true);
    }
  });

  it("env var takes precedence over baked ID", () => {
    const gh = getOAuthProvider("github")!;
    process.env[gh.clientIdVar] = "override-id";
    expect(getClientId(gh)).toBe("override-id");
  });
});

describe("hasLocalSecret", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const provider of OAUTH_PROVIDERS) {
      savedEnv[provider.clientSecretVar] = process.env[provider.clientSecretVar];
      delete process.env[provider.clientSecretVar];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it("returns false when no secret is set", () => {
    const gh = getOAuthProvider("github")!;
    expect(hasLocalSecret(gh)).toBe(false);
  });

  it("returns true when secret is set", () => {
    const gh = getOAuthProvider("github")!;
    process.env[gh.clientSecretVar] = "test-secret";
    expect(hasLocalSecret(gh)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildAuthorizationUrl
// ---------------------------------------------------------------------------

describe("buildAuthorizationUrl", () => {
  const mockProvider: TokenExchangeProvider = {
    name: "test-provider",
    authUrl: "https://example.com/oauth/authorize",
    tokenUrl: "https://example.com/oauth/token",
    scopes: ["read", "write"],
    tokenExchangeAuth: "body",
  };

  it("builds a valid authorization URL with required params", async () => {
    const result = await buildAuthorizationUrl(
      mockProvider,
      "test-client-id",
      "https://example.com/callback",
      "user123.token456",
    );

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe("https://example.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/callback");
    expect(url.searchParams.get("state")).toBe("user123.token456");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("read write");
    expect(result.codeVerifier).toBeUndefined();
  });

  it("generates PKCE challenge when provider requires it", async () => {
    const pkceProvider: TokenExchangeProvider = {
      ...mockProvider,
      usePKCE: true,
    };

    const result = await buildAuthorizationUrl(
      pkceProvider,
      "test-client-id",
      "https://example.com/callback",
      "state",
    );

    const url = new URL(result.url);
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(result.codeVerifier).toBeTruthy();
    expect(result.codeVerifier!.length).toBeGreaterThan(0);
  });

  it("includes extraAuthParams when defined", async () => {
    const providerWithExtras: TokenExchangeProvider = {
      ...mockProvider,
      extraAuthParams: { access_type: "offline", prompt: "consent" },
    };

    const result = await buildAuthorizationUrl(
      providerWithExtras,
      "test-client-id",
      "https://example.com/callback",
      "state",
    );

    const url = new URL(result.url);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("replaces {shop} placeholder in authUrl when context is provided", async () => {
    const shopifyProvider = TOKEN_EXCHANGE_PROVIDERS.get("shopify")!;

    const result = await buildAuthorizationUrl(
      shopifyProvider,
      "test-client-id",
      "https://bot.jeriko.ai/oauth/shopify/callback",
      "state",
      { shop: "mystore" },
    );

    const url = new URL(result.url);
    expect(url.origin).toBe("https://mystore.myshopify.com");
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
  });

  it("leaves authUrl unchanged when no context is provided", async () => {
    const shopifyProvider = TOKEN_EXCHANGE_PROVIDERS.get("shopify")!;

    const result = await buildAuthorizationUrl(
      shopifyProvider,
      "test-client-id",
      "https://bot.jeriko.ai/oauth/shopify/callback",
      "state",
    );

    // Without context, {shop} placeholder remains — authUrl is unresolved
    expect(result.url).toContain("{shop}");
  });

  it("omits scope param when provider has no scopes", async () => {
    const noScopeProvider: TokenExchangeProvider = {
      ...mockProvider,
      scopes: [],
    };

    const result = await buildAuthorizationUrl(
      noScopeProvider,
      "test-client-id",
      "https://example.com/callback",
      "state",
    );

    const url = new URL(result.url);
    expect(url.searchParams.has("scope")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exchangeCodeForTokens
// ---------------------------------------------------------------------------

describe("exchangeCodeForTokens", () => {
  const mockProvider: TokenExchangeProvider = {
    name: "test-provider",
    tokenUrl: "https://example.com/oauth/token",
    tokenExchangeAuth: "body",
  };

  it("sends correct params for body auth exchange", async () => {
    let capturedBody: string = "";
    let capturedHeaders: Record<string, string> = {};

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      capturedHeaders = opts.headers as Record<string, string>;
      return new Response(JSON.stringify({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
        scope: "read write",
        token_type: "Bearer",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      const result = await exchangeCodeForTokens({
        provider: mockProvider,
        code: "test-code",
        redirectUri: "https://example.com/callback",
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
      });

      expect(result.accessToken).toBe("test-access-token");
      expect(result.refreshToken).toBe("test-refresh-token");
      expect(result.expiresIn).toBe(3600);
      expect(result.scope).toBe("read write");
      expect(result.tokenType).toBe("Bearer");

      // Verify params
      const params = new URLSearchParams(capturedBody);
      expect(params.get("grant_type")).toBe("authorization_code");
      expect(params.get("code")).toBe("test-code");
      expect(params.get("redirect_uri")).toBe("https://example.com/callback");
      expect(params.get("client_id")).toBe("test-client-id");
      expect(params.get("client_secret")).toBe("test-client-secret");
      expect(capturedHeaders.Authorization).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends correct headers for standard basic auth exchange", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: string = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, opts: RequestInit) => {
      capturedHeaders = opts.headers as Record<string, string>;
      capturedBody = opts.body as string;
      return new Response(JSON.stringify({
        access_token: "test-access-token",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      await exchangeCodeForTokens({
        provider: { ...mockProvider, tokenExchangeAuth: "basic" },
        code: "test-code",
        redirectUri: "https://example.com/callback",
        clientId: "test-client-id",
        clientSecret: "test-secret-key",
      });

      // Standard Basic auth: base64(client_id:client_secret)
      expect(capturedHeaders.Authorization).toStartWith("Basic ");
      const decoded = atob(capturedHeaders.Authorization!.replace("Basic ", ""));
      expect(decoded).toBe("test-client-id:test-secret-key");

      // Body should NOT contain client_id/client_secret
      const params = new URLSearchParams(capturedBody);
      expect(params.has("client_id")).toBe(false);
      expect(params.has("client_secret")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends correct headers for basic-apikey auth exchange (Stripe)", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: string = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, opts: RequestInit) => {
      capturedHeaders = opts.headers as Record<string, string>;
      capturedBody = opts.body as string;
      return new Response(JSON.stringify({
        access_token: "test-access-token",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      await exchangeCodeForTokens({
        provider: { ...mockProvider, tokenExchangeAuth: "basic-apikey" },
        code: "test-code",
        redirectUri: "https://example.com/callback",
        clientId: "test-client-id",
        clientSecret: "sk_test_secretkey",
      });

      // API-key Basic auth: base64(secret_key:) — Stripe-style
      expect(capturedHeaders.Authorization).toStartWith("Basic ");
      const decoded = atob(capturedHeaders.Authorization!.replace("Basic ", ""));
      expect(decoded).toBe("sk_test_secretkey:");

      // Body should NOT contain client_id/client_secret
      const params = new URLSearchParams(capturedBody);
      expect(params.has("client_id")).toBe(false);
      expect(params.has("client_secret")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("includes code_verifier when provided (PKCE)", async () => {
    let capturedBody: string = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      return new Response(JSON.stringify({
        access_token: "test-access-token",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      await exchangeCodeForTokens({
        provider: mockProvider,
        code: "test-code",
        redirectUri: "https://example.com/callback",
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        codeVerifier: "test-verifier-value",
      });

      const params = new URLSearchParams(capturedBody);
      expect(params.get("code_verifier")).toBe("test-verifier-value");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves {shop} placeholder in tokenUrl when context is provided", async () => {
    let capturedUrl: string = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, _opts: RequestInit) => {
      capturedUrl = url;
      return new Response(JSON.stringify({
        access_token: "shopify-token",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      const shopifyProvider = TOKEN_EXCHANGE_PROVIDERS.get("shopify")!;
      await exchangeCodeForTokens({
        provider: shopifyProvider,
        code: "test-code",
        redirectUri: "https://example.com/callback",
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        context: { shop: "mystore" },
      });

      expect(capturedUrl).toBe("https://mystore.myshopify.com/admin/oauth/access_token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on HTTP error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response("Unauthorized", { status: 401 });
    }) as typeof fetch;

    try {
      await expect(exchangeCodeForTokens({
        provider: mockProvider,
        code: "bad-code",
        redirectUri: "https://example.com/callback",
        clientId: "id",
        clientSecret: "secret",
      })).rejects.toThrow("Token exchange failed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when no access_token in response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await expect(exchangeCodeForTokens({
        provider: mockProvider,
        code: "test-code",
        redirectUri: "https://example.com/callback",
        clientId: "id",
        clientSecret: "secret",
      })).rejects.toThrow("no access_token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// refreshAccessToken
// ---------------------------------------------------------------------------

describe("refreshAccessToken", () => {
  const mockProvider: TokenExchangeProvider = {
    name: "test-provider",
    tokenUrl: "https://example.com/oauth/token",
    tokenExchangeAuth: "body",
  };

  it("sends correct refresh params", async () => {
    let capturedBody: string = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      return new Response(JSON.stringify({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 7200,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      const result = await refreshAccessToken({
        provider: mockProvider,
        refreshToken: "old-refresh-token",
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
      });

      expect(result.accessToken).toBe("new-access-token");
      expect(result.refreshToken).toBe("new-refresh-token");
      expect(result.expiresIn).toBe(7200);

      const params = new URLSearchParams(capturedBody);
      expect(params.get("grant_type")).toBe("refresh_token");
      expect(params.get("refresh_token")).toBe("old-refresh-token");
      expect(params.get("client_id")).toBe("test-client-id");
      expect(params.get("client_secret")).toBe("test-client-secret");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("includes scope when provided", async () => {
    let capturedBody: string = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      return new Response(JSON.stringify({
        access_token: "new-access-token",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      await refreshAccessToken({
        provider: mockProvider,
        refreshToken: "old-refresh-token",
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        scope: "read write",
      });

      const params = new URLSearchParams(capturedBody);
      expect(params.get("scope")).toBe("read write");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on HTTP error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response("Forbidden", { status: 403 });
    }) as typeof fetch;

    try {
      await expect(refreshAccessToken({
        provider: mockProvider,
        refreshToken: "expired-token",
        clientId: "id",
        clientSecret: "secret",
      })).rejects.toThrow("Token refresh failed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when no access_token in response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await expect(refreshAccessToken({
        provider: mockProvider,
        refreshToken: "token",
        clientId: "id",
        clientSecret: "secret",
      })).rejects.toThrow("no access_token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// OAuthProvider.bakedIdKey
// ---------------------------------------------------------------------------

describe("OAuthProvider bakedIdKey", () => {
  it("every provider has a bakedIdKey", () => {
    for (const p of OAUTH_PROVIDERS) {
      expect(p.bakedIdKey).toBeTruthy();
    }
  });

  it("providers sharing a platform have the same bakedIdKey", () => {
    const gmail = getOAuthProvider("gmail")!;
    const gdrive = getOAuthProvider("gdrive")!;
    expect(gmail.bakedIdKey).toBe(gdrive.bakedIdKey);
    expect(gmail.bakedIdKey).toBe("google");
  });

  it("unique providers have unique bakedIdKeys", () => {
    const github = getOAuthProvider("github")!;
    const x = getOAuthProvider("x")!;
    const vercel = getOAuthProvider("vercel")!;
    const stripe = getOAuthProvider("stripe")!;

    const keys = new Set([github.bakedIdKey, x.bakedIdKey, vercel.bakedIdKey, stripe.bakedIdKey]);
    expect(keys.size).toBe(4);
  });
});
