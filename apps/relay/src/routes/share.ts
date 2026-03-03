// Relay — Share page proxy.
//
// Receives share page requests from visitors and forwards them to the correct
// user's daemon. The daemon renders the HTML page locally (share data never
// leaves the user's machine).
//
// URL format: GET /s/:userId/:shareId
//
// Flow:
//   1. Visitor opens share link in browser
//   2. Relay forwards share request to daemon via WebSocket
//   3. Daemon renders HTML page from local SQLite share data
//   4. Relay sends HTML back to the visitor's browser

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { getConnection, sendTo } from "../connections.js";
import type { RelayShareRequestMessage, RelayShareResponseMessage } from "../../../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// Pending share requests — waiting for daemon response
// ---------------------------------------------------------------------------

interface PendingShare {
  resolve: (result: RelayShareResponseMessage) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<string, PendingShare>();

/** Share request timeout — how long to wait for daemon response. */
const SHARE_REQUEST_TIMEOUT_MS = 15_000;

/** Maximum pending share requests to prevent resource exhaustion. */
const MAX_PENDING_SHARES = 50;

/**
 * Register a pending share response from a daemon.
 * Called by the WebSocket message handler when it receives a share_response.
 */
export function resolveShareRequest(result: RelayShareResponseMessage): void {
  const pending = pendingRequests.get(result.requestId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingRequests.delete(result.requestId);
    pending.resolve(result);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function shareRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /s/:userId/:shareId — Forward share page request to daemon.
   *
   * The daemon renders the share page from its local database and returns HTML.
   */
  router.get("/:userId/:shareId", async (c) => {
    const userId = c.req.param("userId");
    const shareId = c.req.param("shareId");

    const conn = getConnection(userId);
    if (!conn) {
      return c.html(offlineHtml(), 503);
    }

    // Guard against flooding
    if (pendingRequests.size >= MAX_PENDING_SHARES) {
      return c.html(errorHtml("Too many pending requests. Please try again."), 429);
    }

    const requestId = randomUUID();

    const message: RelayShareRequestMessage = {
      type: "share_request",
      requestId,
      shareId,
    };

    // Send to daemon and wait for response
    const resultPromise = new Promise<RelayShareResponseMessage>((resolve) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve({
          type: "share_response",
          requestId,
          statusCode: 504,
          html: errorHtml("Daemon did not respond in time. Check if it's running."),
        });
      }, SHARE_REQUEST_TIMEOUT_MS);

      pendingRequests.set(requestId, { resolve, timer });
    });

    const sent = sendTo(userId, message);
    if (!sent) {
      const pending = pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(requestId);
      }
      return c.html(offlineHtml(), 503);
    }

    const result = await resultPromise;
    return c.html(result.html, result.statusCode);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
    return map[ch]!;
  });
}

function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jeriko — Error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
h1{font-size:1.4rem;margin-bottom:.5rem;color:#f87171}p{color:#888;margin-top:.5rem}</style></head>
<body><div class="card"><h1>Error</h1><p>${escapeHtml(message)}</p></div></body></html>`;
}

function offlineHtml(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jeriko — Offline</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
h1{font-size:1.4rem;margin-bottom:.5rem;color:#fbbf24}p{color:#888;margin-top:.5rem}</style></head>
<body><div class="card"><h1>Share Unavailable</h1><p>The owner's Jeriko daemon is not currently running. Shares are served from the owner's machine.</p><p>Ask the owner to start their daemon, or try again later.</p></div></body></html>`;
}
