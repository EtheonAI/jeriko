// Relay (Bun) — Provider auth callback proxy.
//
// Mirrors apps/relay-worker/src/routes/provider-auth.ts for local dev/testing.
// Receives OAuth callbacks for AI provider authentication (e.g. OpenRouter PKCE)
// and forwards the code to the daemon via WebSocket.
//
// Route:
//   GET /provider/:provider/callback?code=...&state=userId.token

import { Hono } from "hono";
import { getConnection, sendTo } from "../connections.js";
import { parseCompositeState } from "../../../../src/shared/relay-protocol.js";

const ERROR_HTML = (msg: string) =>
  `<!DOCTYPE html><html><body><h2>Error</h2><p>${msg}</p></body></html>`;
const SUCCESS_HTML = (label: string) =>
  `<!DOCTYPE html><html><body><h2>${label} connected</h2><p>You can close this tab.</p></body></html>`;

export function providerAuthRoutes(): Hono {
  const router = new Hono();

  router.get("/:provider/callback", (c) => {
    const provider = c.req.param("provider");
    const url = new URL(c.req.url);

    const state = url.searchParams.get("state");
    if (!state) return c.html(ERROR_HTML("Missing state parameter."), 400);

    const parsed = parseCompositeState(state);
    const userId = parsed?.userId;
    if (!userId) return c.html(ERROR_HTML("Invalid state parameter."), 400);

    const error = url.searchParams.get("error");
    if (error) {
      const desc = url.searchParams.get("error_description") ?? error;
      return c.html(ERROR_HTML(desc), 400);
    }

    const code = url.searchParams.get("code");
    if (!code) return c.html(ERROR_HTML("Missing authorization code."), 400);

    const conn = getConnection(userId);
    if (!conn) {
      return c.html(ERROR_HTML("Daemon not connected. Start it with `jeriko server start`."), 503);
    }

    const params: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      params[key] = value;
    }

    const sent = sendTo(userId, {
      type: "provider_auth_callback",
      provider,
      params,
    });

    if (!sent) {
      return c.html(ERROR_HTML("Failed to reach daemon (connection lost)."), 503);
    }

    const label = provider.charAt(0).toUpperCase() + provider.slice(1);
    return c.html(SUCCESS_HTML(label), 200);
  });

  return router;
}
