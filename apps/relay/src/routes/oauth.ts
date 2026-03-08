// Relay — OAuth proxy (start + callback + refresh).
//
// Two modes of operation for /callback:
//   1. Relay-side exchange (when relay has client secret): exchanges code for
//      tokens, sends tokens to daemon via WebSocket, returns success HTML.
//   2. Daemon-side exchange (fallback): forwards raw callback to daemon.
//
// Start flow is always proxied to daemon (daemon builds auth URL with PKCE).

import { Hono } from "hono";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { getConnection, sendTo } from "../connections.js";
import {
  TOKEN_EXCHANGE_PROVIDERS,
  exchangeCodeForTokens,
  refreshAccessToken,
  buildAuthorizationUrl,
} from "../../../../src/shared/oauth-exchange.js";
import type {
  RelayOAuthCallbackMessage,
  RelayOAuthStartMessage,
  RelayOAuthResultMessage,
  RelayOAuthTokensMessage,
} from "../../../../src/shared/relay-protocol.js";
import { RELAY_MAX_PENDING_OAUTH, parseCompositeState } from "../../../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// Pending OAuth requests — waiting for daemon response
// ---------------------------------------------------------------------------

interface PendingOAuth {
  resolve: (result: RelayOAuthResultMessage) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingCallbacks = new Map<string, PendingOAuth>();

/** Pending PKCE verifiers — stored between /start and /callback. */
interface PendingPKCE {
  codeVerifier: string;
  createdAt: number;
}

const pendingPKCE = new Map<string, PendingPKCE>();

/** PKCE verifier timeout — must complete callback within 10 minutes. */
const PKCE_TIMEOUT_MS = 10 * 60 * 1000;

/** OAuth request timeout — how long to wait for daemon response. */
const OAUTH_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// OAuth credentials for relay-side exchange (from env vars)
// ---------------------------------------------------------------------------

interface RelayOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Provider → env var mapping for relay-specific credentials.
 *
 * Uses RELAY_ prefix to avoid collision with daemon/user env vars (which share
 * the same process.env in Bun). The CF Worker uses separate Env bindings and
 * doesn't need this prefix.
 */
const PROVIDER_CREDENTIAL_MAP: ReadonlyMap<string, { clientIdKey: string; clientSecretKey: string }> = new Map([
  ["stripe",   { clientIdKey: "RELAY_STRIPE_OAUTH_CLIENT_ID",    clientSecretKey: "RELAY_STRIPE_OAUTH_CLIENT_SECRET" }],
  ["github",   { clientIdKey: "RELAY_GITHUB_OAUTH_CLIENT_ID",    clientSecretKey: "RELAY_GITHUB_OAUTH_CLIENT_SECRET" }],
  ["x",        { clientIdKey: "RELAY_X_OAUTH_CLIENT_ID",         clientSecretKey: "RELAY_X_OAUTH_CLIENT_SECRET" }],
  ["gdrive",   { clientIdKey: "RELAY_GOOGLE_OAUTH_CLIENT_ID",    clientSecretKey: "RELAY_GOOGLE_OAUTH_CLIENT_SECRET" }],
  ["gmail",    { clientIdKey: "RELAY_GOOGLE_OAUTH_CLIENT_ID",    clientSecretKey: "RELAY_GOOGLE_OAUTH_CLIENT_SECRET" }],
  ["onedrive", { clientIdKey: "RELAY_MICROSOFT_OAUTH_CLIENT_ID", clientSecretKey: "RELAY_MICROSOFT_OAUTH_CLIENT_SECRET" }],
  ["outlook",  { clientIdKey: "RELAY_MICROSOFT_OAUTH_CLIENT_ID", clientSecretKey: "RELAY_MICROSOFT_OAUTH_CLIENT_SECRET" }],
  ["vercel",   { clientIdKey: "RELAY_VERCEL_OAUTH_CLIENT_ID",    clientSecretKey: "RELAY_VERCEL_OAUTH_CLIENT_SECRET" }],
  ["discord",  { clientIdKey: "RELAY_DISCORD_OAUTH_CLIENT_ID",   clientSecretKey: "RELAY_DISCORD_OAUTH_CLIENT_SECRET" }],
]);

function getRelayCredentials(provider: string): RelayOAuthCredentials | undefined {
  const mapping = PROVIDER_CREDENTIAL_MAP.get(provider);
  if (!mapping) return undefined;

  const clientId = process.env[mapping.clientIdKey];
  const clientSecret = process.env[mapping.clientSecretKey];

  if (!clientId || !clientSecret) return undefined;
  return { clientId, clientSecret };
}

// ---------------------------------------------------------------------------
// Callback resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a pending OAuth result from a daemon's `oauth_result` message.
 * Called by the WebSocket message handler when it receives an oauth_result.
 */
export function resolveOAuthCallback(result: RelayOAuthResultMessage): void {
  // Store PKCE verifier if the daemon sent one
  if (result.codeVerifier) {
    pendingPKCE.set(result.requestId, {
      codeVerifier: result.codeVerifier,
      createdAt: Date.now(),
    });
  }

  const pending = pendingCallbacks.get(result.requestId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingCallbacks.delete(result.requestId);
    pending.resolve(result);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract userId from the composite state query parameter. */
function extractUserId(c: { req: { url: string } }): string | null {
  const url = new URL(c.req.url);
  const state = url.searchParams.get("state");
  if (!state) return null;
  const parsed = parseCompositeState(state);
  return parsed?.userId ?? null;
}

function extractStateToken(c: { req: { url: string } }): string | null {
  const url = new URL(c.req.url);
  const state = url.searchParams.get("state");
  if (!state) return null;
  const parsed = parseCompositeState(state);
  return parsed?.token ?? state;
}

function prunePKCE(): void {
  const now = Date.now();
  for (const [key, entry] of pendingPKCE) {
    if (now - entry.createdAt > PKCE_TIMEOUT_MS) {
      pendingPKCE.delete(key);
    }
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  daemon_offline: "Your Jeriko daemon is not connected. Start it with `jeriko server start`.",
  too_many_requests: "Too many pending OAuth requests. Please try again.",
  connection_lost: "Failed to reach your daemon (connection lost).",
};

/**
 * Forward an OAuth request to the daemon and wait for a response.
 */
async function forwardToDaemon(
  userId: string,
  message: RelayOAuthStartMessage | RelayOAuthCallbackMessage,
): Promise<RelayOAuthResultMessage | { error: string; statusCode: number }> {
  const conn = getConnection(userId);
  if (!conn) {
    return { error: "daemon_offline", statusCode: 503 };
  }

  if (pendingCallbacks.size >= RELAY_MAX_PENDING_OAUTH) {
    return { error: "too_many_requests", statusCode: 429 };
  }

  const resultPromise = new Promise<RelayOAuthResultMessage>((resolve) => {
    const timer = setTimeout(() => {
      pendingCallbacks.delete(message.requestId);
      resolve({
        type: "oauth_result",
        requestId: message.requestId,
        statusCode: 504,
        html: errorHtml("Daemon did not respond in time. Check if it's running."),
      });
    }, OAUTH_TIMEOUT_MS);

    pendingCallbacks.set(message.requestId, { resolve, timer });
  });

  const sent = sendTo(userId, message);
  if (!sent) {
    const pending = pendingCallbacks.get(message.requestId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingCallbacks.delete(message.requestId);
    }
    return { error: "connection_lost", statusCode: 503 };
  }

  return resultPromise;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function oauthRoutes(): Hono {
  const router = new Hono();

  // Legacy redirects
  router.get("/:userId/:provider/start", (c) => {
    const provider = c.req.param("provider");
    const qs = new URL(c.req.url).search;
    return c.redirect(`/oauth/${provider}/start${qs}`, 301);
  });

  router.get("/:userId/:provider/callback", (c) => {
    const provider = c.req.param("provider");
    const qs = new URL(c.req.url).search;
    return c.redirect(`/oauth/${provider}/callback${qs}`, 301);
  });

  /**
   * GET /oauth/:provider/start — Build auth URL and redirect.
   *
   * Two modes:
   *   1. Relay-side (default): Relay has credentials → builds auth URL directly,
   *      stores PKCE verifier if needed, redirects to provider's consent page.
   *   2. Daemon-side (fallback): No relay credentials → forwards to daemon.
   */
  router.get("/:provider/start", async (c) => {
    const provider = c.req.param("provider");
    const userId = extractUserId(c);
    const stateToken = extractStateToken(c);
    const compositeState = new URL(c.req.url).searchParams.get("state") ?? "";

    if (!userId) {
      return c.html(errorHtml("Missing or invalid state parameter."), 400);
    }

    // Attempt relay-side auth URL building
    const credentials = getRelayCredentials(provider);
    const providerConfig = TOKEN_EXCHANGE_PROVIDERS.get(provider);

    if (credentials && providerConfig) {
      // Relay has credentials — build the auth URL directly
      const reqUrl = new URL(c.req.url);
      const redirectUri = `${reqUrl.protocol}//${reqUrl.host}/oauth/${provider}/callback`;
      // Build provider-specific context from query params (e.g. ?shop=mystore for Shopify)
      const startContext: Record<string, string> = {};
      for (const [key, value] of reqUrl.searchParams) {
        if (key !== "state") startContext[key] = value;
      }
      const result = await buildAuthorizationUrl(providerConfig, credentials.clientId, redirectUri, compositeState, Object.keys(startContext).length > 0 ? startContext : undefined);

      if (result.codeVerifier && stateToken) {
        pendingPKCE.set(stateToken, {
          codeVerifier: result.codeVerifier,
          createdAt: Date.now(),
        });
      }

      return c.redirect(result.url, 302);
    }

    // Fallback: forward to daemon
    const params: Record<string, string> = {};
    for (const [key, value] of new URL(c.req.url).searchParams) {
      params[key] = value;
    }

    const message: RelayOAuthStartMessage = {
      type: "oauth_start",
      requestId: randomUUID(),
      provider,
      params,
    };

    const result = await forwardToDaemon(userId, message);

    if ("error" in result) {
      return c.html(errorHtml(ERROR_MESSAGES[result.error]!), result.statusCode);
    }

    if (result.codeVerifier && stateToken) {
      pendingPKCE.set(stateToken, {
        codeVerifier: result.codeVerifier,
        createdAt: Date.now(),
      });
      pendingPKCE.delete(result.requestId);
    }

    if (result.redirectUrl) {
      return c.redirect(result.redirectUrl, 302);
    }

    return c.html(result.html, result.statusCode);
  });

  /**
   * GET /oauth/:provider/callback — Relay-side or daemon-side exchange.
   */
  router.get("/:provider/callback", async (c) => {
    const provider = c.req.param("provider");
    const userId = extractUserId(c);
    const stateToken = extractStateToken(c);

    if (!userId) {
      return c.html(errorHtml("Missing or invalid state parameter."), 400);
    }

    const conn = getConnection(userId);
    if (!conn) {
      return c.html(errorHtml(ERROR_MESSAGES.daemon_offline), 503);
    }

    // Check for OAuth error from provider
    const url = new URL(c.req.url);
    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      const desc = url.searchParams.get("error_description") ?? oauthError;
      return c.html(errorHtml(desc), 400);
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return c.html(errorHtml("Missing authorization code."), 400);
    }

    // Attempt relay-side token exchange
    const credentials = getRelayCredentials(provider);
    const exchangeProvider = TOKEN_EXCHANGE_PROVIDERS.get(provider);

    if (credentials && exchangeProvider) {
      // Look up PKCE verifier
      let codeVerifier: string | undefined;
      if (stateToken) {
        prunePKCE();
        const pkce = pendingPKCE.get(stateToken);
        if (pkce) {
          codeVerifier = pkce.codeVerifier;
          pendingPKCE.delete(stateToken);
        }
      }

      // Build provider-specific context from query params (e.g. ?shop=mystore for Shopify)
      const callbackContext: Record<string, string> = {};
      for (const [key, value] of url.searchParams) {
        if (key !== "state" && key !== "code" && key !== "error" && key !== "error_description") {
          callbackContext[key] = value;
        }
      }
      const exchangeContext = Object.keys(callbackContext).length > 0 ? callbackContext : undefined;

      // Build redirect URI — must match what was used in /start
      // The Bun relay uses a configurable base URL for dev
      const relayBaseUrl = process.env.RELAY_PUBLIC_URL ?? `http://127.0.0.1:${process.env.RELAY_PORT ?? "8080"}`;
      const redirectUri = `${relayBaseUrl}/oauth/${provider}/callback`;

      try {
        const tokens = await exchangeCodeForTokens({
          provider: exchangeProvider,
          code,
          redirectUri,
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          codeVerifier,
          context: exchangeContext,
        });

        // Send tokens to daemon via WebSocket
        const tokenMessage: RelayOAuthTokensMessage = {
          type: "oauth_tokens",
          requestId: randomUUID(),
          provider,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          scope: tokens.scope,
          tokenType: tokens.tokenType,
        };

        const sent = sendTo(userId, tokenMessage);
        if (!sent) {
          return c.html(
            errorHtml("Token exchange succeeded but your daemon disconnected. Restart and try again."),
            503,
          );
        }

        const label = provider.charAt(0).toUpperCase() + provider.slice(1);
        return c.html(successHtml(label), 200);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[relay] OAuth exchange failed for ${provider}: ${message}`);
        return c.html(errorHtml("Token exchange failed. Please try again."), 502);
      }
    }

    // Fallback: forward to daemon for exchange
    const params: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      params[key] = value;
    }

    const callbackMessage: RelayOAuthCallbackMessage = {
      type: "oauth_callback",
      requestId: randomUUID(),
      provider,
      params,
    };

    const result = await forwardToDaemon(userId, callbackMessage);

    if ("error" in result) {
      return c.html(errorHtml(ERROR_MESSAGES[result.error]!), result.statusCode);
    }

    return c.html(result.html, result.statusCode);
  });

  /**
   * POST /oauth/:provider/refresh — Relay-side token refresh.
   */
  router.post("/:provider/refresh", async (c) => {
    const provider = c.req.param("provider");

    // Verify auth
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ ok: false, error: "Missing authorization" }, 401);
    }

    const relaySecret = process.env.RELAY_AUTH_SECRET;
    if (!relaySecret) {
      return c.json({ ok: false, error: "Relay not configured" }, 500);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(relaySecret);
    if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
      return c.json({ ok: false, error: "Invalid authorization" }, 403);
    }

    const credentials = getRelayCredentials(provider);
    const exchangeProvider = TOKEN_EXCHANGE_PROVIDERS.get(provider);

    if (!credentials || !exchangeProvider) {
      return c.json({ ok: false, error: `No relay credentials for ${provider}` }, 404);
    }

    let body: Record<string, string>;
    try {
      body = await c.req.json() as Record<string, string>;
    } catch {
      return c.json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const refreshToken = body.refreshToken;
    if (!refreshToken) {
      return c.json({ ok: false, error: "Missing refreshToken" }, 400);
    }

    try {
      const result = await refreshAccessToken({
        provider: exchangeProvider,
        refreshToken,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        scope: body.scope,
      });

      return c.json({
        ok: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[relay] Token refresh failed for ${provider}: ${msg}`);
      return c.json({ ok: false, error: "Token refresh failed" }, 502);
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function errorHtml(message: string): string {
  const safe = message.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
    return map[ch]!;
  });
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jeriko — Error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
h1{font-size:1.4rem;margin-bottom:.5rem;color:#f87171}p{color:#888;margin-top:.5rem}</style></head>
<body><div class="card"><h1>Connection Error</h1><p>${safe}</p></div></body></html>`;
}

function successHtml(label: string): string {
  const safe = label.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
    return map[ch]!;
  });
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jeriko — Connected</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
h1{font-size:1.4rem;margin-bottom:.5rem}p{color:#888;margin-top:.5rem}</style></head>
<body><div class="card"><h1>${safe} connected</h1><p>You can close this tab.</p></div></body></html>`;
}
