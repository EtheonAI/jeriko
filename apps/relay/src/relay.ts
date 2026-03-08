// Relay core — Hono app, WebSocket handlers, and server factory.
//
// This module contains all relay logic without module-level side effects,
// making it importable for testing. The server.ts entry point calls
// createRelayServer() to start the actual process.
//
// Architecture:
//   - Daemons connect outbound via WebSocket to wss://bot.jeriko.ai/relay
//   - External services (Stripe, GitHub, etc.) POST to /hooks/:userId/:triggerId
//   - OAuth providers redirect to /oauth/:userId/:provider/callback
//   - Billing webhooks go to /billing/webhook (centralized)
//
// The relay never sees user secrets. Webhook signature verification and OAuth
// token exchange happen on the user's daemon. The relay is a transparent forwarder.

import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  addPending,
  authenticate,
  registerTriggers,
  unregisterTriggers,
  removeByWs,
  updatePing,
  sendTo,
} from "./connections.js";
import { webhookRoutes } from "./routes/webhook.js";
import { oauthRoutes } from "./routes/oauth.js";
import { resolveOAuthCallback } from "./routes/oauth.js";
import { providerAuthRoutes } from "./routes/provider-auth.js";
import { shareRoutes } from "./routes/share.js";
import { resolveShareRequest } from "./routes/share.js";
import { billingRoutes } from "./routes/billing.js";
import { healthRoutes } from "./routes/health.js";
import type { RelayOutboundMessage } from "../../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// Hono app factory
// ---------------------------------------------------------------------------

/**
 * Create the Hono app with all relay routes mounted.
 * Exported separately so tests can call app.fetch() without starting a server.
 */
export function createRelayApp(): Hono {
  const app = new Hono();

  // Global middleware
  app.use("*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
    maxAge: 86400,
  }));

  // Mount routes
  app.route("/health", healthRoutes());
  app.route("/hooks", webhookRoutes());
  app.route("/oauth", oauthRoutes());
  app.route("/provider", providerAuthRoutes());
  app.route("/s", shareRoutes());
  app.route("/billing", billingRoutes());

  // 404 fallback
  app.notFound((c) => c.json({ ok: false, error: "Not found" }, 404));

  // Global error handler
  app.onError((err, c) => {
    console.error(`[relay] Unhandled error: ${err.message}`);
    return c.json({ ok: false, error: "Internal server error" }, 500);
  });

  return app;
}

// ---------------------------------------------------------------------------
// WebSocket handlers (daemon connections)
// ---------------------------------------------------------------------------

type BunWS = import("bun").ServerWebSocket<{ userId?: string }>;

function handleWsOpen(ws: BunWS): void {
  addPending(ws);
}

function handleWsMessage(ws: BunWS, data: string | Buffer): void {
  let parsed: RelayOutboundMessage;
  try {
    const raw = typeof data === "string" ? data : Buffer.from(data).toString("utf-8");
    parsed = JSON.parse(raw) as RelayOutboundMessage;
  } catch {
    try { ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" })); } catch {}
    return;
  }

  const userId = ws.data?.userId;

  switch (parsed.type) {
    case "auth": {
      const accepted = authenticate(ws, parsed.userId, parsed.token, parsed.version);
      if (accepted) {
        sendTo(parsed.userId, { type: "auth_ok" });
      } else {
        try {
          ws.send(JSON.stringify({ type: "auth_fail", error: "Invalid credentials" }));
        } catch {}
      }
      break;
    }

    case "register_triggers": {
      if (!userId) return;
      registerTriggers(userId, parsed.triggerIds);
      break;
    }

    case "unregister_triggers": {
      if (!userId) return;
      unregisterTriggers(userId, parsed.triggerIds);
      break;
    }

    case "webhook_ack": {
      // Webhook acknowledgments — already returned 200 to external service.
      break;
    }

    case "oauth_result": {
      resolveOAuthCallback(parsed);
      break;
    }

    case "share_response": {
      resolveShareRequest(parsed);
      break;
    }

    case "ping": {
      if (userId) updatePing(userId);
      try { ws.send(JSON.stringify({ type: "pong" })); } catch {}
      break;
    }
  }
}

function handleWsClose(ws: BunWS, _code: number, _reason: string): void {
  removeByWs(ws);
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface RelayServerOptions {
  port?: number;
  hostname?: string;
  maxRequestBodySize?: number;
}

export interface RelayServer {
  /** The Hono HTTP app (for route testing via app.fetch()). */
  app: Hono;
  /** The Bun server instance. */
  server: ReturnType<typeof Bun.serve>;
  /** The actual port the server is listening on (useful when port=0). */
  port: number;
  /** Base URL for HTTP requests. */
  url: string;
  /** WebSocket URL for daemon connections. */
  wsUrl: string;
  /** Gracefully stop the server. */
  stop(): void;
}

/**
 * Create and start a relay server.
 *
 * @param opts  Server options. Defaults to RELAY_PORT/RELAY_HOSTNAME env vars.
 * @returns Server handle with URLs and stop function.
 */
export function createRelayServer(opts: RelayServerOptions = {}): RelayServer {
  const port = opts.port ?? (Number(process.env.RELAY_PORT) || 8080);
  const hostname = opts.hostname ?? process.env.RELAY_HOSTNAME ?? "0.0.0.0";
  const maxRequestBodySize = opts.maxRequestBodySize ?? 10 * 1024 * 1024;

  const app = createRelayApp();

  const server = Bun.serve({
    fetch(req, bunServer) {
      const url = new URL(req.url);

      // WebSocket upgrade for daemon connections
      if (url.pathname === "/relay") {
        const upgraded = bunServer.upgrade(req, { data: {} });
        if (upgraded) return new Response(null, { status: 101 });
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // All other requests go through Hono
      return app.fetch(req, bunServer);
    },
    port,
    hostname,
    maxRequestBodySize,
    websocket: {
      open: handleWsOpen,
      message: handleWsMessage,
      close: handleWsClose,
      idleTimeout: 120,
    },
  });

  const actualPort = server.port;
  const url = `http://${hostname === "0.0.0.0" ? "127.0.0.1" : hostname}:${actualPort}`;
  const wsUrl = `ws://${hostname === "0.0.0.0" ? "127.0.0.1" : hostname}:${actualPort}/relay`;

  return {
    app,
    server,
    port: actualPort,
    url,
    wsUrl,
    stop() {
      server.stop();
    },
  };
}
