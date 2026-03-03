// Relay Worker — WebSocket connection manager.
//
// Maintains the mapping from userId → WebSocket connection inside the
// Durable Object. Adapted from the Bun relay's module-level functions
// (apps/relay/src/connections.ts) into a class for DO instance scoping.
//
// Key differences from the Bun relay:
//   - Class instance (no module-level state) — each DO owns its manager
//   - authenticate() is async (Web Crypto API)
//   - restore() method to reconstruct state from hibernated WebSocket attachments
//   - syncAttachment() keeps WebSocket attachments in sync for hibernation survival
//   - env bindings instead of process.env

import type {
  RelayConnection,
  RelayInboundMessage,
} from "../../../src/shared/relay-protocol.js";
import { RELAY_MAX_TRIGGERS_PER_CONNECTION } from "../../../src/shared/relay-protocol.js";
import { safeCompare } from "./crypto.js";
import type { Env, WebSocketAttachment } from "./lib/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManagedConnection extends RelayConnection {
  ws: WebSocket;
}

// ---------------------------------------------------------------------------
// ConnectionManager
// ---------------------------------------------------------------------------

/** Maximum failed auth attempts before closing the connection. */
const MAX_AUTH_FAILURES = 3;

export class ConnectionManager {
  private readonly connections = new Map<string, ManagedConnection>();
  private readonly authFailures = new Map<WebSocket, number>();
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  // -------------------------------------------------------------------------
  // Hibernation restoration
  // -------------------------------------------------------------------------

  /**
   * Restore a connection from a hibernated WebSocket attachment.
   *
   * Called during DO constructor when the object wakes from hibernation.
   * Reconstructs the in-memory connection map from surviving WebSocket
   * attachments (set via `ws.serializeAttachment()` before hibernation).
   */
  restore(ws: WebSocket, attachment: WebSocketAttachment): void {
    if (!attachment.userId) return;

    const conn: ManagedConnection = {
      ws,
      userId: attachment.userId,
      connectedAt: attachment.connectedAt ?? new Date().toISOString(),
      lastPing: attachment.lastPing ?? new Date().toISOString(),
      authenticated: true,
      triggerIds: new Set(attachment.triggerIds ?? []),
      version: attachment.version,
    };

    this.connections.set(attachment.userId, conn);
  }

