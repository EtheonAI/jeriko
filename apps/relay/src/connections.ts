// Relay — WebSocket connection manager.
//
// Maintains the mapping from userId → WebSocket connection.
// Thread-safe for single-process Bun runtime (no locks needed).

import { createHmac } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import type {
  RelayConnection,
  RelayInboundMessage,
} from "../../../src/shared/relay-protocol.js";
import { RELAY_MAX_TRIGGERS_PER_CONNECTION } from "../../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BunWS = import("bun").ServerWebSocket<{ userId?: string }>;

export interface ManagedConnection extends RelayConnection {
  ws: BunWS;
}

// ---------------------------------------------------------------------------
// Connection manager
// ---------------------------------------------------------------------------

const connections = new Map<string, ManagedConnection>();

/** Maximum failed auth attempts before closing the connection. */
const MAX_AUTH_FAILURES = 3;
const authFailures = new Map<BunWS, number>();

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register a new unauthenticated connection.
 * Returns the connection handle (not yet associated with a userId).
 */
export function addPending(ws: BunWS): void {
  authFailures.set(ws, 0);
}

/**
 * Authenticate and register a daemon connection.
 *
 * @param ws       The WebSocket connection
 * @param userId   Daemon's unique user ID
 * @param token    NODE_AUTH_SECRET for verification
 * @param version  Optional daemon version
 * @returns true if accepted, false if auth fails
 */
export function authenticate(
  ws: BunWS,
  userId: string,
  token: string,
  version?: string,
): boolean {
  // Validate the token against the relay's shared secret.
  // The relay server uses RELAY_AUTH_SECRET to verify daemon identity.
  const expectedSecret = process.env.RELAY_AUTH_SECRET;
  if (!expectedSecret) {
    console.error("[connections] RELAY_AUTH_SECRET not configured");
    return false;
  }

  if (!safeCompare(token, expectedSecret)) {
    const failures = (authFailures.get(ws) ?? 0) + 1;
    authFailures.set(ws, failures);

    if (failures >= MAX_AUTH_FAILURES) {
      ws.close(1008, "Too many failed auth attempts");
      authFailures.delete(ws);
    }
    return false;
  }

  // Evict previous connection for this userId (if any — single connection per user)
  const existing = connections.get(userId);
  if (existing) {
    try {
      existing.ws.close(1000, "Superseded by new connection");
    } catch { /* already closed */ }
    connections.delete(userId);
  }

  const conn: ManagedConnection = {
    ws,
    userId,
    connectedAt: new Date().toISOString(),
    lastPing: new Date().toISOString(),
    authenticated: true,
    triggerIds: new Set(),
    version,
  };

  connections.set(userId, conn);
  ws.data = { userId };
  authFailures.delete(ws);

  return true;
}

// ---------------------------------------------------------------------------
// Trigger routing
// ---------------------------------------------------------------------------

/**
 * Register trigger IDs for a user so webhooks can be routed.
 * Enforces a per-connection limit to prevent resource exhaustion.
 */
export function registerTriggers(userId: string, triggerIds: string[]): void {
  const conn = connections.get(userId);
  if (!conn) return;

  for (const id of triggerIds) {
    if (conn.triggerIds.size >= RELAY_MAX_TRIGGERS_PER_CONNECTION) {
      console.warn(`[connections] Trigger limit reached for ${userId.slice(0, 8)}... (${RELAY_MAX_TRIGGERS_PER_CONNECTION})`);
      break;
    }
    conn.triggerIds.add(id);
  }
}

/**
 * Unregister trigger IDs for a user.
 */
export function unregisterTriggers(userId: string, triggerIds: string[]): void {
  const conn = connections.get(userId);
  if (!conn) return;
  for (const id of triggerIds) {
    conn.triggerIds.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Get the connection for a specific user.
 */
export function getConnection(userId: string): ManagedConnection | undefined {
  return connections.get(userId);
}

/**
 * Find the connection that owns a specific trigger ID.
 * Used as a fallback when the webhook URL doesn't include userId.
 */
export function findByTriggerId(triggerId: string): ManagedConnection | undefined {
  for (const conn of connections.values()) {
    if (conn.triggerIds.has(triggerId)) return conn;
  }
  return undefined;
}

/**
 * Send a message to a user's daemon.
 * Returns false if the user is not connected.
 */
export function sendTo(userId: string, message: RelayInboundMessage): boolean {
  const conn = connections.get(userId);
  if (!conn || conn.ws.readyState !== 1) return false;

  try {
    conn.ws.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Remove a connection by WebSocket reference.
 *
 * Only deletes the connection if the stored WebSocket matches the one being
 * removed. This prevents a race condition where a reconnecting daemon's new
 * connection is evicted by the old connection's late-firing close event.
 */
export function removeByWs(ws: BunWS): string | undefined {
  const userId = ws.data?.userId;
  authFailures.delete(ws);
  if (userId) {
    const conn = connections.get(userId);
    if (conn && conn.ws === ws) {
      connections.delete(userId);
    }
  }
  return userId;
}

/**
 * Update the last ping timestamp for a user.
 */
export function updatePing(userId: string): void {
  const conn = connections.get(userId);
  if (conn) {
    conn.lastPing = new Date().toISOString();
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Get connection statistics.
 */
export function getStats(): {
  totalConnections: number;
  users: Array<{ userId: string; connectedAt: string; triggerCount: number; version?: string }>;
} {
  const users = [...connections.values()].map((c) => ({
    userId: c.userId,
    connectedAt: c.connectedAt,
    triggerCount: c.triggerIds.size,
    version: c.version,
  }));

  return { totalConnections: connections.size, users };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Timing-safe string comparison to prevent timing attacks on auth tokens.
 *
 * HMAC both inputs with a fixed key before comparing. This ensures:
 *   1. The comparison buffers are always the same length (32 bytes)
 *   2. No length information is leaked via early return
 *   3. The comparison is constant-time via timingSafeEqual
 */
function safeCompare(a: string, b: string): boolean {
  const hmacKey = "relay-auth-compare";
  const hashA = createHmac("sha256", hmacKey).update(a).digest();
  const hashB = createHmac("sha256", hmacKey).update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
