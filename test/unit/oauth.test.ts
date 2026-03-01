// OAuth subsystem tests — providers, state, and routes.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  OAUTH_PROVIDERS,
  getOAuthProvider,
  isOAuthCapable,
} from "../../src/daemon/services/oauth/providers.js";
import {
  generateState,
  consumeState,
  setCodeVerifier,
  generateCodeVerifier,
  generateCodeChallenge,
} from "../../src/daemon/services/oauth/state.js";
import {
  CONNECTOR_DEFS,
  getConnectorDef,
  isConnectorConfigured,
} from "../../src/shared/connector.js";

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

describe("OAuth providers", () => {
  it("defines exactly 8 providers", () => {
    expect(OAUTH_PROVIDERS.length).toBe(8);
  });

  it("has all required fields on every provider", () => {
    for (const p of OAUTH_PROVIDERS) {
      expect(p.name).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.authUrl).toMatch(/^https:\/\//);
      expect(p.tokenUrl).toMatch(/^https:\/\//);
      expect(Array.isArray(p.scopes)).toBe(true);
      expect(p.clientIdVar).toBeTruthy();
      expect(p.clientSecretVar).toBeTruthy();
      expect(p.tokenEnvVar).toBeTruthy();
    }
  });

  it("getOAuthProvider returns correct provider", () => {
    const gh = getOAuthProvider("github");
    expect(gh).toBeDefined();
    expect(gh!.label).toBe("GitHub");
    expect(gh!.tokenEnvVar).toBe("GITHUB_TOKEN");
  });

  it("getOAuthProvider returns undefined for unknown", () => {
    expect(getOAuthProvider("nonexistent")).toBeUndefined();
  });

  it("getOAuthProvider returns Stripe with Basic auth exchange", () => {
    const stripe = getOAuthProvider("stripe");
    expect(stripe).toBeDefined();
    expect(stripe!.label).toBe("Stripe");
    expect(stripe!.tokenExchangeAuth).toBe("basic");
    expect(stripe!.clientSecretVar).toBe("STRIPE_SECRET_KEY");
    expect(stripe!.tokenEnvVar).toBe("STRIPE_ACCESS_TOKEN");
    expect(stripe!.refreshTokenEnvVar).toBe("STRIPE_REFRESH_TOKEN");
  });

  it("isOAuthCapable correctly identifies OAuth vs API-key connectors", () => {
    // OAuth-capable
    expect(isOAuthCapable("stripe")).toBe(true);
    expect(isOAuthCapable("github")).toBe(true);
    expect(isOAuthCapable("x")).toBe(true);
    expect(isOAuthCapable("gdrive")).toBe(true);
    expect(isOAuthCapable("onedrive")).toBe(true);
    expect(isOAuthCapable("vercel")).toBe(true);
    expect(isOAuthCapable("gmail")).toBe(true);
    expect(isOAuthCapable("outlook")).toBe(true);
    // API-key only
    expect(isOAuthCapable("paypal")).toBe(false);
    expect(isOAuthCapable("twilio")).toBe(false);
  });

  it("X/Twitter requires PKCE", () => {
    const x = getOAuthProvider("x");
    expect(x!.usePKCE).toBe(true);
  });

  it("Vercel uses Sign in with Vercel endpoints and requires PKCE", () => {
    const v = getOAuthProvider("vercel");
    expect(v).toBeDefined();
    expect(v!.authUrl).toBe("https://vercel.com/oauth/authorize");
    expect(v!.tokenUrl).toBe("https://api.vercel.com/login/oauth/token");
    expect(v!.usePKCE).toBe(true);
    expect(v!.scopes).toContain("openid");
    expect(v!.scopes).toContain("offline_access");
    expect(v!.refreshTokenEnvVar).toBe("VERCEL_REFRESH_TOKEN");
  });

  it("Google Drive has refresh token + extra params", () => {
    const gd = getOAuthProvider("gdrive");
    expect(gd!.refreshTokenEnvVar).toBe("GDRIVE_REFRESH_TOKEN");
    expect(gd!.extraTokenParams).toEqual({ access_type: "offline", prompt: "consent" });
  });

  it("OneDrive has refresh token var", () => {
    const od = getOAuthProvider("onedrive");
    expect(od!.refreshTokenEnvVar).toBe("ONEDRIVE_REFRESH_TOKEN");
  });

  it("GitHub has no PKCE or refresh token", () => {
    const gh = getOAuthProvider("github");
    expect(gh!.usePKCE).toBeUndefined();
    expect(gh!.refreshTokenEnvVar).toBeUndefined();
  });

  it("provider names match connector def names", () => {
    for (const p of OAUTH_PROVIDERS) {
      const def = getConnectorDef(p.name);
      expect(def).toBeDefined();
      expect(def!.name).toBe(p.name);
    }
  });

  it("provider tokenEnvVars match connector required vars", () => {
    // The token saved by OAuth must satisfy the connector's required check
    const gh = getOAuthProvider("github")!;
    const ghDef = getConnectorDef("github")!;
    // GitHub required is [["GITHUB_TOKEN", "GH_TOKEN"]] — GITHUB_TOKEN is primary
    const primaryRequired = Array.isArray(ghDef.required[0])
      ? ghDef.required[0]
      : [ghDef.required[0]];
    expect(primaryRequired).toContain(gh.tokenEnvVar);
  });
});

// ---------------------------------------------------------------------------
// State manager
// ---------------------------------------------------------------------------

describe("OAuth state", () => {
  it("generates unique state tokens", () => {
    const t1 = generateState("github", "chat1", "telegram");
    const t2 = generateState("github", "chat1", "telegram");
    expect(t1).not.toBe(t2);
    expect(t1.length).toBe(64); // 32 bytes hex = 64 chars
  });

  it("consumeState returns pending entry and removes it", () => {
    const token = generateState("github", "chat123", "telegram");
    const entry = consumeState(token);
    expect(entry).not.toBeNull();
    expect(entry!.provider).toBe("github");
    expect(entry!.chatId).toBe("chat123");
    expect(entry!.channelName).toBe("telegram");
    expect(entry!.createdAt).toBeGreaterThan(0);

    // Second consume returns null (already consumed)
    expect(consumeState(token)).toBeNull();
  });

  it("returns null for unknown tokens", () => {
    expect(consumeState("nonexistent")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(consumeState("")).toBeNull();
  });

  it("setCodeVerifier attaches verifier to existing state", () => {
    const token = generateState("x", "chat1", "telegram");
    setCodeVerifier(token, "my-verifier-string");
    const entry = consumeState(token);
    expect(entry!.codeVerifier).toBe("my-verifier-string");
  });

  it("setCodeVerifier is a no-op for unknown tokens", () => {
    // Should not throw
    setCodeVerifier("nonexistent", "verifier");
  });

  it("state entries have no codeVerifier by default", () => {
    const token = generateState("github", "chat1", "telegram");
    const entry = consumeState(token);
    expect(entry!.codeVerifier).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PKCE (RFC 7636)
// ---------------------------------------------------------------------------

describe("PKCE", () => {
  it("generateCodeVerifier produces URL-safe base64", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    // base64url: no +, /, =
    expect(verifier).not.toMatch(/[+/=]/);
  });

  it("generateCodeVerifier produces unique values", () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(v1).not.toBe(v2);
  });

  it("generateCodeChallenge produces deterministic output", () => {
    const verifier = "test-verifier-value";
    const c1 = generateCodeChallenge(verifier);
    const c2 = generateCodeChallenge(verifier);
    expect(c1).toBe(c2);
  });

  it("generateCodeChallenge produces URL-safe base64", () => {
    const challenge = generateCodeChallenge("any-verifier");
    expect(challenge).not.toMatch(/[+/=]/);
  });

  it("challenge differs from verifier", () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    expect(challenge).not.toBe(verifier);
  });

  it("different verifiers produce different challenges", () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(generateCodeChallenge(v1)).not.toBe(generateCodeChallenge(v2));
  });
});

// ---------------------------------------------------------------------------
// ConnectorDef.oauth field
// ---------------------------------------------------------------------------

describe("ConnectorDef OAuth metadata", () => {
  it("OAuth-capable connectors have oauth field", () => {
    const oauthNames = ["github", "x", "gdrive", "onedrive", "vercel", "gmail", "outlook"];
    for (const name of oauthNames) {
      const def = getConnectorDef(name);
      expect(def!.oauth).toBeDefined();
      expect(def!.oauth!.clientIdVar).toBeTruthy();
      expect(def!.oauth!.clientSecretVar).toBeTruthy();
    }
  });

  it("API-key-only connectors have no oauth field", () => {
    const apiKeyNames = ["paypal", "twilio"];
    for (const name of apiKeyNames) {
      const def = getConnectorDef(name);
      expect(def!.oauth).toBeUndefined();
    }
  });

  it("Stripe has both API key and OAuth support", () => {
    const def = getConnectorDef("stripe");
    expect(def!.oauth).toBeDefined();
    expect(def!.oauth!.clientIdVar).toBe("STRIPE_OAUTH_CLIENT_ID");
    expect(def!.oauth!.clientSecretVar).toBe("STRIPE_SECRET_KEY");
    expect(def!.required).toEqual(["STRIPE_SECRET_KEY"]);
  });

  it("ConnectorDef.oauth matches OAuthProvider vars", () => {
    for (const provider of OAUTH_PROVIDERS) {
      const def = getConnectorDef(provider.name);
      expect(def!.oauth!.clientIdVar).toBe(provider.clientIdVar);
      expect(def!.oauth!.clientSecretVar).toBe(provider.clientSecretVar);
    }
  });

  it("total connector count is 10", () => {
    expect(CONNECTOR_DEFS.length).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// OAuth routes — HTTP-level tests via Hono test client
// ---------------------------------------------------------------------------

describe("OAuth routes", () => {
  // We test routes by creating a Hono app and calling fetch on it directly.
  // No real HTTP server needed — Hono supports app.request().

  let app: import("hono").Hono;

  beforeEach(async () => {
    const { Hono } = await import("hono");
    const { oauthRoutes } = await import("../../src/daemon/api/routes/oauth.js");

    app = new Hono();
    app.route("/oauth", oauthRoutes());
  });

  it("GET /oauth/unknown/start returns 404", async () => {
    const res = await app.request("/oauth/fakeprovider/start?state=abc123");
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain("Unknown provider");
  });

  it("GET /oauth/github/start without state returns 400", async () => {
    const res = await app.request("/oauth/github/start");
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Missing state");
  });

  it("GET /oauth/github/start without client ID configured returns 503", async () => {
    // Ensure no client ID is set
    const origId = process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    try {
      const res = await app.request("/oauth/github/start?state=test123");
      expect(res.status).toBe(503);
      const text = await res.text();
      expect(text).toContain("not configured");
    } finally {
      if (origId) process.env.GITHUB_OAUTH_CLIENT_ID = origId;
    }
  });

  it("GET /oauth/github/start with valid config redirects to GitHub", async () => {
    const origId = process.env.GITHUB_OAUTH_CLIENT_ID;
    process.env.GITHUB_OAUTH_CLIENT_ID = "test-client-id-123";

    try {
      // Generate a real state token so the redirect includes it
      const token = generateState("github", "chat1", "telegram");
      const res = await app.request(`/oauth/github/start?state=${token}`, { redirect: "manual" });

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("github.com/login/oauth/authorize");
      expect(location).toContain("client_id=test-client-id-123");
      expect(location).toContain(`state=${token}`);
      expect(location).toContain("scope=repo");
    } finally {
      if (origId) {
        process.env.GITHUB_OAUTH_CLIENT_ID = origId;
      } else {
        delete process.env.GITHUB_OAUTH_CLIENT_ID;
      }
    }
  });

  it("GET /oauth/x/start includes PKCE challenge", async () => {
    const origId = process.env.X_OAUTH_CLIENT_ID;
    process.env.X_OAUTH_CLIENT_ID = "x-client-id-123";

    try {
      const token = generateState("x", "chat1", "telegram");
      const res = await app.request(`/oauth/x/start?state=${token}`, { redirect: "manual" });

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("twitter.com/i/oauth2/authorize");
      expect(location).toContain("code_challenge=");
      expect(location).toContain("code_challenge_method=S256");
    } finally {
      if (origId) {
        process.env.X_OAUTH_CLIENT_ID = origId;
      } else {
        delete process.env.X_OAUTH_CLIENT_ID;
      }
    }
  });

  it("GET /oauth/vercel/start includes PKCE challenge and scopes", async () => {
    const origId = process.env.VERCEL_OAUTH_CLIENT_ID;
    process.env.VERCEL_OAUTH_CLIENT_ID = "vercel-client-id-123";

    try {
      const token = generateState("vercel", "chat1", "telegram");
      const res = await app.request(`/oauth/vercel/start?state=${token}`, { redirect: "manual" });

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("vercel.com/oauth/authorize");
      expect(location).toContain("code_challenge=");
      expect(location).toContain("code_challenge_method=S256");
      expect(location).toContain("scope=openid");
    } finally {
      if (origId) {
        process.env.VERCEL_OAUTH_CLIENT_ID = origId;
      } else {
        delete process.env.VERCEL_OAUTH_CLIENT_ID;
      }
    }
  });

  it("GET /oauth/gdrive/start includes access_type=offline", async () => {
    const origId = process.env.GDRIVE_OAUTH_CLIENT_ID;
    process.env.GDRIVE_OAUTH_CLIENT_ID = "gdrive-client-id";

    try {
      const token = generateState("gdrive", "chat1", "telegram");
      const res = await app.request(`/oauth/gdrive/start?state=${token}`, { redirect: "manual" });

      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("access_type=offline");
      expect(location).toContain("prompt=consent");
    } finally {
      if (origId) {
        process.env.GDRIVE_OAUTH_CLIENT_ID = origId;
      } else {
        delete process.env.GDRIVE_OAUTH_CLIENT_ID;
      }
    }
  });

  it("GET /oauth/github/callback with error param returns 400", async () => {
    const res = await app.request("/oauth/github/callback?error=access_denied&error_description=User+denied");
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("User denied");
  });

  it("GET /oauth/github/callback without code returns 400", async () => {
    const res = await app.request("/oauth/github/callback?state=abc");
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Missing code or state");
  });

  it("GET /oauth/github/callback without state returns 400", async () => {
    const res = await app.request("/oauth/github/callback?code=abc");
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Missing code or state");
  });

  it("GET /oauth/github/callback with invalid state returns 400", async () => {
    const res = await app.request("/oauth/github/callback?code=abc&state=invalid-token");
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Invalid or expired state");
  });

  it("GET /oauth/github/callback with mismatched provider returns 400", async () => {
    // Create state for "x" but hit the "github" callback
    const token = generateState("x", "chat1", "telegram");
    const res = await app.request(`/oauth/github/callback?code=abc&state=${token}`);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("mismatch");
  });

  it("GET /oauth/github/callback with valid state but no client secret returns 503", async () => {
    const origId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const origSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    process.env.GITHUB_OAUTH_CLIENT_ID = "test-id";
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;

    try {
      const token = generateState("github", "chat1", "telegram");
      const res = await app.request(`/oauth/github/callback?code=test-code&state=${token}`);
      expect(res.status).toBe(503);
      const text = await res.text();
      expect(text).toContain("not configured");
    } finally {
      if (origId) {
        process.env.GITHUB_OAUTH_CLIENT_ID = origId;
      } else {
        delete process.env.GITHUB_OAUTH_CLIENT_ID;
      }
      if (origSecret) {
        process.env.GITHUB_OAUTH_CLIENT_SECRET = origSecret;
      }
    }
  });

  // ── XSS prevention ──────────────────────────────────────────────────

  it("rejects XSS in provider name (start route)", async () => {
    // Hono's router rejects malicious path segments before reaching our handler
    const res = await app.request("/oauth/<script>alert(1)</script>/start?state=abc");
    expect(res.status).toBe(404);
    const text = await res.text();
    // Must never render the raw script tag regardless of how it's rejected
    expect(text).not.toContain("<script>alert(1)</script>");
  });

  it("escapes XSS in error_description (callback route)", async () => {
    const xss = '<img src=x onerror=alert(1)>';
    const encoded = encodeURIComponent(xss);
    const res = await app.request(`/oauth/github/callback?error=bad&error_description=${encoded}`);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toContain("<img");
    expect(text).toContain("&lt;img");
  });

  it("escapes XSS in error param itself (callback route)", async () => {
    const xss = '"><script>alert(1)</script>';
    const encoded = encodeURIComponent(xss);
    const res = await app.request(`/oauth/github/callback?error=${encoded}`);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toContain("<script>");
  });

  it("escapes XSS in provider name (callback route)", async () => {
    const token = generateState("<script>alert(1)</script>", "chat1", "telegram");
    const res = await app.request(`/oauth/<script>alert(1)</script>/callback?code=abc&state=${token}`);
    const text = await res.text();
    // Should either 400 (state mismatch) or 404, but never render raw script tag
    expect(text).not.toContain("<script>alert(1)</script>");
  });

  // ── State token security ────────────────────────────────────────────

  it("state tokens are 256-bit (64 hex chars)", () => {
    const token = generateState("github", "chat1", "telegram");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    // Clean up
    consumeState(token);
  });

  it("state tokens are single-use — replay returns null", () => {
    const token = generateState("github", "chat1", "telegram");
    expect(consumeState(token)).not.toBeNull();
    expect(consumeState(token)).toBeNull(); // Replay attempt
  });

  it("consumed state cannot be used in callback", async () => {
    const origId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const origSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    process.env.GITHUB_OAUTH_CLIENT_ID = "test-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "test-secret";

    try {
      const token = generateState("github", "chat1", "telegram");
      // First consume (simulating an attacker who got the token)
      consumeState(token);
      // Second attempt via the actual callback
      const res = await app.request(`/oauth/github/callback?code=abc&state=${token}`);
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain("Invalid or expired state");
    } finally {
      if (origId) {
        process.env.GITHUB_OAUTH_CLIENT_ID = origId;
      } else {
        delete process.env.GITHUB_OAUTH_CLIENT_ID;
      }
      if (origSecret) {
        process.env.GITHUB_OAUTH_CLIENT_SECRET = origSecret;
      } else {
        delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
      }
    }
  });
});
