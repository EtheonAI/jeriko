// Relay Worker — OAuth proxy (start + callback + refresh).
//
// Two modes of operation for /callback:
//   1. Relay-side exchange (default): Relay has client secret → exchanges code
//      for tokens → sends tokens to daemon via WebSocket → returns success HTML.
//   2. Daemon-side exchange (fallback): Relay doesn't have secret → forwards
//      raw callback to daemon → daemon exchanges code → daemon returns HTML.
//
// Start flow is always proxied to daemon (daemon builds auth URL with PKCE).
//
// Routes:
//   GET /oauth/:provider/start?state=userId.token   → daemon builds auth URL → 302
//   GET /oauth/:provider/callback?code=...&state=... → relay or daemon exchanges code
//   POST /oauth/:provider/refresh                    → relay refreshes token

import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ConnectionManager } from "../connections.js";
import type { Env } from "../lib/types.js";
import { getRelayOAuthCredentials } from "../lib/oauth-secrets.js";
import {
  TOKEN_EXCHANGE_PROVIDERS,
  exchangeCodeForTokens,
  refreshAccessToken,
} from "../../../../src/shared/oauth-exchange.js";
import type {
  RelayOAuthCallbackMessage,
  RelayOAuthStartMessage,
  RelayOAuthResultMessage,
  RelayOAuthTokensMessage,
} from "../../../../src/shared/relay-protocol.js";
import { RELAY_MAX_PENDING_OAUTH, parseCompositeState } from "../../../../src/shared/relay-protocol.js";
import { errorHtml, successHtml } from "../lib/html.js";

// ---------------------------------------------------------------------------
// Pending OAuth callback types
// ---------------------------------------------------------------------------

