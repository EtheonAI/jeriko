// Relay Worker — OAuth proxy (start + callback).
//
// Forwards OAuth requests from browsers to the correct user's daemon.
// The daemon handles all OAuth logic locally (secrets never leave the machine).
//
// Two proxied routes (userId extracted from composite state parameter):
//   GET /oauth/:provider/start?state=userId.token   → daemon builds auth URL → 302 redirect
//   GET /oauth/:provider/callback?code=...&state=... → daemon exchanges code → HTML response
//
// Flow (start):
//   1. User clicks OAuth link → relay extracts userId from state → forwards to daemon via WebSocket
//   2. Daemon builds authorization URL (has client_id + scopes locally)
//   3. Relay redirects browser to provider's consent page
//
// Flow (callback):
//   1. Provider redirects browser to relay with auth code
//   2. Relay extracts userId from state → forwards code + params to daemon via WebSocket
//   3. Daemon exchanges code for token, returns HTML response
//   4. Relay sends HTML back to the user's browser

import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ConnectionManager } from "../connections.js";
import type {
  RelayOAuthCallbackMessage,
  RelayOAuthStartMessage,
  RelayOAuthResultMessage,
} from "../../../../src/shared/relay-protocol.js";
import { RELAY_MAX_PENDING_OAUTH, parseCompositeState } from "../../../../src/shared/relay-protocol.js";
import { errorHtml } from "../lib/html.js";

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
// Callback resolution (called from WebSocket message handler)
// ---------------------------------------------------------------------------

/**
 * Resolve a pending OAuth callback from a daemon's `oauth_result` message.
 *
 * @param pendingCallbacks - The pending callbacks map from the DO instance
 * @param result           - The oauth_result message from the daemon
 */
export function resolveOAuthCallback(
  pendingCallbacks: Map<string, PendingOAuth>,
  result: RelayOAuthResultMessage,
): void {
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
 */
export function createOAuthRoutes(
  connections: ConnectionManager,
  pendingCallbacks: Map<string, PendingOAuth>,
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
   */
  router.get("/:provider/start", async (c) => {
    const provider = c.req.param("provider");
    const userId = extractUserId(c);

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

    // Daemon returned a redirect URL — issue a 302 to the provider
    if (result.redirectUrl) {
      return c.redirect(result.redirectUrl, 302);
    }

    return c.html(result.html, result.statusCode as ContentfulStatusCode);
  });

  /**
   * GET /oauth/:provider/callback?code=...&state=userId.token — Forward to daemon.
   *
   * This is where providers redirect after user consent.
   * userId is extracted from the composite state parameter.
   */
  router.get("/:provider/callback", async (c) => {
    const provider = c.req.param("provider");
    const userId = extractUserId(c);

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

    // Guard against flooding — limit total pending callbacks
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
      // Clean up the pending callback since we couldn't send
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
    return c.html(result.html, result.statusCode as ContentfulStatusCode);
  });

  return router;
}
