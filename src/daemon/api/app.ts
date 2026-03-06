// Daemon HTTP server — Hono app with all routes, middleware, and lifecycle.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { getLogger } from "../../shared/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { agentRoutes } from "./routes/agent.js";
import { sessionRoutes } from "./routes/session.js";
import { webhookRoutes } from "./routes/webhook.js";
import { channelRoutes } from "./routes/channel.js";
import { healthRoutes } from "./routes/health.js";
import { connectorRoutes } from "./routes/connector.js";
import { triggerRoutes } from "./routes/trigger.js";
import { oauthRoutes } from "./routes/oauth.js";
import { shareRoutes, publicShareRoutes } from "./routes/share.js";
import { billingRoutes, publicBillingRoutes } from "./routes/billing.js";
import { createWebSocketHandlers } from "./websocket.js";
import type { ChannelRegistry } from "../services/channels/index.js";
import type { TriggerEngine } from "../services/triggers/engine.js";
import type { ConnectorManager } from "../services/connectors/manager.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// App context — injected into routes via Hono variables
// ---------------------------------------------------------------------------

export interface AppContext {
  channels: ChannelRegistry;
  triggers: TriggerEngine;
  connectors: ConnectorManager;
}

// ---------------------------------------------------------------------------
// Create the Hono app with all middleware and routes
// ---------------------------------------------------------------------------

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();

  // -----------------------------------------------------------------------
  // Global middleware
  // -----------------------------------------------------------------------

  // CORS — allow local dev and Tauri desktop app
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return null;
        if (origin === "tauri://localhost") return origin;
        try {
          const url = new URL(origin);
          if (url.hostname === "localhost" && url.protocol === "http:") return origin;
        } catch { return null; }
        return null;
      },
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    }),
  );

  // Security headers — prevent clickjacking, MIME sniffing, referrer leaks
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Frame-Options", "DENY");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
  });

  // Body size limit — prevent memory exhaustion from oversized payloads
  app.use("*", bodyLimit({ maxSize: 10 * 1024 * 1024 })); // 10MB

  // Rate limiting — applied before auth so brute-force is throttled
  app.use("*", rateLimitMiddleware({ maxRequests: 100, windowMs: 60_000 }));

  // Auth — skip for health check and webhook endpoints
  app.use("*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    // Health, webhook, OAuth, public share, and billing webhook endpoints are unauthenticated
    if (path === "/health" || path.startsWith("/hooks/") || path.startsWith("/oauth/") || path.startsWith("/s/") || path === "/billing/webhook") {
      return next();
    }
    return authMiddleware()(c, next);
  });

  // -----------------------------------------------------------------------
  // Inject context so routes can access channels, triggers, etc.
  // -----------------------------------------------------------------------
  app.use("*", async (c, next) => {
    c.set("channels" as never, ctx.channels as never);
    c.set("triggers" as never, ctx.triggers as never);
    c.set("connectors" as never, ctx.connectors as never);
    return next();
  });

  // -----------------------------------------------------------------------
  // Mount route groups
  // -----------------------------------------------------------------------

  app.route("/health", healthRoutes());
  app.route("/agent", agentRoutes());
  app.route("/session", sessionRoutes());
  app.route("/hooks", webhookRoutes());
  app.route("/channel", channelRoutes());
  app.route("/connector", connectorRoutes());
  app.route("/triggers", triggerRoutes());
  app.route("/tasks", triggerRoutes()); // Unified task surface (alias for /triggers)
  app.route("/oauth", oauthRoutes());
  app.route("/share", shareRoutes());
  app.route("/s", publicShareRoutes());
  app.route("/billing", billingRoutes());
  app.route("/billing", publicBillingRoutes());

  // -----------------------------------------------------------------------
  // 404 fallback
  // -----------------------------------------------------------------------
  app.notFound((c) => {
    return c.json({ ok: false, error: "Not found" }, 404);
  });

  // -----------------------------------------------------------------------
  // Global error handler
  // -----------------------------------------------------------------------
  app.onError((err, c) => {
    log.error(`Unhandled error: ${err.message}`, { stack: err.stack });
    return c.json({ ok: false, error: "Internal server error" }, 500);
  });

  return app;
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let server: ReturnType<typeof Bun.serve> | null = null;

export interface ServerOptions {
  port?: number;
  hostname?: string;
}

/**
 * Start the HTTP server using Bun's native serve. Returns the server instance.
 *
 * WebSocket is wired in: clients connecting to /ws are upgraded and handled
 * by the remote-agent WebSocket handlers from websocket.ts.
 */
export function startServer(
  app: Hono,
  opts: ServerOptions = {},
): ReturnType<typeof Bun.serve> {
  const port = opts.port ?? Number(process.env.JERIKO_PORT) ?? 3000;
  const hostname = opts.hostname ?? "127.0.0.1";

  if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1") {
    log.warn(`Daemon binding to ${hostname} — this exposes the API beyond localhost. Ensure firewall rules are in place.`);
  }

  const wsHandlers = createWebSocketHandlers();

  server = Bun.serve({
    fetch(req, bunServer) {
      const url = new URL(req.url);
      // Upgrade WebSocket requests on /ws — validate auth before upgrade
      if (url.pathname === "/ws") {
        const secret = process.env.NODE_AUTH_SECRET;
        if (!secret) {
          return new Response("Server authentication is not configured", { status: 503 });
        }
        const upgraded = bunServer.upgrade(req, { data: {} });
        if (upgraded) return undefined as unknown as Response;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      // All other requests go through Hono
      return app.fetch(req, bunServer);
    },
    port,
    hostname,
    websocket: wsHandlers,
  });

  log.info(`Jeriko daemon listening on ${hostname}:${port} (WebSocket on /ws)`);
  return server;
}

/**
 * Stop the HTTP server gracefully.
 */
export function stopServer(): void {
  if (server) {
    server.stop();
    server = null;
    log.info("Jeriko daemon stopped");
  }
}
