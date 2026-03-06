// Shared — Relay wire protocol types.
//
// Used by both the relay server (apps/relay/) and the daemon relay client
// (src/daemon/services/relay/client.ts). Single source of truth for all
// messages exchanged over the WebSocket connection between daemons and relay.

// ---------------------------------------------------------------------------
// Relay ↔ Daemon: Outbound (daemon → relay)
// ---------------------------------------------------------------------------

/** Authenticate with the relay server. First message after connection. */
export interface RelayAuthMessage {
  type: "auth";
  userId: string;
  /** Auth token — proves ownership of this userId. */
  token: string;
  /** Daemon version for diagnostics. */
  version?: string;
}

/** Register webhook trigger IDs so relay can route incoming webhooks. */
export interface RelayRegisterTriggersMessage {
  type: "register_triggers";
  triggerIds: string[];
}

/** Unregister trigger IDs (trigger deleted or disabled). */
export interface RelayUnregisterTriggersMessage {
  type: "unregister_triggers";
  triggerIds: string[];
}

/** Acknowledge receipt of a forwarded webhook. */
export interface RelayWebhookAckMessage {
  type: "webhook_ack";
  requestId: string;
  status: number;
}

/** Return OAuth result to relay (relay forwards to browser). */
export interface RelayOAuthResultMessage {
  type: "oauth_result";
  requestId: string;
  statusCode: number;
  html: string;
  /** Redirect URL — when present, relay issues a 302 instead of rendering html. */
  redirectUrl?: string;
}

/** Return share page result to relay (relay forwards to browser). */
export interface RelayShareResponseMessage {
  type: "share_response";
  requestId: string;
  statusCode: number;
  html: string;
}

/** Client heartbeat. */
export interface RelayPingMessage {
  type: "ping";
}

export type RelayOutboundMessage =
  | RelayAuthMessage
  | RelayRegisterTriggersMessage
  | RelayUnregisterTriggersMessage
  | RelayWebhookAckMessage
  | RelayOAuthResultMessage
  | RelayShareResponseMessage
  | RelayPingMessage;

// ---------------------------------------------------------------------------
// Relay ↔ Daemon: Inbound (relay → daemon)
// ---------------------------------------------------------------------------

/** Authentication succeeded. */
export interface RelayAuthOkMessage {
  type: "auth_ok";
}

/** Authentication failed. */
export interface RelayAuthFailMessage {
  type: "auth_fail";
  error: string;
}

/** Forwarded webhook from an external service. */
export interface RelayWebhookMessage {
  type: "webhook";
  requestId: string;
  triggerId: string;
  headers: Record<string, string>;
  body: string;
}

/** Forwarded OAuth callback from a provider (code exchange). */
export interface RelayOAuthCallbackMessage {
  type: "oauth_callback";
  requestId: string;
  provider: string;
  params: Record<string, string>;
}

/** Forwarded OAuth start request — daemon builds auth URL and returns redirect. */
export interface RelayOAuthStartMessage {
  type: "oauth_start";
  requestId: string;
  provider: string;
  params: Record<string, string>;
}

/** Forwarded share page request from a visitor. */
export interface RelayShareRequestMessage {
  type: "share_request";
  requestId: string;
  shareId: string;
}

/** Server heartbeat response. */
export interface RelayPongMessage {
  type: "pong";
}

/** Server-initiated error. */
export interface RelayErrorMessage {
  type: "error";
  message: string;
}

export type RelayInboundMessage =
  | RelayAuthOkMessage
  | RelayAuthFailMessage
  | RelayWebhookMessage
  | RelayOAuthCallbackMessage
  | RelayOAuthStartMessage
  | RelayShareRequestMessage
  | RelayPongMessage
  | RelayErrorMessage;

// ---------------------------------------------------------------------------
// Connection state (used by relay server)
// ---------------------------------------------------------------------------

export interface RelayConnection {
  userId: string;
  /** ISO 8601 timestamp. */
  connectedAt: string;
  /** ISO 8601 timestamp. */
  lastPing: string;
  authenticated: boolean;
  /** Trigger IDs registered by this daemon. */
  triggerIds: Set<string>;
  version?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default relay server URL. */
export const DEFAULT_RELAY_URL = "wss://bot.jeriko.ai/relay";

/** Env var to override the relay URL (for self-hosted or development). */
export const RELAY_URL_ENV = "JERIKO_RELAY_URL";

/** Heartbeat interval in milliseconds. */
export const RELAY_HEARTBEAT_INTERVAL_MS = 30_000;

/** Max time without a pong before considering the connection dead. */
export const RELAY_HEARTBEAT_TIMEOUT_MS = 10_000;

/** Maximum reconnection backoff in milliseconds. */
export const RELAY_MAX_BACKOFF_MS = 60_000;

/** Initial reconnection delay in milliseconds. */
export const RELAY_INITIAL_BACKOFF_MS = 1_000;

/** Backoff multiplier for exponential reconnection. */
export const RELAY_BACKOFF_MULTIPLIER = 2;

/** Auth timeout — close connection if auth_ok/auth_fail not received within this window. */
export const RELAY_AUTH_TIMEOUT_MS = 15_000;

/** Maximum pending OAuth callbacks per user before rejecting new ones. */
export const RELAY_MAX_PENDING_OAUTH = 10;

/** Maximum trigger IDs a single daemon can register (resource exhaustion guard). */
export const RELAY_MAX_TRIGGERS_PER_CONNECTION = 10_000;

// ---------------------------------------------------------------------------
// Composite OAuth state — encodes userId into the state parameter
// ---------------------------------------------------------------------------

/**
 * Build a composite state string: `userId.randomToken`.
 * The `.` delimiter is unambiguous (UUIDs use `-`, hex tokens use `[0-9a-f]`).
 */
export function buildCompositeState(userId: string, token: string): string {
  return `${userId}.${token}`;
}

/**
 * Parse a composite state string back into userId and token.
 * Returns null if the state doesn't contain the `.` delimiter (e.g. self-hosted mode).
 */
export function parseCompositeState(state: string): { userId: string; token: string } | null {
  const dotIndex = state.indexOf(".");
  if (dotIndex === -1) return null;
  const userId = state.slice(0, dotIndex);
  const token = state.slice(dotIndex + 1);
  if (!userId || !token) return null;
  return { userId, token };
}
