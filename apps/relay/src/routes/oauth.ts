// Relay — OAuth proxy (start + callback).
//
// Forwards OAuth requests from browsers to the correct user's daemon.
// The daemon handles all OAuth logic locally (secrets never leave the machine).
//
// Two proxied routes:
//   GET /oauth/:userId/:provider/start?state=...     → daemon builds auth URL → 302 redirect
//   GET /oauth/:userId/:provider/callback?code=...   → daemon exchanges code → HTML response
//
// Flow (start):
//   1. User clicks OAuth link → relay forwards to daemon via WebSocket
//   2. Daemon builds authorization URL (has client_id + scopes locally)
//   3. Relay redirects browser to provider's consent page
//
// Flow (callback):
//   1. Provider redirects browser to relay with auth code
//   2. Relay forwards code + params to daemon via WebSocket
//   3. Daemon exchanges code for token, returns HTML response
//   4. Relay sends HTML back to the user's browser

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { getConnection, sendTo } from "../connections.js";
import type {
  RelayOAuthCallbackMessage,
  RelayOAuthStartMessage,
  RelayOAuthResultMessage,
} from "../../../../src/shared/relay-protocol.js";
import { RELAY_MAX_PENDING_OAUTH } from "../../../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// Pending OAuth requests — waiting for daemon response
// ---------------------------------------------------------------------------

interface PendingOAuth {
  resolve: (result: RelayOAuthResultMessage) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingCallbacks = new Map<string, PendingOAuth>();

/** OAuth request timeout — how long to wait for daemon response. */
const OAUTH_TIMEOUT_MS = 30_000;

/**
 * Resolve a pending OAuth result from a daemon's `oauth_result` message.
 * Called by the WebSocket message handler when it receives an oauth_result.
 */
export function resolveOAuthCallback(result: RelayOAuthResultMessage): void {
  const pending = pendingCallbacks.get(result.requestId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingCallbacks.delete(result.requestId);
    pending.resolve(result);
  }
}

// ---------------------------------------------------------------------------
// Shared: send to daemon and wait for response
// ---------------------------------------------------------------------------

/**
 * Forward an OAuth request to the daemon and wait for a response.
 * Shared by both /start and /callback routes — same send/wait/timeout pattern.
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

  /**
   * GET /oauth/:userId/:provider/start?state=... — Forward to daemon.
   *
   * The daemon has the OAuth client_id and builds the authorization URL
   * locally. We forward the request via WebSocket and redirect the browser
   * to the provider's consent page.
   */
  router.get("/:userId/:provider/start", async (c) => {
    const userId = c.req.param("userId");
    const provider = c.req.param("provider");

    // Collect all query parameters
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
      const messages: Record<string, string> = {
        daemon_offline: "Your Jeriko daemon is not connected. Start it with `jeriko server start`.",
        too_many_requests: "Too many pending OAuth requests. Please try again.",
        connection_lost: "Failed to reach your daemon (connection lost).",
      };
      return c.html(errorHtml(messages[result.error]!), result.statusCode);
    }

    // Daemon returned a redirect URL — issue a 302 to the provider
    if (result.redirectUrl) {
      return c.redirect(result.redirectUrl, 302);
    }

    return c.html(result.html, result.statusCode);
  });

  /**
   * GET /oauth/:userId/:provider/callback?code=...&state=... — Forward to daemon.
   *
   * This is where providers redirect after user consent.
   * Forwards the callback to the daemon and waits for HTML response.
   */
  router.get("/:userId/:provider/callback", async (c) => {
    const userId = c.req.param("userId");
    const provider = c.req.param("provider");

    // Collect all query parameters
    const params: Record<string, string> = {};
    for (const [key, value] of new URL(c.req.url).searchParams) {
      params[key] = value;
    }

    const message: RelayOAuthCallbackMessage = {
      type: "oauth_callback",
      requestId: randomUUID(),
      provider,
      params,
    };

    const result = await forwardToDaemon(userId, message);

    if ("error" in result) {
      const messages: Record<string, string> = {
        daemon_offline: "Your Jeriko daemon is not connected. Start it with `jeriko server start`.",
        too_many_requests: "Too many pending OAuth requests. Please try again.",
        connection_lost: "Failed to reach your daemon (connection lost).",
      };
      return c.html(errorHtml(messages[result.error]!), result.statusCode);
    }

    return c.html(result.html, result.statusCode);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
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
