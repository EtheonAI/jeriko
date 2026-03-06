// OAuth 2.0 redirect flow routes.
//
// Two unauthenticated endpoints:
//   GET /oauth/:provider/start?state=<token>  — redirects to provider consent page
//   GET /oauth/:provider/callback?code=...    — exchanges code, saves token, notifies user
//
// The state token ties the browser redirect back to the originating Telegram chat.
// Tokens are saved via saveSecret() — same .env file, same process.env injection.
// Connectors don't need any changes; they already read from process.env.
//
// Security:
//   - All user-facing HTML output is escaped to prevent XSS
//   - Token values are never logged (only env var names)
//   - State tokens are single-use, 256-bit random, 10-minute expiry
//   - CSRF protection via state token binding to provider + chat
//   - PKCE for providers that require it (X/Twitter)
//   - Token exchange errors are logged without leaking secrets

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";
import { saveSecret } from "../../../shared/secrets.js";
import { redact } from "../../security/redaction.js";
import { getOAuthProvider, getClientId, hasLocalSecret } from "../../services/oauth/providers.js";
import {
  consumeState,
  setCodeVerifier,
  generateCodeVerifier,
  generateCodeChallenge,
} from "../../services/oauth/state.js";
import type { ChannelRegistry } from "../../services/channels/index.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Security: HTML entity escaping — prevents XSS in rendered HTML
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]!);
}

// ---------------------------------------------------------------------------
// Callback URL — uses shared URL builder for relay-aware routing
// ---------------------------------------------------------------------------

import { buildOAuthCallbackUrl } from "../../../shared/urls.js";

// ---------------------------------------------------------------------------
// HTML response for the browser after callback
// ---------------------------------------------------------------------------

