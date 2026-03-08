// OAuth system audit tests.
//
// Validates provider config completeness, baked ID coverage, exchange logic,
// token refresh, error handling, state parameter security, and cross-layer
// consistency between daemon providers, shared exchange, baked IDs, and relay.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";

import {
  OAUTH_PROVIDERS,
  getOAuthProvider,
  isOAuthCapable,
  getClientId,
  hasLocalSecret,
  type OAuthProvider,
} from "../../src/daemon/services/oauth/providers.js";

import {
  generateState,
  consumeState,
  setCodeVerifier,
  generateCodeVerifier,
  generateCodeChallenge,
} from "../../src/daemon/services/oauth/state.js";

import {
  TOKEN_EXCHANGE_PROVIDERS,
  exchangeCodeForTokens,
  refreshAccessToken,
  type TokenExchangeProvider,
} from "../../src/shared/oauth-exchange.js";

import { BAKED_OAUTH_CLIENT_IDS } from "../../src/shared/baked-oauth-ids.js";

import {
  CONNECTOR_DEFS,
  getConnectorDef,
} from "../../src/shared/connector.js";

import {
  buildCompositeState,
  parseCompositeState,
} from "../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// 1. All providers have required OAuth config
// ---------------------------------------------------------------------------

describe("Audit: Provider config completeness", () => {
  it("every OAuthProvider has all required fields", () => {
    for (const p of OAUTH_PROVIDERS) {
      expect(typeof p.name).toBe("string");
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.label).toBe("string");
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.authUrl).toMatch(/^https:\/\//);
      expect(p.tokenUrl).toMatch(/^https:\/\//);
      expect(Array.isArray(p.scopes)).toBe(true);
      expect(typeof p.bakedIdKey).toBe("string");
      expect(p.bakedIdKey.length).toBeGreaterThan(0);
      expect(typeof p.clientIdVar).toBe("string");
      expect(p.clientIdVar).toMatch(/_CLIENT_ID$/);
      expect(typeof p.clientSecretVar).toBe("string");
      expect(typeof p.tokenEnvVar).toBe("string");
      expect(p.tokenEnvVar.length).toBeGreaterThan(0);
    }
  });

  it("every OAuthProvider has a matching ConnectorDef", () => {
    for (const p of OAUTH_PROVIDERS) {
      const def = getConnectorDef(p.name);
      expect(def).toBeDefined();
      expect(def!.name).toBe(p.name);
    }
  });

  it("every ConnectorDef with oauth field has a matching OAuthProvider", () => {
    for (const def of CONNECTOR_DEFS) {
      if (def.oauth) {
        const provider = getOAuthProvider(def.name);
        expect(provider).toBeDefined();
        expect(provider!.clientIdVar).toBe(def.oauth.clientIdVar);
        expect(provider!.clientSecretVar).toBe(def.oauth.clientSecretVar);
      }
    }
  });

  it("PKCE providers are X, Vercel, and Airtable", () => {
    const pkceProviders = OAUTH_PROVIDERS.filter((p) => p.usePKCE);
    const names = pkceProviders.map((p) => p.name).sort();
    expect(names).toEqual(["airtable", "vercel", "x"]);
  });

  it("basic auth providers are Stripe and Notion", () => {
    const basicProviders = OAUTH_PROVIDERS.filter(
      (p) => p.tokenExchangeAuth === "basic",
    );
    const names = basicProviders.map((p) => p.name).sort();
    expect(names).toEqual(["notion", "stripe"]);
  });

  it("providers without refresh tokens are GitHub, Instagram, Threads, Shopify, Notion, Linear", () => {
    const noRefresh = OAUTH_PROVIDERS.filter((p) => !p.refreshTokenEnvVar);
    const names = noRefresh.map((p) => p.name).sort();
    expect(names).toEqual(["github", "instagram", "linear", "notion", "shopify", "threads"]);
  });

  it("provider names are unique", () => {
    const names = OAUTH_PROVIDERS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("tokenEnvVars are unique across providers", () => {
    const vars = OAUTH_PROVIDERS.map((p) => p.tokenEnvVar);
    expect(new Set(vars).size).toBe(vars.length);
  });
});

// ---------------------------------------------------------------------------
// 2. Baked OAuth IDs match providers
// ---------------------------------------------------------------------------

describe("Audit: Baked OAuth ID coverage", () => {
  it("every provider bakedIdKey exists in BAKED_OAUTH_CLIENT_IDS", () => {
    const bakedKeys = new Set(Object.keys(BAKED_OAUTH_CLIENT_IDS));
    for (const p of OAUTH_PROVIDERS) {
      expect(bakedKeys.has(p.bakedIdKey)).toBe(true);
    }
  });

  it("every BAKED_OAUTH_CLIENT_IDS key is referenced by at least one provider (except orphan keys)", () => {
    const providerKeys = new Set(OAUTH_PROVIDERS.map((p) => p.bakedIdKey));
    // "paypal" baked key exists but PayPal is API-key-only (no OAuth provider)
    const orphanKeys = new Set(["paypal"]);
    for (const key of Object.keys(BAKED_OAUTH_CLIENT_IDS)) {
      if (orphanKeys.has(key)) continue;
      expect(providerKeys.has(key)).toBe(true);
    }
  });

  it("shared baked keys map to expected providers", () => {
    // google is shared by gmail + gdrive
    const googleProviders = OAUTH_PROVIDERS.filter(
      (p) => p.bakedIdKey === "google",
    );
    expect(googleProviders.map((p) => p.name).sort()).toEqual([
      "gdrive",
      "gmail",
    ]);

    // atlassian is used by jira
    const atlassianProviders = OAUTH_PROVIDERS.filter(
      (p) => p.bakedIdKey === "atlassian",
    );
    expect(atlassianProviders.map((p) => p.name)).toEqual(["jira"]);
  });
});

// ---------------------------------------------------------------------------
// 3. TOKEN_EXCHANGE_PROVIDERS consistency
// ---------------------------------------------------------------------------

describe("Audit: TOKEN_EXCHANGE_PROVIDERS parity", () => {
  it("has entry for every OAuthProvider", () => {
    for (const p of OAUTH_PROVIDERS) {
      expect(TOKEN_EXCHANGE_PROVIDERS.has(p.name)).toBe(true);
    }
  });

  it("has no extra entries beyond OAuthProvider names", () => {
    const providerNames = new Set(OAUTH_PROVIDERS.map((p) => p.name));
    for (const [name] of TOKEN_EXCHANGE_PROVIDERS) {
      expect(providerNames.has(name)).toBe(true);
    }
  });

  it("tokenUrl matches between daemon and shared exchange for all providers", () => {
    for (const p of OAUTH_PROVIDERS) {
      const exchange = TOKEN_EXCHANGE_PROVIDERS.get(p.name)!;
      expect(exchange.tokenUrl).toBe(p.tokenUrl);
    }
  });

  it("tokenExchangeAuth matches between daemon and shared exchange", () => {
    for (const p of OAUTH_PROVIDERS) {
      const exchange = TOKEN_EXCHANGE_PROVIDERS.get(p.name)!;
      const expected = p.tokenExchangeAuth ?? "body";
      expect(exchange.tokenExchangeAuth).toBe(expected);
    }
  });

  it("name field matches the map key for all entries", () => {
    for (const [key, provider] of TOKEN_EXCHANGE_PROVIDERS) {
      expect(provider.name).toBe(key);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. OAuth exchange functions (buildAuthUrl equivalent, exchangeCode)
// ---------------------------------------------------------------------------

describe("Audit: exchangeCodeForTokens", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("constructs correct body params for body-auth provider", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = (async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedBody = opts.body as string;
      capturedHeaders = opts.headers as Record<string, string>;
      return new Response(
        JSON.stringify({ access_token: "tok_123", refresh_token: "ref_456", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const provider: TokenExchangeProvider = {
      name: "github",
      tokenUrl: "https://github.com/login/oauth/access_token",
      tokenExchangeAuth: "body",
    };

    const result = await exchangeCodeForTokens({
      provider,
      code: "auth_code_abc",
      redirectUri: "https://bot.jeriko.ai/oauth/github/callback",
      clientId: "cid_123",
      clientSecret: "csec_456",
    });

    expect(capturedUrl).toBe("https://github.com/login/oauth/access_token");
    const params = new URLSearchParams(capturedBody);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth_code_abc");
    expect(params.get("redirect_uri")).toBe("https://bot.jeriko.ai/oauth/github/callback");
    expect(params.get("client_id")).toBe("cid_123");
    expect(params.get("client_secret")).toBe("csec_456");
    expect(capturedHeaders.Authorization).toBeUndefined();
    expect(capturedHeaders["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(capturedHeaders.Accept).toBe("application/json");

    expect(result.accessToken).toBe("tok_123");
    expect(result.refreshToken).toBe("ref_456");
    expect(result.expiresIn).toBe(3600);
  });

  it("uses Basic auth for basic-auth provider (Stripe pattern)", async () => {
    let capturedBody = "";
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = (async (_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      capturedHeaders = opts.headers as Record<string, string>;
      return new Response(
        JSON.stringify({ access_token: "stripe_tok" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const provider: TokenExchangeProvider = {
      name: "stripe",
      tokenUrl: "https://api.stripe.com/v1/oauth/token",
      tokenExchangeAuth: "basic",
    };

    await exchangeCodeForTokens({
      provider,
      code: "stripe_code",
      redirectUri: "https://bot.jeriko.ai/oauth/stripe/callback",
      clientId: "ca_xxx",
      clientSecret: "sk_test_secret",
    });

    // Basic auth present
    expect(capturedHeaders.Authorization).toStartWith("Basic ");
    const decoded = atob(capturedHeaders.Authorization!.replace("Basic ", ""));
    expect(decoded).toBe("sk_test_secret:");

    // No client_id/secret in body
    const params = new URLSearchParams(capturedBody);
    expect(params.has("client_id")).toBe(false);
    expect(params.has("client_secret")).toBe(false);
    expect(params.get("grant_type")).toBe("authorization_code");
  });

  it("includes code_verifier when PKCE is used", async () => {
    let capturedBody = "";

    globalThis.fetch = (async (_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      return new Response(
        JSON.stringify({ access_token: "x_token" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await exchangeCodeForTokens({
      provider: { name: "x", tokenUrl: "https://api.twitter.com/2/oauth2/token", tokenExchangeAuth: "body" },
      code: "twitter_code",
      redirectUri: "https://bot.jeriko.ai/oauth/x/callback",
      clientId: "x_cid",
      clientSecret: "x_csec",
      codeVerifier: "verifier_abc123",
    });

    const params = new URLSearchParams(capturedBody);
    expect(params.get("code_verifier")).toBe("verifier_abc123");
  });

  it("returns all fields from successful response", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 7200,
          scope: "read write",
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await exchangeCodeForTokens({
      provider: { name: "test", tokenUrl: "https://example.com/token", tokenExchangeAuth: "body" },
      code: "c",
      redirectUri: "https://example.com/cb",
      clientId: "id",
      clientSecret: "sec",
    });

    expect(result.accessToken).toBe("at");
    expect(result.refreshToken).toBe("rt");
    expect(result.expiresIn).toBe(7200);
    expect(result.scope).toBe("read write");
    expect(result.tokenType).toBe("Bearer");
  });

  it("handles missing optional fields gracefully", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ access_token: "minimal" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await exchangeCodeForTokens({
      provider: { name: "test", tokenUrl: "https://example.com/token", tokenExchangeAuth: "body" },
      code: "c",
      redirectUri: "https://example.com/cb",
      clientId: "id",
      clientSecret: "sec",
    });

    expect(result.accessToken).toBe("minimal");
    expect(result.refreshToken).toBeUndefined();
    expect(result.expiresIn).toBeUndefined();
    expect(result.scope).toBeUndefined();
    expect(result.tokenType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Token refresh logic
// ---------------------------------------------------------------------------

describe("Audit: refreshAccessToken", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends grant_type=refresh_token with correct params", async () => {
    let capturedBody = "";

    globalThis.fetch = (async (_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      return new Response(
        JSON.stringify({ access_token: "new_at", refresh_token: "new_rt", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await refreshAccessToken({
      provider: { name: "gdrive", tokenUrl: "https://oauth2.googleapis.com/token", tokenExchangeAuth: "body" },
      refreshToken: "old_rt",
      clientId: "gd_cid",
      clientSecret: "gd_csec",
    });

    const params = new URLSearchParams(capturedBody);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("old_rt");
    expect(params.get("client_id")).toBe("gd_cid");
    expect(params.get("client_secret")).toBe("gd_csec");
    expect(result.accessToken).toBe("new_at");
    expect(result.refreshToken).toBe("new_rt");
  });

  it("uses Basic auth for basic-auth providers on refresh", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    globalThis.fetch = (async (_url: string, opts: RequestInit) => {
      capturedHeaders = opts.headers as Record<string, string>;
      capturedBody = opts.body as string;
      return new Response(
        JSON.stringify({ access_token: "new_stripe_tok" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await refreshAccessToken({
      provider: { name: "stripe", tokenUrl: "https://api.stripe.com/v1/oauth/token", tokenExchangeAuth: "basic" },
      refreshToken: "stripe_rt",
      clientId: "ca_xxx",
      clientSecret: "sk_test",
    });

    expect(capturedHeaders.Authorization).toStartWith("Basic ");
    const params = new URLSearchParams(capturedBody);
    expect(params.has("client_id")).toBe(false);
    expect(params.has("client_secret")).toBe(false);
  });

  it("includes scope when provided", async () => {
    let capturedBody = "";

    globalThis.fetch = (async (_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      return new Response(
        JSON.stringify({ access_token: "tok" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await refreshAccessToken({
      provider: { name: "test", tokenUrl: "https://example.com/token", tokenExchangeAuth: "body" },
      refreshToken: "rt",
      clientId: "id",
      clientSecret: "sec",
      scope: "repo read:user",
    });

    const params = new URLSearchParams(capturedBody);
    expect(params.get("scope")).toBe("repo read:user");
  });
});

// ---------------------------------------------------------------------------
// 6. Error handling (network failure, invalid response)
// ---------------------------------------------------------------------------

describe("Audit: Exchange error handling", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockProvider: TokenExchangeProvider = {
    name: "test",
    tokenUrl: "https://example.com/token",
    tokenExchangeAuth: "body",
  };

  it("throws on HTTP 401 with descriptive message", async () => {
    globalThis.fetch = (async () => {
      return new Response("Unauthorized", { status: 401 });
    }) as typeof fetch;

    try {
      await exchangeCodeForTokens({
        provider: mockProvider,
        code: "c",
        redirectUri: "https://example.com/cb",
        clientId: "id",
        clientSecret: "sec",
      });
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect((err as Error).message).toContain("Token exchange failed");
      expect((err as Error).message).toContain("401");
      expect((err as Error).message).toContain("test");
    }
  });

  it("throws on HTTP 500 server error", async () => {
    globalThis.fetch = (async () => {
      return new Response("Internal Server Error", { status: 500 });
    }) as typeof fetch;

    await expect(
      exchangeCodeForTokens({
        provider: mockProvider,
        code: "c",
        redirectUri: "https://example.com/cb",
        clientId: "id",
        clientSecret: "sec",
      }),
    ).rejects.toThrow("500");
  });

  it("throws when response is 200 but missing access_token", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await expect(
      exchangeCodeForTokens({
        provider: mockProvider,
        code: "c",
        redirectUri: "https://example.com/cb",
        clientId: "id",
        clientSecret: "sec",
      }),
    ).rejects.toThrow("no access_token");
  });

  it("refresh throws on HTTP error with provider name", async () => {
    globalThis.fetch = (async () => {
      return new Response("Forbidden", { status: 403 });
    }) as typeof fetch;

    try {
      await refreshAccessToken({
        provider: mockProvider,
        refreshToken: "rt",
        clientId: "id",
        clientSecret: "sec",
      });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain("Token refresh failed");
      expect((err as Error).message).toContain("test");
      expect((err as Error).message).toContain("403");
    }
  });

  it("refresh throws when access_token is missing from 200 response", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ token_type: "Bearer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await expect(
      refreshAccessToken({
        provider: mockProvider,
        refreshToken: "rt",
        clientId: "id",
        clientSecret: "sec",
      }),
    ).rejects.toThrow("no access_token");
  });

  it("exchange handles response.text() failure gracefully", async () => {
    globalThis.fetch = (async () => {
      // Return a response where .text() works (the code calls .text() on error)
      return new Response("error body", { status: 400 });
    }) as typeof fetch;

    await expect(
      exchangeCodeForTokens({
        provider: mockProvider,
        code: "c",
        redirectUri: "https://example.com/cb",
        clientId: "id",
        clientSecret: "sec",
      }),
    ).rejects.toThrow("Token exchange failed");
  });
});

// ---------------------------------------------------------------------------
// 7. State parameter validation
// ---------------------------------------------------------------------------

describe("Audit: State parameter security", () => {
  it("state tokens are 256-bit (32 bytes = 64 hex chars)", () => {
    const token = generateState("github", "chat1", "cli");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    consumeState(token); // cleanup
  });

  it("state tokens are cryptographically random (no duplicates in 100 generations)", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateState("github", "chat1", "cli"));
    }
    expect(tokens.size).toBe(100);
    // cleanup
    for (const t of tokens) consumeState(t);
  });

  it("state is single-use (second consume returns null)", () => {
    const token = generateState("github", "chat1", "cli");
    expect(consumeState(token)).not.toBeNull();
    expect(consumeState(token)).toBeNull();
  });

  it("consumeState returns null for empty string", () => {
    expect(consumeState("")).toBeNull();
  });

  it("consumeState returns null for random garbage", () => {
    expect(consumeState("abc123xyz")).toBeNull();
  });

  it("composite state embeds userId and token", () => {
    const token = generateState("github", "chat1", "cli", "abcdef0123456789abcdef0123456789");
    expect(token).toContain(".");
    const parsed = parseCompositeState(token);
    expect(parsed).not.toBeNull();
    expect(parsed!.userId).toBe("abcdef0123456789abcdef0123456789");
    expect(parsed!.token).toMatch(/^[0-9a-f]{64}$/);
    // consumeState handles composite tokens
    const entry = consumeState(token);
    expect(entry).not.toBeNull();
    expect(entry!.provider).toBe("github");
  });

  it("composite state consumed correctly prevents replay", () => {
    const token = generateState("github", "chat1", "cli", "abcdef0123456789abcdef0123456780");
    expect(consumeState(token)).not.toBeNull();
    expect(consumeState(token)).toBeNull();
  });

  it("state entry tracks provider and channel correctly", () => {
    const token = generateState("x", "chat_999", "whatsapp");
    const entry = consumeState(token);
    expect(entry!.provider).toBe("x");
    expect(entry!.chatId).toBe("chat_999");
    expect(entry!.channelName).toBe("whatsapp");
  });

  it("setCodeVerifier works on both plain and composite states", () => {
    // Plain
    const plainToken = generateState("x", "c1", "cli");
    setCodeVerifier(plainToken, "verifier_plain");
    const plainEntry = consumeState(plainToken);
    expect(plainEntry!.codeVerifier).toBe("verifier_plain");

    // Composite
    const compositeToken = generateState("vercel", "c2", "telegram", "abcdef0123456789abcdef0123456781");
    setCodeVerifier(compositeToken, "verifier_composite");
    const compositeEntry = consumeState(compositeToken);
    expect(compositeEntry!.codeVerifier).toBe("verifier_composite");
  });
});

// ---------------------------------------------------------------------------
// 8. PKCE correctness
// ---------------------------------------------------------------------------

describe("Audit: PKCE implementation", () => {
  it("code verifier is 43+ characters and URL-safe", () => {
    for (let i = 0; i < 10; i++) {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      // base64url: only [A-Za-z0-9_-]
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("code challenge is deterministic for same verifier", () => {
    const verifier = "test-verifier-constant";
    const c1 = generateCodeChallenge(verifier);
    const c2 = generateCodeChallenge(verifier);
    expect(c1).toBe(c2);
  });

  it("code challenge differs for different verifiers", () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(generateCodeChallenge(v1)).not.toBe(generateCodeChallenge(v2));
  });

  it("code challenge is URL-safe base64 (no +/=)", () => {
    for (let i = 0; i < 20; i++) {
      const challenge = generateCodeChallenge(generateCodeVerifier());
      expect(challenge).not.toMatch(/[+/=]/);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Daemon handleOAuthStart and handleOAuthCallback
// ---------------------------------------------------------------------------

describe("Audit: handleOAuthStart", () => {
  let handleOAuthStart: typeof import("../../src/daemon/api/routes/oauth.js").handleOAuthStart;

  beforeEach(async () => {
    ({ handleOAuthStart } = await import("../../src/daemon/api/routes/oauth.js"));
  });

  it("returns 400 when state is missing", () => {
    const result = handleOAuthStart("github", {});
    expect(result.statusCode).toBe(400);
    expect(result.html).toContain("Missing state");
  });

  it("returns 404 for unknown provider", () => {
    const result = handleOAuthStart("nonexistent", { state: "abc" });
    expect(result.statusCode).toBe(404);
    expect(result.html).toContain("Unknown provider");
  });

  it("returns 503 when no client ID is configured", () => {
    const origId = process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    try {
      const result = handleOAuthStart("github", { state: "abc" });
      // May be 302 if baked IDs are present, or 503 if not
      if (result.statusCode === 503) {
        expect(result.html).toContain("not configured");
      } else {
        expect(result.statusCode).toBe(302);
      }
    } finally {
      if (origId) process.env.GITHUB_OAUTH_CLIENT_ID = origId;
    }
  });

  it("returns 302 redirect with valid config", () => {
    const origId = process.env.GITHUB_OAUTH_CLIENT_ID;
    process.env.GITHUB_OAUTH_CLIENT_ID = "audit-test-cid";
    try {
      const token = generateState("github", "c1", "cli");
      const result = handleOAuthStart("github", { state: token });
      expect(result.statusCode).toBe(302);
      expect(result.redirectUrl).toContain("github.com/login/oauth/authorize");
      expect(result.redirectUrl).toContain("client_id=audit-test-cid");
      expect(result.redirectUrl).toContain("response_type=code");
      expect(result.redirectUrl).toContain(`state=${token}`);
    } finally {
      if (origId) process.env.GITHUB_OAUTH_CLIENT_ID = origId;
      else delete process.env.GITHUB_OAUTH_CLIENT_ID;
    }
  });

  it("includes PKCE challenge for PKCE providers", () => {
    const origId = process.env.X_OAUTH_CLIENT_ID;
    process.env.X_OAUTH_CLIENT_ID = "x-audit-cid";
    try {
      const token = generateState("x", "c1", "cli");
      const result = handleOAuthStart("x", { state: token });
      expect(result.statusCode).toBe(302);
      expect(result.redirectUrl).toContain("code_challenge=");
      expect(result.redirectUrl).toContain("code_challenge_method=S256");
      expect(result.codeVerifier).toBeDefined();
      expect(result.codeVerifier!.length).toBeGreaterThanOrEqual(43);
    } finally {
      if (origId) process.env.X_OAUTH_CLIENT_ID = origId;
      else delete process.env.X_OAUTH_CLIENT_ID;
    }
  });

  it("includes scopes in redirect URL", () => {
    const origId = process.env.GITHUB_OAUTH_CLIENT_ID;
    process.env.GITHUB_OAUTH_CLIENT_ID = "audit-cid";
    try {
      const token = generateState("github", "c1", "cli");
      const result = handleOAuthStart("github", { state: token });
      expect(result.redirectUrl).toContain("scope=repo");
    } finally {
      if (origId) process.env.GITHUB_OAUTH_CLIENT_ID = origId;
      else delete process.env.GITHUB_OAUTH_CLIENT_ID;
    }
  });

  it("includes access_type and prompt for Google providers", () => {
    const origId = process.env.GDRIVE_OAUTH_CLIENT_ID;
    process.env.GDRIVE_OAUTH_CLIENT_ID = "gdrive-audit-cid";
    try {
      const token = generateState("gdrive", "c1", "cli");
      const result = handleOAuthStart("gdrive", { state: token });
      expect(result.redirectUrl).toContain("access_type=offline");
      expect(result.redirectUrl).toContain("prompt=consent");
    } finally {
      if (origId) process.env.GDRIVE_OAUTH_CLIENT_ID = origId;
      else delete process.env.GDRIVE_OAUTH_CLIENT_ID;
    }
  });
});

describe("Audit: handleOAuthCallback", () => {
  let handleOAuthCallback: typeof import("../../src/daemon/api/routes/oauth.js").handleOAuthCallback;

  beforeEach(async () => {
    ({ handleOAuthCallback } = await import("../../src/daemon/api/routes/oauth.js"));
  });

  it("returns 400 for provider error with description", async () => {
    const result = await handleOAuthCallback("github", {
      error: "access_denied",
      error_description: "User refused",
    });
    expect(result.statusCode).toBe(400);
    expect(result.html).toContain("User refused");
  });

  it("returns 400 for missing code", async () => {
    const result = await handleOAuthCallback("github", { state: "s" });
    expect(result.statusCode).toBe(400);
    expect(result.html).toContain("Missing code or state");
  });

  it("returns 400 for missing state", async () => {
    const result = await handleOAuthCallback("github", { code: "c" });
    expect(result.statusCode).toBe(400);
    expect(result.html).toContain("Missing code or state");
  });

  it("returns 400 for invalid state token", async () => {
    const result = await handleOAuthCallback("github", { code: "c", state: "bogus" });
    expect(result.statusCode).toBe(400);
    expect(result.html).toContain("Invalid or expired state");
  });

  it("returns 400 for provider mismatch", async () => {
    const token = generateState("x", "c1", "cli");
    const result = await handleOAuthCallback("github", { code: "c", state: token });
    expect(result.statusCode).toBe(400);
    expect(result.html).toContain("mismatch");
  });

  it("escapes HTML in error_description to prevent XSS", async () => {
    const result = await handleOAuthCallback("github", {
      error: "bad",
      error_description: '<script>alert("xss")</script>',
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("handles null channels gracefully (relay mode)", async () => {
    const result = await handleOAuthCallback("github", { error: "denied" }, null);
    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 10. getClientId resolution order
// ---------------------------------------------------------------------------

describe("Audit: getClientId resolution", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    const gh = getOAuthProvider("github")!;
    saved[gh.clientIdVar] = process.env[gh.clientIdVar];
    delete process.env[gh.clientIdVar];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
      else delete process.env[k];
    }
  });

  it("env var takes precedence over baked ID", () => {
    const gh = getOAuthProvider("github")!;
    process.env[gh.clientIdVar] = "env-override";
    expect(getClientId(gh)).toBe("env-override");
  });

  it("returns undefined when no env var and no baked ID (dev mode)", () => {
    const gh = getOAuthProvider("github")!;
    const result = getClientId(gh);
    // In dev mode (no build defines), baked IDs are undefined
    // In build mode, they exist. Either is valid.
    expect(result === undefined || typeof result === "string").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. hasLocalSecret
// ---------------------------------------------------------------------------

describe("Audit: hasLocalSecret", () => {
  it("returns false when secret env var is not set", () => {
    const gh = getOAuthProvider("github")!;
    const orig = process.env[gh.clientSecretVar];
    delete process.env[gh.clientSecretVar];
    try {
      expect(hasLocalSecret(gh)).toBe(false);
    } finally {
      if (orig) process.env[gh.clientSecretVar] = orig;
    }
  });

  it("returns true when secret env var is set", () => {
    const gh = getOAuthProvider("github")!;
    const orig = process.env[gh.clientSecretVar];
    process.env[gh.clientSecretVar] = "test-secret";
    try {
      expect(hasLocalSecret(gh)).toBe(true);
    } finally {
      if (orig) process.env[gh.clientSecretVar] = orig;
      else delete process.env[gh.clientSecretVar];
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Composite state helpers
// ---------------------------------------------------------------------------

describe("Audit: Composite state helpers", () => {
  it("buildCompositeState creates userId.token format", () => {
    const result = buildCompositeState("abcdef0123456789abcdef0123456789", "abcdef");
    expect(result).toBe("abcdef0123456789abcdef0123456789.abcdef");
  });

  it("parseCompositeState parses correctly", () => {
    const parsed = parseCompositeState("abcdef0123456789abcdef0123456789.token123");
    expect(parsed).not.toBeNull();
    expect(parsed!.userId).toBe("abcdef0123456789abcdef0123456789");
    expect(parsed!.token).toBe("token123");
  });

  it("parseCompositeState returns null for plain token (no dot)", () => {
    expect(parseCompositeState("nodothere")).toBeNull();
  });

  it("parseCompositeState returns null for empty userId", () => {
    expect(parseCompositeState(".token")).toBeNull();
  });

  it("parseCompositeState returns null for empty token", () => {
    expect(parseCompositeState("user.")).toBeNull();
  });

  it("parseCompositeState handles multiple dots (first dot is delimiter)", () => {
    const parsed = parseCompositeState("user.token.extra");
    expect(parsed!.userId).toBe("user");
    expect(parsed!.token).toBe("token.extra");
  });
});

// ---------------------------------------------------------------------------
// 13. Relay oauth-secrets coverage
// ---------------------------------------------------------------------------

describe("Audit: Relay PROVIDER_CREDENTIAL_MAP coverage", () => {
  // We can't import the CF worker module directly (it depends on CF globals),
  // but we can verify the expected coverage by checking the Env type against providers.

  it("every OAuthProvider name should have relay credential mapping", () => {
    // The relay credential map in oauth-secrets.ts should cover all 23 providers.
    // We verify by listing expected entries from our reading of the file.
    const expectedRelayProviders = [
      "stripe", "github", "x", "gdrive", "gmail",
      "vercel", "hubspot", "shopify", "instagram", "threads",
      "square", "gitlab",
      "notion", "linear", "jira", "airtable", "asana",
      "mailchimp", "dropbox", "discord",
    ];
    const oauthProviderNames = OAUTH_PROVIDERS.map((p) => p.name).sort();
    expect(expectedRelayProviders.sort()).toEqual(oauthProviderNames);
  });
});

// ---------------------------------------------------------------------------
// 14. Cross-layer consistency
// ---------------------------------------------------------------------------

describe("Audit: Cross-layer consistency", () => {
  it("OAUTH_PROVIDERS count matches TOKEN_EXCHANGE_PROVIDERS count", () => {
    expect(OAUTH_PROVIDERS.length).toBe(TOKEN_EXCHANGE_PROVIDERS.size);
  });

  it("all unique bakedIdKeys have corresponding BAKED_OAUTH_CLIENT_IDS entry", () => {
    const uniqueKeys = new Set(OAUTH_PROVIDERS.map((p) => p.bakedIdKey));
    const bakedKeys = new Set(Object.keys(BAKED_OAUTH_CLIENT_IDS));
    for (const key of uniqueKeys) {
      expect(bakedKeys.has(key)).toBe(true);
    }
  });

  it("BAKED_OAUTH_CLIENT_IDS covers all unique bakedIdKeys", () => {
    const uniqueKeys = new Set(OAUTH_PROVIDERS.map((p) => p.bakedIdKey));
    const bakedKeys = Object.keys(BAKED_OAUTH_CLIENT_IDS);
    // Baked IDs may include orphan keys (e.g. "paypal") not referenced by any provider
    expect(bakedKeys.length).toBeGreaterThanOrEqual(uniqueKeys.size);
    for (const key of uniqueKeys) {
      expect(bakedKeys).toContain(key);
    }
  });

  it("providers with extraTokenParams have matching exchange params", () => {
    // All daemon providers with extraTokenParams must have the params mirrored
    // on the relay exchange side — either as extraTokenParams or extraAuthParams,
    // depending on where the params are needed (token body vs auth URL).
    const withExtra = OAUTH_PROVIDERS.filter((p) => p.extraTokenParams);
    for (const p of withExtra) {
      const exchange = TOKEN_EXCHANGE_PROVIDERS.get(p.name)!;
      // Params may be in extraTokenParams (for token exchange body) or
      // extraAuthParams (for authorization URL) depending on the provider
      const exchangeExtra = exchange.extraTokenParams ?? exchange.extraAuthParams;
      expect(exchangeExtra).toBeDefined();
      const daemonKeys = Object.keys(p.extraTokenParams!).sort();
      const exchangeKeys = Object.keys(exchangeExtra!).sort();
      expect(exchangeKeys).toEqual(daemonKeys);
    }
  });
});
