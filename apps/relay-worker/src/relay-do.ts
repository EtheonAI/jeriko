// Relay Worker — Durable Object.
//
// Single global Durable Object that manages all WebSocket connections,
// HTTP routes via Hono, trigger registration, OAuth callback proxying,
// and billing license cache.
//
// Uses the Hibernatable WebSockets API so connections survive DO hibernation.
// Daemon heartbeats every 30s keep the DO alive in practice, but the
// restoration logic in the constructor handles the cold-wake case.
//
// Architecture:
//   Worker entry (index.ts) → idFromName("global") → this class
//   All HTTP + WebSocket traffic flows through a single DO instance.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { ConnectionManager } from "./connections.js";
import { createWebhookRoutes } from "./routes/webhook.js";
import { createOAuthRoutes, resolveOAuthCallback } from "./routes/oauth.js";
import type { PendingOAuth } from "./routes/oauth.js";
import { createShareRoutes, resolveShareRequest } from "./routes/share.js";
import type { PendingShare } from "./routes/share.js";
import { createBillingRoutes, LicenseStore } from "./routes/billing.js";
import { createHealthRoutes } from "./routes/health.js";
import type { Env, WebSocketAttachment } from "./lib/types.js";
import type { RelayOutboundMessage } from "../../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// RelayDO
// ---------------------------------------------------------------------------

export class RelayDO {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  private readonly connections: ConnectionManager;
  private readonly pendingOAuth: Map<string, PendingOAuth>;
  private readonly pendingShares: Map<string, PendingShare>;
  private readonly licenseStore: LicenseStore;
  private readonly startTime: number;
  private readonly app: Hono;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.startTime = Date.now();

    // Initialize state containers
    this.connections = new ConnectionManager(env);
    this.pendingOAuth = new Map();
    this.pendingShares = new Map();
    this.licenseStore = new LicenseStore(state.storage, new Map());

    // Restore connections from hibernated WebSocket attachments.
    // When the DO wakes from hibernation, the class is re-instantiated
    // with empty Maps, but WebSocket connections survive. We reconstruct
    // the connection map from the surviving attachments.
    for (const ws of this.state.getWebSockets()) {
      try {
        const raw = ws.deserializeAttachment();
        const attachment = raw as WebSocketAttachment | null;
        if (attachment?.userId && attachment.authenticated) {
          this.connections.restore(ws, attachment);
        }
      } catch {
        // Attachment deserialization can fail for pre-auth WebSockets
      }
    }

    // Build the Hono app with all routes
    this.app = this.buildApp();
  }

  // -------------------------------------------------------------------------
  // HTTP entry point
  // -------------------------------------------------------------------------

  /**
   * Handle all incoming requests.
   *
   * WebSocket upgrade requests to `/relay` are handled directly.
   * All other requests are delegated to the Hono HTTP router.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for daemon connections
    if (url.pathname === "/relay" && request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade();
    }

    // All other requests go through Hono
    return this.app.fetch(request);
  }

  // -------------------------------------------------------------------------
  // WebSocket upgrade
  // -------------------------------------------------------------------------

  /**
   * Create a WebSocket pair, accept the server side for hibernation,
   * and return the client side to the Worker entry point.
   */
  private handleWebSocketUpgrade(): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept with hibernation support — survives DO inactivity
    this.state.acceptWebSocket(server);
    this.connections.addPending(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  // -------------------------------------------------------------------------
  // Hibernatable WebSocket handlers
  // -------------------------------------------------------------------------

  /**
   * Handle incoming WebSocket messages from daemons.
   *
   * Dispatches by message type:
   *   auth               → authenticate and register connection
   *   register_triggers   → register webhook trigger IDs
   *   unregister_triggers → unregister trigger IDs
   *   webhook_ack        → no-op (already returned 200 to external service)
   *   oauth_result       → resolve pending OAuth HTTP request
   *   share_response     → resolve pending share page HTTP request
   *   ping               → update lastPing, respond with pong
   */
  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    let parsed: RelayOutboundMessage;
    try {
      const raw = typeof data === "string" ? data : new TextDecoder().decode(data);
      parsed = JSON.parse(raw) as RelayOutboundMessage;
    } catch {
      this.safeSend(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    // Get userId from attachment (equivalent to Bun's ws.data.userId)
    const userId = this.getAttachedUserId(ws);

    switch (parsed.type) {
      case "auth": {
        const accepted = await this.connections.authenticate(
          ws,
          parsed.userId,
          parsed.token,
          parsed.version,
        );
        if (accepted) {
          this.connections.sendTo(parsed.userId, { type: "auth_ok" });
        } else {
          this.safeSend(ws, { type: "auth_fail", error: "Invalid credentials" });
        }
        break;
      }

      case "register_triggers": {
        if (!userId) return;
        this.connections.registerTriggers(userId, parsed.triggerIds);
        break;
      }

      case "unregister_triggers": {
        if (!userId) return;
        this.connections.unregisterTriggers(userId, parsed.triggerIds);
        break;
      }

      case "webhook_ack": {
        // Already returned 200 to external service — no further action.
        break;
      }

      case "oauth_result": {
        resolveOAuthCallback(this.pendingOAuth, parsed);
        break;
      }

      case "share_response": {
        resolveShareRequest(this.pendingShares, parsed);
        break;
      }

      case "ping": {
        if (userId) this.connections.updatePing(userId);
        this.safeSend(ws, { type: "pong" });
        break;
      }
    }
  }

  /**
   * Handle WebSocket close events.
   * Cleans up the connection from the manager.
   */
  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.connections.removeByWs(ws);
  }

  /**
   * Handle WebSocket errors.
   * Cleans up the connection from the manager.
   */
  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.connections.removeByWs(ws);
  }

  // -------------------------------------------------------------------------
  // Hono app builder
  // -------------------------------------------------------------------------

  /**
   * Build the Hono HTTP application with all relay routes.
   *
   * Each route factory receives its dependencies explicitly via closure —
   * no module-level state, no Hono context injection magic.
   */
  private buildApp(): Hono {
    const app = new Hono();

    // Global middleware
    app.use("*", cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
      maxAge: 86400,
    }));

    // Mount routes with their dependencies
    app.route("/health", createHealthRoutes(this.connections, this.env, this.startTime));
    app.route("/hooks", createWebhookRoutes(this.connections));
    app.route("/oauth", createOAuthRoutes(this.connections, this.pendingOAuth));
    app.route("/billing", createBillingRoutes(this.connections, this.env, this.licenseStore));
    app.route("/s", createShareRoutes(this.connections, this.pendingShares));

    // 404 fallback
    app.notFound((c) => c.json({ ok: false, error: "Not found" }, 404));

    // Global error handler
    app.onError((err, c) => {
      console.error(`[relay] Unhandled error: ${err.message}`);
      return c.json({ ok: false, error: "Internal server error" }, 500);
    });

    return app;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Get the userId from a WebSocket's hibernation attachment.
   * Returns undefined if the WebSocket is not yet authenticated.
   */
  private getAttachedUserId(ws: WebSocket): string | undefined {
    try {
      const raw = ws.deserializeAttachment();
      return (raw as WebSocketAttachment | null)?.userId;
    } catch {
      return undefined;
    }
  }

  /**
   * Safely send a JSON message to a WebSocket.
   * Silently ignores errors (WebSocket may already be closed).
   */
  private safeSend(ws: WebSocket, message: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // WebSocket may already be closed
    }
  }
}