export interface PendingOAuth {
  resolve: (result: RelayOAuthResultMessage) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** OAuth callback timeout — how long to wait for daemon response. */
const OAUTH_CALLBACK_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Pending PKCE verifiers — stored between /start and /callback
// ---------------------------------------------------------------------------

export interface PendingPKCE {
  codeVerifier: string;
  createdAt: number;
}

/** PKCE verifier timeout — must complete callback within 10 minutes. */
const PKCE_TIMEOUT_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Callback resolution (called from WebSocket message handler)
// ---------------------------------------------------------------------------

/**
 * Resolve a pending OAuth callback from a daemon's `oauth_result` message.
 * Also extracts and stores PKCE verifier if present (for relay-side exchange).
 */
export function resolveOAuthCallback(
  pendingCallbacks: Map<string, PendingOAuth>,
  pendingPKCE: Map<string, PendingPKCE>,
  result: RelayOAuthResultMessage,
): void {
  // Store PKCE verifier if the daemon sent one (used in /callback exchange)
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

/**
 * Prune expired PKCE verifiers to prevent unbounded growth.
 */
function prunePKCE(pendingPKCE: Map<string, PendingPKCE>): void {
  const now = Date.now();
  for (const [key, entry] of pendingPKCE) {
    if (now - entry.createdAt > PKCE_TIMEOUT_MS) {
      pendingPKCE.delete(key);
    }
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

/**
 * Extract the raw state token (without userId prefix) from the composite state.
 * Used for PKCE verifier lookup — the daemon's /start stores verifiers keyed by
 * the requestId, but the relay maps them by composite state for callback lookup.
 */
function extractStateToken(c: { req: { url: string } }): string | null {
  const url = new URL(c.req.url);
  const state = url.searchParams.get("state");
  if (!state) return null;
  const parsed = parseCompositeState(state);
  return parsed?.token ?? state;
}

const ERROR_MESSAGES: Record<string, string> = {
  daemon_offline: "Your Jeriko daemon is not connected. Start it with `jeriko server start`.",
  too_many_requests: "Too many pending OAuth requests. Please try again.",
  connection_lost: "Failed to reach your daemon (connection lost).",
};

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create OAuth routes with the given dependencies.
 *
 * @param connections      - ConnectionManager instance from the Durable Object
 * @param pendingCallbacks - Shared map of pending OAuth callbacks (owned by DO)
 * @param env              - Worker environment with OAuth client secrets
 * @param pendingPKCE      - Shared map of pending PKCE verifiers (owned by DO)
 */
export function createOAuthRoutes(
  connections: ConnectionManager,
  pendingCallbacks: Map<string, PendingOAuth>,
  env: Env,
  pendingPKCE: Map<string, PendingPKCE>,
): Hono {
  const router = new Hono();

  // Legacy redirect: /oauth/:userId/:provider/start → /oauth/:provider/start
  router.get("/:userId/:provider/start", (c) => {
    const provider = c.req.param("provider");
    const qs = new URL(c.req.url).search;
    return c.redirect(`/oauth/${provider}/start${qs}`, 301);
  });

  // Legacy redirect: /oauth/:userId/:provider/callback → /oauth/:provider/callback
  router.get("/:userId/:provider/callback", (c) => {
    const provider = c.req.param("provider");
    const qs = new URL(c.req.url).search;
    return c.redirect(`/oauth/${provider}/callback${qs}`, 301);
  });

  /**
   * GET /oauth/:provider/start?state=userId.token — Forward to daemon.
   *
   * The daemon has the OAuth client_id and builds the authorization URL
   * locally. We forward the request via WebSocket and redirect the browser
   * to the provider's consent page. userId is extracted from composite state.
   *
   * When the daemon responds with a codeVerifier (PKCE), we store it in
   * pendingPKCE keyed by the state token for use in /callback.
   */
  router.get("/:provider/start", async (c) => {
    const provider = c.req.param("provider");
    const userId = extractUserId(c);
    const stateToken = extractStateToken(c);

    if (!userId) {
      return c.html(errorHtml("Missing or invalid state parameter."), 400);
    }

    const conn = connections.getConnection(userId);
    if (!conn) {
      return c.html(
        errorHtml(ERROR_MESSAGES.daemon_offline),
        503,
      );
    }

    // Guard against flooding
    if (pendingCallbacks.size >= RELAY_MAX_PENDING_OAUTH) {
      return c.html(
        errorHtml(ERROR_MESSAGES.too_many_requests),
        429,
      );
    }

    // Collect all query parameters
    const params: Record<string, string> = {};
    for (const [key, value] of new URL(c.req.url).searchParams) {
      params[key] = value;
    }

    const requestId = crypto.randomUUID();

    const message: RelayOAuthStartMessage = {
      type: "oauth_start",
      requestId,
      provider,
      params,
    };

    // Create a promise that resolves when daemon responds or times out
    const resultPromise = new Promise<RelayOAuthResultMessage>((resolve) => {
      const timer = setTimeout(() => {
        pendingCallbacks.delete(requestId);
        resolve({
          type: "oauth_result",
          requestId,
          statusCode: 504,
          html: errorHtml("Daemon did not respond in time. Check if it's running."),
        });
      }, OAUTH_CALLBACK_TIMEOUT_MS);

      pendingCallbacks.set(requestId, { resolve, timer });
    });

    const sent = connections.sendTo(userId, message);
    if (!sent) {
      const pending = pendingCallbacks.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingCallbacks.delete(requestId);
      }
      return c.html(
        errorHtml(ERROR_MESSAGES.connection_lost),
        503,
      );
    }

    const result = await resultPromise;

    // Store PKCE verifier keyed by state token (for /callback lookup).
    // resolveOAuthCallback already stored it by requestId; we also store
    // by state token since /callback only has the state, not the requestId.
    if (result.codeVerifier && stateToken) {
      pendingPKCE.set(stateToken, {
        codeVerifier: result.codeVerifier,
        createdAt: Date.now(),
      });
      // Clean up the requestId-keyed entry
      pendingPKCE.delete(requestId);
    }

    // Daemon returned a redirect URL — issue a 302 to the provider
    if (result.redirectUrl) {
      return c.redirect(result.redirectUrl, 302);
    }

    return c.html(result.html, result.statusCode as ContentfulStatusCode);
  });

  /**
   * GET /oauth/:provider/callback?code=...&state=userId.token
   *
   * Two modes:
   *   1. Relay-side exchange: relay has client secret → exchange code, send
   *      tokens to daemon via WebSocket, return success HTML to browser.
   *   2. Daemon-side exchange: relay doesn't have secret → forward to daemon
   *      via WebSocket, daemon exchanges code and returns HTML.
   */
  router.get("/:provider/callback", async (c) => {
    const provider = c.req.param("provider");
    const userId = extractUserId(c);
    const stateToken = extractStateToken(c);

    if (!userId) {
      return c.html(errorHtml("Missing or invalid state parameter."), 400);
    }

    const conn = connections.getConnection(userId);
    if (!conn) {
      return c.html(
        errorHtml(ERROR_MESSAGES.daemon_offline),
        503,
      );
    }

    // Check for OAuth error from provider (user denied, etc.)
    const url = new URL(c.req.url);
    const error = url.searchParams.get("error");
    if (error) {
      const desc = url.searchParams.get("error_description") ?? error;
      return c.html(errorHtml(desc), 400);
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return c.html(errorHtml("Missing authorization code."), 400);
    }

    // Attempt relay-side token exchange
    const credentials = getRelayOAuthCredentials(provider, env);
    const exchangeProvider = TOKEN_EXCHANGE_PROVIDERS.get(provider);

    if (credentials && exchangeProvider) {
      // Relay has credentials — do the exchange here
      return handleRelayExchange(c, {
        provider,
        userId,
        code,
        stateToken,
        credentials,
        exchangeProvider,
        connections,
        pendingPKCE,
      });
    }

    // Fallback: forward to daemon for exchange
    return handleDaemonExchange(c, {
      provider,
      userId,
      connections,
      pendingCallbacks,
    });
  });

  /**
   * POST /oauth/:provider/refresh — Relay-side token refresh.
   *
   * Used by daemons that don't have local client secrets. The daemon sends
   * its refresh token, and the relay uses its client secret to get a new
   * access token from the provider.
   *
   * Auth: HMAC signature via relay auth (same as WebSocket auth).
   */
  router.post("/:provider/refresh", async (c) => {
    const provider = c.req.param("provider");

    // Verify auth — relay auth secret in Authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ ok: false, error: "Missing authorization" }, 401);
    }

    // Simple bearer token auth — matches relay auth secret
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token !== env.RELAY_AUTH_SECRET) {
      return c.json({ ok: false, error: "Invalid authorization" }, 403);
    }

    const credentials = getRelayOAuthCredentials(provider, env);
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
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[relay] Token refresh failed for ${provider}: ${message}`);
      return c.json({ ok: false, error: "Token refresh failed" }, 502);
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Relay-side exchange handler
// ---------------------------------------------------------------------------

interface RelayExchangeContext {
  provider: string;
  userId: string;
  code: string;
  stateToken: string | null;
  credentials: { clientId: string; clientSecret: string };
  exchangeProvider: { name: string; tokenUrl: string; tokenExchangeAuth: "body" | "basic"; extraTokenParams?: Record<string, string> };
  connections: ConnectionManager;
  pendingPKCE: Map<string, PendingPKCE>;
}

async function handleRelayExchange(
  c: { html: (html: string, status: ContentfulStatusCode) => Response | Promise<Response> },
  ctx: RelayExchangeContext,
): Promise<Response | Promise<Response>> {
  const { provider, userId, code, stateToken, credentials, exchangeProvider, connections, pendingPKCE } = ctx;

  // Look up PKCE verifier if stored during /start
  let codeVerifier: string | undefined;
  if (stateToken) {
    prunePKCE(pendingPKCE);
    const pkce = pendingPKCE.get(stateToken);
    if (pkce) {
      codeVerifier = pkce.codeVerifier;
      pendingPKCE.delete(stateToken);
    }
  }

  // Build redirect URI — must match what was used in /start
  const redirectUri = `https://bot.jeriko.ai/oauth/${provider}/callback`;

  try {
    const tokens = await exchangeCodeForTokens({
      provider: exchangeProvider,
      code,
      redirectUri,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      codeVerifier,
    });

    // Send tokens to daemon via WebSocket
    const tokenMessage: RelayOAuthTokensMessage = {
      type: "oauth_tokens",
      requestId: crypto.randomUUID(),
      provider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
    };

    const sent = connections.sendTo(userId, tokenMessage);
    if (!sent) {
      // Tokens exchanged but daemon disconnected — user must reconnect
      return c.html(
        errorHtml("Token exchange succeeded but your daemon disconnected. Restart and try again."),
        503 as ContentfulStatusCode,
      );
    }

    // Return success HTML to browser
    const label = provider.charAt(0).toUpperCase() + provider.slice(1);
    return c.html(successHtml(label), 200 as ContentfulStatusCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[relay] OAuth exchange failed for ${provider}: ${message}`);
    return c.html(
      errorHtml("Token exchange failed. Please try again."),
      502 as ContentfulStatusCode,
    );
  }
}

// ---------------------------------------------------------------------------
// Daemon-side exchange handler (fallback)
// ---------------------------------------------------------------------------

interface DaemonExchangeContext {
  provider: string;
  userId: string;
  connections: ConnectionManager;
  pendingCallbacks: Map<string, PendingOAuth>;
}

async function handleDaemonExchange(
  c: { req: { url: string }; html: (html: string, status: ContentfulStatusCode) => Response | Promise<Response> },
  ctx: DaemonExchangeContext,
): Promise<Response | Promise<Response>> {
  const { provider, userId, connections, pendingCallbacks } = ctx;

  // Guard against flooding
  if (pendingCallbacks.size >= RELAY_MAX_PENDING_OAUTH) {
    return c.html(
      errorHtml(ERROR_MESSAGES.too_many_requests),
      429 as ContentfulStatusCode,
    );
  }

  // Collect all query parameters
  const params: Record<string, string> = {};
  for (const [key, value] of new URL(c.req.url).searchParams) {
    params[key] = value;
  }

  const requestId = crypto.randomUUID();

  const message: RelayOAuthCallbackMessage = {
    type: "oauth_callback",
    requestId,
    provider,
    params,
  };

  // Create a promise that resolves when daemon responds or times out
  const resultPromise = new Promise<RelayOAuthResultMessage>((resolve) => {
    const timer = setTimeout(() => {
      pendingCallbacks.delete(requestId);
      resolve({
        type: "oauth_result",
        requestId,
        statusCode: 504,
        html: errorHtml("Daemon did not respond in time. Check if it's running."),
      });
    }, OAUTH_CALLBACK_TIMEOUT_MS);

    pendingCallbacks.set(requestId, { resolve, timer });
  });

  const sent = connections.sendTo(userId, message);
  if (!sent) {
    const pending = pendingCallbacks.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingCallbacks.delete(requestId);
    }
    return c.html(
      errorHtml(ERROR_MESSAGES.connection_lost),
      503 as ContentfulStatusCode,
    );
  }

  const result = await resultPromise;
  return c.html(result.html, result.statusCode as ContentfulStatusCode);
}