function successHtml(label: string): string {
  const safe = escapeHtml(label);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jeriko — Connected</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
h1{font-size:1.4rem;margin-bottom:.5rem}p{color:#888;margin-top:.5rem}</style></head>
<body><div class="card"><h1>${safe} connected</h1><p>You can close this tab and return to Telegram.</p></div></body></html>`;
}

function errorHtml(message: string): string {
  const safe = escapeHtml(message);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jeriko — Error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
h1{font-size:1.4rem;margin-bottom:.5rem;color:#f87171}p{color:#888;margin-top:.5rem}</style></head>
<body><div class="card"><h1>Connection failed</h1><p>${safe}</p></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Core callback handler — used by both Hono route and relay WebSocket
// ---------------------------------------------------------------------------

export interface OAuthCallbackResult {
  statusCode: number;
  html: string;
}

/**
 * Process an OAuth callback — validate state, exchange code, save token.
 *
 * This is the shared core for both direct HTTP callbacks (Hono route) and
 * relay-forwarded callbacks (WebSocket via kernel). Extracting it ensures
 * identical behavior regardless of how the callback arrives.
 *
 * @param providerName - The OAuth provider name (e.g. "github", "x")
 * @param params       - Query parameters from the callback URL
 * @param channels     - Optional channel registry for user notification
 */
export async function handleOAuthCallback(
  providerName: string,
  params: Record<string, string>,
  channels?: ChannelRegistry | null,
): Promise<OAuthCallbackResult> {
  const code = params.code;
  const stateToken = params.state;
  const error = params.error;

  // Provider returned an error (user denied, etc.)
  if (error) {
    const desc = params.error_description ?? error;
    log.warn(`OAuth callback error from ${providerName}: ${desc}`);
    return { statusCode: 400, html: errorHtml(desc) };
  }

  if (!code || !stateToken) {
    return { statusCode: 400, html: errorHtml("Missing code or state parameter.") };
  }

  // Validate and consume state (CSRF protection)
  const pending = consumeState(stateToken);
  if (!pending) {
    return { statusCode: 400, html: errorHtml("Invalid or expired state. Please try /connect again.") };
  }

  if (pending.provider !== providerName) {
    return { statusCode: 400, html: errorHtml("State/provider mismatch.") };
  }

  const provider = getOAuthProvider(providerName);
  if (!provider) {
    return { statusCode: 404, html: errorHtml(`Unknown provider: ${providerName}`) };
  }

  const clientId = getClientId(provider);
  const clientSecret = hasLocalSecret(provider) ? process.env[provider.clientSecretVar]! : undefined;
  if (!clientId) {
    return { statusCode: 503, html: errorHtml(`${provider.label} OAuth client ID is not configured.`) };
  }
  if (!clientSecret) {
    // No local secret — relay should have handled the token exchange.
    // If we got here, something went wrong (e.g. self-hosted without credentials).
    return { statusCode: 503, html: errorHtml(`${provider.label} OAuth client secret is not configured. Use relay mode or set ${provider.clientSecretVar}.`) };
  }

  const redirectUri = buildOAuthCallbackUrl(provider.name);

  // Exchange authorization code for access token.
  //
  // Two auth modes for token exchange:
  // - "body" (default): client_id + client_secret in the POST body.
  // - "basic": HTTP Basic auth (Stripe uses secret API key as username).
  const useBasicAuth = provider.tokenExchangeAuth === "basic";

  const tokenParams: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };

  if (!useBasicAuth) {
    tokenParams.client_id = clientId;
    tokenParams.client_secret = clientSecret;
  }

  // Include PKCE code_verifier if applicable
  if (pending.codeVerifier) {
    tokenParams.code_verifier = pending.codeVerifier;
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };

    if (useBasicAuth) {
      // Stripe-style: secret key as Basic auth username, empty password
      headers.Authorization = `Basic ${Buffer.from(clientSecret + ":").toString("base64")}`;
    }

    const tokenResponse = await fetch(provider.tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams(tokenParams).toString(),
    });

    if (!tokenResponse.ok) {
      // Log status + redacted body — never log raw token exchange responses
      const body = await tokenResponse.text();
      log.error(`OAuth token exchange failed for ${provider.label}: ${tokenResponse.status} ${redact(body)}`);
      return { statusCode: 502, html: errorHtml(`Token exchange failed (${tokenResponse.status}). Please try again.`) };
    }

    const tokenData = (await tokenResponse.json()) as Record<string, unknown>;
    const accessToken = tokenData.access_token as string | undefined;

    if (!accessToken) {
      // Log only the keys present, never the values
      const keys = Object.keys(tokenData).join(", ");
      log.error(`OAuth token exchange returned no access_token for ${provider.label} (keys: ${keys})`);
      return { statusCode: 502, html: errorHtml("No access token returned. Please try again.") };
    }

    // Save access token
    saveSecret(provider.tokenEnvVar, accessToken);
    log.info(`OAuth: saved ${provider.tokenEnvVar} for ${provider.label}`);

    // Save refresh token if provided
    if (provider.refreshTokenEnvVar && tokenData.refresh_token) {
      saveSecret(provider.refreshTokenEnvVar, tokenData.refresh_token as string);
      log.info(`OAuth: saved ${provider.refreshTokenEnvVar} for ${provider.label}`);
    }

    // Notify user via their originating channel
    if (channels) {
      try {
        await channels.send(
          pending.channelName,
          pending.chatId,
          `${provider.label} connected. Use /health ${provider.name} to verify.`,
        );
      } catch (err) {
        log.warn(`OAuth: failed to send confirmation to ${pending.channelName}: ${err}`);
      }
    }

    return { statusCode: 200, html: successHtml(provider.label) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`OAuth token exchange error for ${provider.label}: ${redact(message)}`);
    return { statusCode: 502, html: errorHtml("Token exchange failed. Check server logs.") };
  }
}

// ---------------------------------------------------------------------------
// Core start handler — used by both Hono route and relay WebSocket
// ---------------------------------------------------------------------------

export interface OAuthStartResult {
  statusCode: number;
  html: string;
  /** The provider's authorization URL — relay issues a 302 redirect to this. */
  redirectUrl?: string;
  /**
   * PKCE code verifier — included when the provider uses PKCE so the relay
   * can store it for use in the code→token exchange during /callback.
   */
  codeVerifier?: string;
}

/**
 * Process an OAuth start request — validate state, build authorization URL.
 *
 * Shared core for both direct HTTP (Hono route) and relay-forwarded start
 * requests (WebSocket via kernel). Returns a redirect URL on success, or
 * an error HTML page on failure.
 *
 * @param providerName - The OAuth provider name (e.g. "github", "x")
 * @param params       - Query parameters from the start URL (must include state)
 */
export function handleOAuthStart(
  providerName: string,
  params: Record<string, string>,
): OAuthStartResult {
  const stateToken = params.state;

  if (!stateToken) {
    return { statusCode: 400, html: errorHtml("Missing state parameter. Use /connect from your messaging channel.") };
  }

  const provider = getOAuthProvider(providerName);
  if (!provider) {
    return { statusCode: 404, html: errorHtml(`Unknown provider: ${providerName}`) };
  }

  const clientId = getClientId(provider);
  if (!clientId) {
    return { statusCode: 503, html: errorHtml(`${provider.label} OAuth is not configured. Set ${provider.clientIdVar} or use baked-in credentials.`) };
  }

  const redirectUri = buildOAuthCallbackUrl(provider.name);

  // Build authorization URL
  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state: stateToken,
    response_type: "code",
  });

  if (provider.scopes.length > 0) {
    authParams.set("scope", provider.scopes.join(" "));
  }

  // PKCE for providers that require it (e.g. X/Twitter)
  let codeVerifier: string | undefined;
  if (provider.usePKCE) {
    codeVerifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(codeVerifier);
    setCodeVerifier(stateToken, codeVerifier);
    authParams.set("code_challenge", challenge);
    authParams.set("code_challenge_method", "S256");
  }

  // Extra auth params (e.g. Google's access_type=offline)
  if (provider.extraTokenParams) {
    for (const [key, value] of Object.entries(provider.extraTokenParams)) {
      if (key === "access_type" || key === "prompt") {
        authParams.set(key, value);
      }
    }
  }

  const authorizationUrl = `${provider.authUrl}?${authParams.toString()}`;
  log.info(`OAuth start: redirecting to ${provider.label}`);

  // Include codeVerifier so the relay can store it for relay-side exchange
  return { statusCode: 302, html: "", redirectUrl: authorizationUrl, codeVerifier };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function oauthRoutes(): Hono {
  const router = new Hono();

  // ── Start: redirect user to provider consent page ──────────────────

  router.get("/:provider/start", (c) => {
    const providerName = c.req.param("provider");

    // Collect query parameters into a plain object
    const params: Record<string, string> = {};
    for (const [key, value] of new URL(c.req.url).searchParams) {
      params[key] = value;
    }

    const result = handleOAuthStart(providerName, params);

    if (result.redirectUrl) {
      return c.redirect(result.redirectUrl, 302);
    }
    return c.html(result.html, result.statusCode as import("hono/utils/http-status").ContentfulStatusCode);
  });

  // ── Callback: exchange code for token ──────────────────────────────
  // Delegates to handleOAuthCallback() — the shared core used by both
  // direct HTTP and relay-forwarded callbacks.

  router.get("/:provider/callback", async (c) => {
    const providerName = c.req.param("provider");

    // Collect all query parameters into a plain object
    const params: Record<string, string> = {};
    for (const [key, value] of new URL(c.req.url).searchParams) {
      params[key] = value;
    }

    const channels = c.get("channels" as never) as ChannelRegistry | undefined;
    const result = await handleOAuthCallback(providerName, params, channels);
    return c.html(result.html, result.statusCode as import("hono/utils/http-status").ContentfulStatusCode);
  });

  return router;
}
