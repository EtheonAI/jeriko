// Share routes — create, view, and revoke shared session links.
//
// Authenticated endpoints (require auth):
//   POST   /share          — Create a shared link for a session
//   GET    /share          — List all shares
//   GET    /share/:id      — Get share metadata (JSON)
//   DELETE /share/:id      — Revoke a shared link
//
// Public endpoints (mounted separately at /s/:id in app.ts):
//   GET    /s/:id          — Public HTML page for viewing shared conversations

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";
import {
  createShare,
  getShare,
  getShareRaw,
  revokeShare,
  listShares,
  listSharesBySession,
  type ShareMessage,
} from "../../storage/share.js";
import { getSession } from "../../agent/session/session.js";
import { getMessages } from "../../agent/session/message.js";
import { buildShareLink } from "../../../shared/urls.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Authenticated share management routes
// ---------------------------------------------------------------------------

export function shareRoutes(): Hono {
  const router = new Hono();

  /**
   * POST /share — Create a shared link for a session.
   *
   * Body: { session_id: string, expires_in_ms?: number | null }
   */
  router.post("/", async (c) => {
    const body = await c.req.json<{
      session_id?: string;
      expires_in_ms?: number | null;
    }>();

    const sessionId = body.session_id;
    if (!sessionId) {
      return c.json({ ok: false, error: "session_id is required" }, 400);
    }

    const session = getSession(sessionId);
    if (!session) {
      return c.json({ ok: false, error: "Session not found" }, 404);
    }

    // Snapshot current messages
    const messages = getMessages(sessionId);
    const snapshot: ShareMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    }));

    if (snapshot.length === 0) {
      return c.json({ ok: false, error: "Session has no messages to share" }, 400);
    }

    const share = createShare({
      sessionId,
      title: session.title,
      model: session.model,
      messages: JSON.stringify(snapshot),
      expiresInMs: body.expires_in_ms,
    });

    const shareUrl = buildShareLink(share.share_id);

    log.info(`Share created: ${share.share_id} for session ${sessionId}`);

    return c.json({
      ok: true,
      data: {
        share_id: share.share_id,
        url: shareUrl,
        title: share.title,
        model: share.model,
        message_count: snapshot.length,
        created_at: share.created_at,
        expires_at: share.expires_at,
      },
    });
  });

  /**
   * GET /share — List all shared sessions.
   *
   * Query: ?session_id=<id> to filter by source session
   *        ?limit=50
   */
  router.get("/", (c) => {
    const sessionId = c.req.query("session_id");
    const limit = Math.min(Number(c.req.query("limit")) || 50, 200);

    const shares = sessionId
      ? listSharesBySession(sessionId)
      : listShares(limit);

    const data = shares.map((s) => ({
      share_id: s.share_id,
      url: buildShareLink(s.share_id),
      session_id: s.session_id,
      title: s.title,
      model: s.model,
      message_count: JSON.parse(s.messages).length,
      created_at: s.created_at,
      expires_at: s.expires_at,
      revoked_at: s.revoked_at,
    }));

    return c.json({ ok: true, data });
  });

  /**
   * GET /share/:id — Get share metadata (JSON).
   */
  router.get("/:id", (c) => {
    const shareId = c.req.param("id");
    const share = getShareRaw(shareId);

    if (!share) {
      return c.json({ ok: false, error: "Share not found" }, 404);
    }

    return c.json({
      ok: true,
      data: {
        share_id: share.share_id,
        url: buildShareLink(share.share_id),
        session_id: share.session_id,
        title: share.title,
        model: share.model,
        message_count: JSON.parse(share.messages).length,
        created_at: share.created_at,
        expires_at: share.expires_at,
        revoked_at: share.revoked_at,
      },
    });
  });

  /**
   * DELETE /share/:id — Revoke a shared link.
   */
  router.delete("/:id", (c) => {
    const shareId = c.req.param("id");
    const revoked = revokeShare(shareId);

    if (!revoked) {
      return c.json({ ok: false, error: "Share not found or already revoked" }, 404);
    }

    log.info(`Share revoked: ${shareId}`);

    return c.json({
      ok: true,
      data: { share_id: shareId, status: "revoked" },
    });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Public share page routes (unauthenticated)
// ---------------------------------------------------------------------------

export function publicShareRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /s/:id — Render a public HTML page for the shared conversation.
   */
  router.get("/:id", (c) => {
    const result = renderShareById(c.req.param("id"));
    c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    return c.html(result.html, result.statusCode as 200);
  });

  return router;
}

/**
 * Render a share page by ID. Returns { statusCode, html }.
 *
 * Used by both:
 *   - The daemon's own /s/:id route (direct HTTP)
 *   - The relay client's share_request handler (forwarded via WebSocket)
 */
export function renderShareById(shareId: string): { statusCode: number; html: string } {
  const share = getShare(shareId);
  if (!share) {
    return { statusCode: 404, html: renderNotFoundPage() };
  }

  const messages: ShareMessage[] = JSON.parse(share.messages);
  return {
    statusCode: 200,
    html: renderSharePage(share.title, share.model, share.created_at, messages),
  };
}

// ---------------------------------------------------------------------------
// HTML rendering — self-contained pages with inline styles
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderSharePage(
  title: string,
  model: string,
  createdAt: number,
  messages: ShareMessage[],
): string {
  const messagesHtml = messages
    .map((m) => {
      const roleClass = m.role === "user" ? "msg-user" : "msg-assistant";
      const roleLabel = m.role === "user" ? "You" : "Jeriko";
      const content = escapeHtml(m.content).replace(/\n/g, "<br>");
      return `<div class="msg ${roleClass}"><div class="msg-role">${roleLabel}</div><div class="msg-content">${content}</div></div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Jeriko</title>
<meta name="description" content="Shared conversation from Jeriko AI agent">
<meta property="og:title" content="${escapeHtml(title)} — Jeriko">
<meta property="og:description" content="Shared conversation with ${escapeHtml(model)}">
<meta property="og:type" content="article">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;line-height:1.6}
.container{max-width:760px;margin:0 auto;padding:24px 16px}
.header{border-bottom:1px solid #222;padding-bottom:16px;margin-bottom:24px}
.header h1{font-size:1.25rem;font-weight:600;color:#fff;margin-bottom:4px}
.header .meta{font-size:0.8rem;color:#666}
.header .meta span{margin-right:12px}
.msg{margin-bottom:20px;padding:12px 16px;border-radius:8px}
.msg-user{background:#111;border:1px solid #222}
.msg-assistant{background:#0d1117;border:1px solid #1a2332}
.msg-role{font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;color:#888}
.msg-user .msg-role{color:#a78bfa}
.msg-assistant .msg-role{color:#4ade80}
.msg-content{font-size:0.9rem;white-space:pre-wrap;word-break:break-word}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #222;text-align:center;font-size:0.75rem;color:#444}
.footer a{color:#666;text-decoration:none}
.footer a:hover{color:#888}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>${escapeHtml(title)}</h1>
<div class="meta">
<span>${escapeHtml(model)}</span>
<span>${formatTimestamp(createdAt)}</span>
<span>${messages.length} messages</span>
</div>
</div>
${messagesHtml}
<div class="footer">
Shared via <a href="https://jeriko.ai">Jeriko</a>
</div>
</div>
</body>
</html>`;
}

function renderNotFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not Found — Jeriko</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh}
.container{text-align:center;padding:24px}
h1{font-size:1.5rem;margin-bottom:8px;color:#fff}
p{color:#666;margin-bottom:16px}
a{color:#a78bfa;text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="container">
<h1>Share not found</h1>
<p>This conversation may have been revoked or expired.</p>
<a href="https://jeriko.ai">jeriko.ai</a>
</div>
</body>
</html>`;
}
