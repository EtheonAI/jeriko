// Daemon — WebSocket handler for remote agent connections.
// Remote agents connect via WS and receive streaming agent events.

import { randomUUID } from "node:crypto";
import { getLogger } from "../../shared/logger.js";
import { Bus } from "../../shared/bus.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Bun ServerWebSocket type alias. */
type BunWS = import("bun").ServerWebSocket<unknown>;

/** A connected remote agent. */
export interface RemoteAgent {
  id: string;
  ws: BunWS;
  name: string;
  connectedAt: string;
  lastPing: string;
  authenticated: boolean;
}

/** Inbound message from a remote agent. */
export type AgentInboundMessage =
  | { type: "auth"; token: string; name?: string }
  | { type: "chat"; sessionId?: string; message: string }
  | { type: "ping" }
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean };

/** Outbound message to a remote agent. */
export type AgentOutboundMessage =
  | { type: "auth_ok"; agentId: string }
  | { type: "auth_fail"; error: string }
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | { type: "turn_complete"; tokensIn: number; tokensOut: number }
  | { type: "error"; message: string }
  | { type: "pong" };

/** Events emitted by the WebSocket handler. */
export interface WebSocketEvents extends Record<string, unknown> {
  "ws:connected": { agentId: string; name: string };
  "ws:disconnected": { agentId: string };
  "ws:message": { agentId: string; message: AgentInboundMessage };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const agents = new Map<string, RemoteAgent>();
const bus = new Bus<WebSocketEvents>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get the WebSocket event bus. */
export function getWebSocketBus(): Bus<WebSocketEvents> {
  return bus;
}

/** Get all connected remote agents. */
export function getConnectedAgents(): RemoteAgent[] {
  return [...agents.values()];
}

/** Get a specific agent by ID. */
export function getAgent(id: string): RemoteAgent | undefined {
  return agents.get(id);
}

/** Send a message to a specific agent. */
export function sendToAgent(agentId: string, message: AgentOutboundMessage): boolean {
  const agent = agents.get(agentId);
  if (!agent || agent.ws.readyState !== 1) {
    return false;
  }

  try {
    agent.ws.send(JSON.stringify(message));
    return true;
  } catch (err) {
    log.error(`Failed to send to agent ${agentId}: ${err}`);
    return false;
  }
}

/** Broadcast a message to all authenticated agents. */
export function broadcastToAgents(message: AgentOutboundMessage): number {
  let sent = 0;
  for (const agent of agents.values()) {
    if (agent.authenticated && sendToAgent(agent.id, message)) {
      sent++;
    }
  }
  return sent;
}

/** Disconnect a specific agent. */
export function disconnectAgent(agentId: string): void {
  const agent = agents.get(agentId);
  if (agent) {
    try { agent.ws.close(1000, "Disconnected by server"); } catch { /* ignore */ }
    agents.delete(agentId);
    bus.emit("ws:disconnected", { agentId });
    log.info(`Remote agent disconnected: ${agentId}`);
  }
}

// ---------------------------------------------------------------------------
// WebSocket handlers (Bun-style)
// ---------------------------------------------------------------------------

/**
 * Create WebSocket handler callbacks for Bun.serve().
 *
 * ```ts
 * Bun.serve({
 *   fetch(req, server) {
 *     if (new URL(req.url).pathname === "/ws") {
 *       server.upgrade(req);
 *       return;
 *     }
 *     return app.fetch(req, server);
 *   },
 *   websocket: createWebSocketHandlers(),
 * });
 * ```
 */
export function createWebSocketHandlers(): {
  open: (ws: BunWS) => void;
  message: (ws: BunWS, data: string | Buffer) => void;
  close: (ws: BunWS, code: number, reason: string) => void;
} {
  return {
    open(ws: BunWS) {
      const agentId = randomUUID().slice(0, 12);
      const agent: RemoteAgent = {
        id: agentId,
        ws,
        name: `agent-${agentId}`,
        connectedAt: new Date().toISOString(),
        lastPing: new Date().toISOString(),
        authenticated: false,
      };

      agents.set(agentId, agent);
      (ws as any).__agentId = agentId;
      log.info(`Remote agent connected: ${agentId} (awaiting auth)`);
    },

    message(ws: BunWS, data: string | Buffer) {
      const agentId = (ws as any).__agentId as string;
      const agent = agents.get(agentId);
      if (!agent) return;

      let parsed: AgentInboundMessage;
      try {
        const raw = typeof data === "string" ? data : Buffer.from(data).toString("utf-8");
        parsed = JSON.parse(raw) as AgentInboundMessage;
      } catch {
        sendToAgent(agentId, { type: "error", message: "Invalid JSON" });
        return;
      }

      agent.lastPing = new Date().toISOString();

      switch (parsed.type) {
        case "auth": {
          const secret = process.env.NODE_AUTH_SECRET;
          if (!secret) {
            sendToAgent(agentId, { type: "auth_fail", error: "Server auth not configured" });
            return;
          }
          if (parsed.token !== secret) {
            sendToAgent(agentId, { type: "auth_fail", error: "Invalid token" });
            log.audit("WebSocket auth failed", { agentId });
            return;
          }
          agent.authenticated = true;
          if (parsed.name) agent.name = parsed.name;
          sendToAgent(agentId, { type: "auth_ok", agentId });
          bus.emit("ws:connected", { agentId, name: agent.name });
          log.info(`Remote agent authenticated: ${agentId} (${agent.name})`);
          break;
        }

        case "ping":
          sendToAgent(agentId, { type: "pong" });
          break;

        default:
          if (!agent.authenticated) {
            sendToAgent(agentId, { type: "error", message: "Not authenticated" });
            return;
          }
          bus.emit("ws:message", { agentId, message: parsed });
          break;
      }
    },

    close(ws: BunWS, _code: number, _reason: string) {
      const agentId = (ws as any).__agentId as string;
      if (agentId) {
        agents.delete(agentId);
        bus.emit("ws:disconnected", { agentId });
        log.info(`Remote agent disconnected: ${agentId}`);
      }
    },
  };
}