  /**
   * Sync a connection's current state to its WebSocket attachment.
   *
   * Must be called after any mutation (auth, trigger register/unregister,
   * ping update) so the state survives DO hibernation.
   */
  private syncAttachment(conn: ManagedConnection): void {
    const attachment: WebSocketAttachment = {
      userId: conn.userId,
      authenticated: conn.authenticated,
      connectedAt: conn.connectedAt,
      lastPing: conn.lastPing,
      version: conn.version,
      triggerIds: [...conn.triggerIds],
    };

    try {
      conn.ws.serializeAttachment(attachment);
    } catch {
      // WebSocket may already be closed — silently ignore
    }
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Register a new unauthenticated connection.
   * Sets initial attachment and auth failure counter.
   */
  addPending(ws: WebSocket): void {
    this.authFailures.set(ws, 0);
    try {
      ws.serializeAttachment({ authenticated: false } satisfies WebSocketAttachment);
    } catch {
      // WebSocket may already be closed
    }
  }

  /**
   * Authenticate and register a daemon connection.
   *
   * Async because Web Crypto's HMAC comparison is promise-based.
   *
   * @returns true if accepted, false if auth fails
   */
  async authenticate(
    ws: WebSocket,
    userId: string,
    token: string,
    version?: string,
  ): Promise<boolean> {
    const expectedSecret = this.env.RELAY_AUTH_SECRET;
    if (!expectedSecret) {
      console.error("[connections] RELAY_AUTH_SECRET not configured");
      return false;
    }

    const valid = await safeCompare(token, expectedSecret);
    if (!valid) {
      const failures = (this.authFailures.get(ws) ?? 0) + 1;
      this.authFailures.set(ws, failures);

      if (failures >= MAX_AUTH_FAILURES) {
        ws.close(1008, "Too many failed auth attempts");
        this.authFailures.delete(ws);
      }
      return false;
    }

    // Evict previous connection for this userId (single connection per user)
    const existing = this.connections.get(userId);
    if (existing) {
      try {
        existing.ws.close(1000, "Superseded by new connection");
      } catch { /* already closed */ }
      this.connections.delete(userId);
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

    this.connections.set(userId, conn);
    this.authFailures.delete(ws);
    this.syncAttachment(conn);

    return true;
  }

  // -------------------------------------------------------------------------
  // Trigger routing
  // -------------------------------------------------------------------------

  /**
   * Register trigger IDs for a user so webhooks can be routed.
   * Enforces a per-connection limit to prevent resource exhaustion.
   */
  registerTriggers(userId: string, triggerIds: string[]): void {
    const conn = this.connections.get(userId);
    if (!conn) return;

    for (const id of triggerIds) {
      if (conn.triggerIds.size >= RELAY_MAX_TRIGGERS_PER_CONNECTION) {
        console.warn(
          `[connections] Trigger limit reached for ${userId.slice(0, 8)}... (${RELAY_MAX_TRIGGERS_PER_CONNECTION})`,
        );
        break;
      }
      conn.triggerIds.add(id);
    }

    this.syncAttachment(conn);
  }

  /**
   * Unregister trigger IDs for a user.
   */
  unregisterTriggers(userId: string, triggerIds: string[]): void {
    const conn = this.connections.get(userId);
    if (!conn) return;
    for (const id of triggerIds) {
      conn.triggerIds.delete(id);
    }
    this.syncAttachment(conn);
  }

  // -------------------------------------------------------------------------
  // Lookup
  // -------------------------------------------------------------------------

  /**
   * Get the connection for a specific user.
   */
  getConnection(userId: string): ManagedConnection | undefined {
    return this.connections.get(userId);
  }

  /**
   * Find the connection that owns a specific trigger ID.
   * Used as a fallback when the webhook URL doesn't include userId.
   */
  findByTriggerId(triggerId: string): ManagedConnection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.triggerIds.has(triggerId)) return conn;
    }
    return undefined;
  }

  /**
   * Send a message to a user's daemon.
   * Returns false if the user is not connected or send fails.
   */
  sendTo(userId: string, message: RelayInboundMessage): boolean {
    const conn = this.connections.get(userId);
    if (!conn || conn.ws.readyState !== 1) return false;

    try {
      conn.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Remove a connection by WebSocket reference.
   *
   * Only deletes the connection if the stored WebSocket matches the one
   * being removed. This prevents a race condition where a reconnecting
   * daemon's new connection is evicted by the old connection's late-firing
   * close event.
   */
  removeByWs(ws: WebSocket): string | undefined {
    this.authFailures.delete(ws);

    // Find the userId from the attachment (no ws.data in CF Workers)
    let userId: string | undefined;
    try {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
      userId = attachment?.userId;
    } catch {
      // Attachment may not be available if WS was never authenticated
    }

    if (userId) {
      const conn = this.connections.get(userId);
      if (conn && conn.ws === ws) {
        this.connections.delete(userId);
      }
    }

    return userId;
  }

  /**
   * Update the last ping timestamp for a user.
   */
  updatePing(userId: string): void {
    const conn = this.connections.get(userId);
    if (conn) {
      conn.lastPing = new Date().toISOString();
      this.syncAttachment(conn);
    }
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  /**
   * Get connection statistics for health endpoints.
   */
  getStats(): {
    totalConnections: number;
    users: Array<{
      userId: string;
      connectedAt: string;
      triggerCount: number;
      version?: string;
    }>;
  } {
    const users = [...this.connections.values()].map((c) => ({
      userId: c.userId,
      connectedAt: c.connectedAt,
      triggerCount: c.triggerIds.size,
      version: c.version,
    }));

    return { totalConnections: this.connections.size, users };
  }
}
