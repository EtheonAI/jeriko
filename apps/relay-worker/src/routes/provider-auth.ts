// Relay Worker — Provider auth callback proxy.
//
// Handles OAuth callbacks for AI provider authentication (e.g. OpenRouter PKCE).
// Separate from connector OAuth (/oauth/) — this is for model provider API keys.
//
// The relay acts as a pure proxy: receives the browser redirect on HTTPS port 443,
// extracts the code, and forwards it to the daemon via WebSocket. The daemon
// stores the code and the CLI retrieves it via IPC.
//
// Route:
//   GET /provider/:provider/callback?code=...&state=userId.token

import { Hono } from "hono";
import type { ConnectionManager } from "../connections.js";
import { parseCompositeState } from "../../../../src/shared/relay-protocol.js";
import { errorHtml, successHtml } from "../lib/html.js";

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create provider auth routes.
 *
 * @param connections - ConnectionManager for WebSocket forwarding to daemons
 */
export function createProviderAuthRoutes(connections: ConnectionManager): Hono {
  const router = new Hono();

  /**
   * GET /provider/:provider/callback?code=...&state=userId.token
   *
   * Pure proxy — forwards the authorization code to the daemon via WebSocket.
   * The daemon stores it and the CLI retrieves it via IPC to exchange locally.
   * No token exchange on the relay (PKCE flows don't need a client secret).
   */
  router.get("/:provider/callback", async (c) => {
    const provider = c.req.param("provider");
    const url = new URL(c.req.url);

    // Extract userId from composite state
    const state = url.searchParams.get("state");
    if (!state) {
      return c.html(errorHtml("Missing state parameter."), 400);
    }

    const parsed = parseCompositeState(state);
    const userId = parsed?.userId;
    if (!userId) {
      return c.html(errorHtml("Invalid state parameter."), 400);
    }

    // Check for OAuth error from provider
    const error = url.searchParams.get("error");
    if (error) {
      const desc = url.searchParams.get("error_description") ?? error;
      return c.html(errorHtml(desc), 400);
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return c.html(errorHtml("Missing authorization code."), 400);
    }

    // Forward to daemon via WebSocket
    const conn = connections.getConnection(userId);
    if (!conn) {
      return c.html(
        errorHtml("Your Jeriko daemon is not connected. Start it with `jeriko server start`."),
        503,
      );
    }

    // Collect all query parameters for forwarding
    const params: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      params[key] = value;
    }

    const sent = connections.sendTo(userId, {
      type: "provider_auth_callback",
      provider,
      params,
    });

    if (!sent) {
      return c.html(
        errorHtml("Failed to reach your daemon (connection lost)."),
        503,
      );
    }

    // Return success immediately — the daemon stores the code,
    // the CLI retrieves it via IPC. No need to wait for daemon response.
    const label = provider.charAt(0).toUpperCase() + provider.slice(1);
    return c.html(successHtml(label), 200);
  });

  return router;
}
