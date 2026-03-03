// Relay client — outbound WebSocket connection to the Jeriko relay server.
//
// The relay allows external services (Stripe, GitHub, etc.) to reach the
// daemon when it runs behind NAT/firewall on a user's machine.
//
// Connection lifecycle:
//   1. Boot → connect to wss://bot.jeriko.ai/relay
//   2. Auth → send userId + token
//   3. Register → send trigger IDs for webhook routing
//   4. Receive → relay forwards webhooks and OAuth callbacks
//   5. Reconnect → exponential backoff (1s, 2s, 4s, ... max 60s)
//
// The relay client is entirely non-fatal. Jeriko works fully offline.
// Only external webhook triggers and OAuth callbacks require the relay.

import { getLogger } from "../../../shared/logger.js";
import {
  DEFAULT_RELAY_URL,
  RELAY_URL_ENV,
  RELAY_HEARTBEAT_INTERVAL_MS,
  RELAY_HEARTBEAT_TIMEOUT_MS,
  RELAY_MAX_BACKOFF_MS,
  RELAY_INITIAL_BACKOFF_MS,
  RELAY_BACKOFF_MULTIPLIER,
  RELAY_AUTH_TIMEOUT_MS,
  type RelayOutboundMessage,
  type RelayInboundMessage,
  type RelayWebhookMessage,
  type RelayOAuthCallbackMessage,
  type RelayOAuthStartMessage,
  type RelayShareRequestMessage,
} from "../../../shared/relay-protocol.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Handler called when the relay forwards a webhook to this daemon. */
export type WebhookHandler = (
  triggerId: string,
  headers: Record<string, string>,
  body: string,
  requestId: string,
) => Promise<void>;

/** Handler called when the relay forwards an OAuth callback. */
export type OAuthCallbackHandler = (
  provider: string,
  params: Record<string, string>,
  requestId: string,
) => Promise<{ statusCode: number; html: string }>;

/** Handler called when the relay forwards an OAuth start request. */
export type OAuthStartHandler = (
  provider: string,
  params: Record<string, string>,
  requestId: string,
) => Promise<{ statusCode: number; html: string; redirectUrl?: string }>;

/** Handler called when the relay forwards a share page request. */
export type ShareRequestHandler = (
  shareId: string,
  requestId: string,
) => Promise<{ statusCode: number; html: string }>;

// ---------------------------------------------------------------------------
// Relay client
// ---------------------------------------------------------------------------

export class RelayClient {
  private ws: WebSocket | null = null;
  private userId: string;
  private token: string;
  private relayUrl: string;
  private version: string;

  private connected = false;
  private intentionalClose = false;
  private backoffMs = RELAY_INITIAL_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private authTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  /** Pending trigger IDs to register/unregister on (re)connect. */
  private registeredTriggerIds = new Set<string>();

  /** External handlers wired by the kernel. */
  private webhookHandler: WebhookHandler | null = null;
  private oauthHandler: OAuthCallbackHandler | null = null;
  private oauthStartHandler: OAuthStartHandler | null = null;
  private shareHandler: ShareRequestHandler | null = null;

  constructor(opts: { userId: string; token: string; version?: string }) {
    this.userId = opts.userId;
    this.token = opts.token;
    this.version = opts.version ?? "unknown";
    this.relayUrl = process.env[RELAY_URL_ENV] ?? DEFAULT_RELAY_URL;
  }

  // -----------------------------------------------------------------------
  // Handler registration
  // -----------------------------------------------------------------------

  /**
   * Set the handler for forwarded webhooks.
   * Typically wired to TriggerEngine.handleWebhook().
   */
  onWebhook(handler: WebhookHandler): void {
    this.webhookHandler = handler;
  }

  /**
   * Set the handler for forwarded OAuth callbacks.
   * Typically wired to the OAuth route's token exchange logic.
   */
  onOAuthCallback(handler: OAuthCallbackHandler): void {
    this.oauthHandler = handler;
  }

  /**
   * Set the handler for forwarded OAuth start requests.
   * Typically wired to the OAuth route's authorization URL builder.
   */
  onOAuthStart(handler: OAuthStartHandler): void {
    this.oauthStartHandler = handler;
  }

  /**
   * Set the handler for forwarded share page requests.
   * Typically wired to the share route's render logic.
   */
  onShareRequest(handler: ShareRequestHandler): void {
    this.shareHandler = handler;
  }

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  /**
   * Connect to the relay server. Non-blocking — returns immediately.
   * Reconnection is automatic with exponential backoff.
   */
  connect(): void {
    if (this.ws) return;
    this.intentionalClose = false;
    this.attemptConnect();
  }

  /**
   * Disconnect from the relay server. Stops reconnection.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearTimers();

    if (this.ws) {
      try {
        this.ws.close(1000, "Client shutdown");
      } catch { /* already closed */ }
      this.ws = null;
    }

    this.connected = false;
    log.info("Relay client: disconnected");
  }

  /**
   * Whether the relay client is currently connected and authenticated.
   */
  isConnected(): boolean {
    return this.connected;
  }

  // -----------------------------------------------------------------------
  // Trigger registration
  // -----------------------------------------------------------------------

  /**
   * Register a trigger ID for webhook routing.
   * If connected, sends immediately. Otherwise, queued for next connect.
   */
  registerTrigger(triggerId: string): void {
    this.registeredTriggerIds.add(triggerId);
    if (this.connected) {
      this.send({ type: "register_triggers", triggerIds: [triggerId] });
    }
  }

  /**
   * Unregister a trigger ID.
   */
  unregisterTrigger(triggerId: string): void {
    this.registeredTriggerIds.delete(triggerId);
    if (this.connected) {
      this.send({ type: "unregister_triggers", triggerIds: [triggerId] });
    }
  }

  // -----------------------------------------------------------------------
  // Internal: connection
  // -----------------------------------------------------------------------

  private attemptConnect(): void {
    if (this.intentionalClose) return;

    try {
      log.info(`Relay client: connecting to ${this.relayUrl}`);
      this.ws = new WebSocket(this.relayUrl);

      this.ws.addEventListener("open", () => this.handleOpen());
      this.ws.addEventListener("message", (event) => this.handleMessage(event));
      this.ws.addEventListener("close", (event) => this.handleClose(event));
      this.ws.addEventListener("error", (event) => this.handleError(event));
    } catch (err) {
      log.warn(`Relay client: connection failed — ${err}`);
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    log.info("Relay client: WebSocket connected, sending auth");
    this.send({
      type: "auth",
      userId: this.userId,
      token: this.token,
      version: this.version,
    });

    // Auth timeout — close and reconnect if relay doesn't respond
    this.authTimeoutTimer = setTimeout(() => {
      if (!this.connected) {
        log.warn("Relay client: auth timeout — closing connection");
        this.ws?.close(1000, "Auth timeout");
      }
    }, RELAY_AUTH_TIMEOUT_MS);
  }

  private handleMessage(event: MessageEvent): void {
    let parsed: RelayInboundMessage;
    try {
      parsed = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
    } catch {
      log.warn("Relay client: received unparseable message");
      return;
    }

    switch (parsed.type) {
      case "auth_ok":
        this.clearAuthTimeout();
        this.handleAuthOk();
        break;

      case "auth_fail":
        this.clearAuthTimeout();
        log.error(`Relay client: auth failed — ${parsed.error}`);
        this.intentionalClose = true; // Don't reconnect on auth failure
        this.ws?.close(1000, "Auth failed");
        break;

      case "webhook":
        this.handleWebhook(parsed);
        break;

      case "oauth_callback":
        this.handleOAuthCallback(parsed);
        break;

      case "oauth_start":
        this.handleOAuthStartRequest(parsed);
        break;

      case "share_request":
        this.handleShareRequest(parsed);
        break;

      case "pong":
        this.handlePong();
        break;

      case "error":
        log.warn(`Relay client: server error — ${parsed.message}`);
        break;

      default:
        log.debug(`Relay client: unknown message type — ${(parsed as { type: string }).type}`);
        break;
    }
  }

  private handleClose(_event: CloseEvent): void {
    this.connected = false;
    this.clearTimers();
    this.ws = null;

    if (!this.intentionalClose) {
      log.info(`Relay client: connection closed, reconnecting in ${this.backoffMs}ms`);
      this.scheduleReconnect();
    }
  }

  private handleError(_event: Event): void {
    // Error is always followed by close — reconnect happens in handleClose
    log.warn("Relay client: WebSocket error");
  }

  // -----------------------------------------------------------------------
  // Internal: auth + registration
  // -----------------------------------------------------------------------

  private handleAuthOk(): void {
    this.connected = true;
    this.backoffMs = RELAY_INITIAL_BACKOFF_MS; // Reset backoff on success

    log.info("Relay client: authenticated with relay server");

    // Register all known trigger IDs
    if (this.registeredTriggerIds.size > 0) {
      this.send({
        type: "register_triggers",
        triggerIds: [...this.registeredTriggerIds],
      });
      log.info(`Relay client: registered ${this.registeredTriggerIds.size} trigger(s)`);
    }

    // Start heartbeat
    this.startHeartbeat();
  }

  // -----------------------------------------------------------------------
  // Internal: forwarded event handlers
  // -----------------------------------------------------------------------

  private handleWebhook(message: RelayWebhookMessage): void {
    if (!this.webhookHandler) {
      log.warn(`Relay client: webhook received but no handler registered (trigger: ${message.triggerId})`);
      return;
    }

    this.webhookHandler(message.triggerId, message.headers, message.body, message.requestId)
      .then(() => {
        this.send({ type: "webhook_ack", requestId: message.requestId, status: 200 });
      })
      .catch((err) => {
        log.error(`Relay client: webhook handler error — ${err}`);
        this.send({ type: "webhook_ack", requestId: message.requestId, status: 500 });
      });
  }

  private handleOAuthCallback(message: RelayOAuthCallbackMessage): void {
    if (!this.oauthHandler) {
      log.warn(`Relay client: OAuth callback received but no handler registered (provider: ${message.provider})`);
      this.send({
        type: "oauth_result",
        requestId: message.requestId,
        statusCode: 503,
        html: "OAuth handler not available",
      });
      return;
    }

    this.oauthHandler(message.provider, message.params, message.requestId)
      .then((result) => {
        this.send({
          type: "oauth_result",
          requestId: message.requestId,
          statusCode: result.statusCode,
          html: result.html,
        });
      })
      .catch((err) => {
        log.error(`Relay client: OAuth handler error — ${err}`);
        this.send({
          type: "oauth_result",
          requestId: message.requestId,
          statusCode: 500,
          html: "Internal error processing OAuth callback",
        });
      });
  }

  private handleOAuthStartRequest(message: RelayOAuthStartMessage): void {
    if (!this.oauthStartHandler) {
      log.warn(`Relay client: OAuth start received but no handler registered (provider: ${message.provider})`);
      this.send({
        type: "oauth_result",
        requestId: message.requestId,
        statusCode: 503,
        html: "OAuth start handler not available",
      });
      return;
    }

    this.oauthStartHandler(message.provider, message.params, message.requestId)
      .then((result) => {
        this.send({
          type: "oauth_result",
          requestId: message.requestId,
          statusCode: result.statusCode,
          html: result.html,
          redirectUrl: result.redirectUrl,
        });
      })
      .catch((err) => {
        log.error(`Relay client: OAuth start handler error — ${err}`);
        this.send({
          type: "oauth_result",
          requestId: message.requestId,
          statusCode: 500,
          html: "Internal error processing OAuth start",
        });
      });
  }

  private handleShareRequest(message: RelayShareRequestMessage): void {
    if (!this.shareHandler) {
      log.warn(`Relay client: share request received but no handler registered (shareId: ${message.shareId})`);
      this.send({
        type: "share_response",
        requestId: message.requestId,
        statusCode: 503,
        html: "Share handler not available",
      });
      return;
    }

    this.shareHandler(message.shareId, message.requestId)
      .then((result) => {
        this.send({
          type: "share_response",
          requestId: message.requestId,
          statusCode: result.statusCode,
          html: result.html,
        });
      })
      .catch((err) => {
        log.error(`Relay client: share handler error — ${err}`);
        this.send({
          type: "share_response",
          requestId: message.requestId,
          statusCode: 500,
          html: "Internal error rendering share page",
        });
      });
  }

  // -----------------------------------------------------------------------
  // Internal: heartbeat
  // -----------------------------------------------------------------------

  private startHeartbeat(): void {
    this.clearTimers();

    this.heartbeatTimer = setInterval(() => {
      if (!this.connected) return;

      this.send({ type: "ping" });

      // Clear any existing timeout before setting a new one
      if (this.heartbeatTimeoutTimer) {
        clearTimeout(this.heartbeatTimeoutTimer);
      }

      // Start a timeout — if no pong arrives, assume dead
      this.heartbeatTimeoutTimer = setTimeout(() => {
        log.warn("Relay client: heartbeat timeout — closing connection");
        this.ws?.close(1000, "Heartbeat timeout");
      }, RELAY_HEARTBEAT_TIMEOUT_MS);
    }, RELAY_HEARTBEAT_INTERVAL_MS);
  }

  private handlePong(): void {
    // Clear the heartbeat timeout — connection is alive
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: reconnection
  // -----------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.intentionalClose || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptConnect();
    }, this.backoffMs);

    // Exponential backoff with cap
    this.backoffMs = Math.min(
      this.backoffMs * RELAY_BACKOFF_MULTIPLIER,
      RELAY_MAX_BACKOFF_MS,
    );
  }

  // -----------------------------------------------------------------------
  // Internal: messaging
  // -----------------------------------------------------------------------

  private send(message: RelayOutboundMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      log.warn(`Relay client: send failed — ${err}`);
    }
  }

  // -----------------------------------------------------------------------
  // Internal: cleanup
  // -----------------------------------------------------------------------

  private clearAuthTimeout(): void {
    if (this.authTimeoutTimer) {
      clearTimeout(this.authTimeoutTimer);
      this.authTimeoutTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearAuthTimeout();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
