// Session routes — list, get, resume, archive agent sessions.

import { Hono } from "hono";
import { getDatabase } from "../../storage/db.js";
import { getLogger } from "../../../shared/logger.js";
import type { Session, Message } from "../../storage/schema.js";

const log = getLogger();

export function sessionRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /session — List all sessions.
   *
   * Query: ?archived=true to include archived sessions
   *        ?limit=50 to limit results
   *        ?offset=0 for pagination
   */
  router.get("/", (c) => {
    const db = getDatabase();
    const includeArchived = c.req.query("archived") === "true";
    const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
    const offset = Number(c.req.query("offset")) || 0;

    let sql = "SELECT * FROM session";
    const params: (string | number | boolean | null)[] = [];

    if (!includeArchived) {
      sql += " WHERE archived_at IS NULL";
    }

    sql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const sessions = db.prepare<Session, (string | number | boolean | null)[]>(sql).all(...params);

    return c.json({ ok: true, data: sessions });
  });

  /**
   * GET /session/:id — Get a single session with its messages.
   */
  router.get("/:id", (c) => {
    const db = getDatabase();
    const id = c.req.param("id");

    const session = db.prepare<Session, [string]>(
      "SELECT * FROM session WHERE id = ?",
    ).get(id);

    if (!session) {
      return c.json({ ok: false, error: "Session not found" }, 404);
    }

    const messages = db.prepare<Message, [string]>(
      "SELECT * FROM message WHERE session_id = ? ORDER BY created_at ASC",
    ).all(id);

    return c.json({
      ok: true,
      data: { session, messages },
    });
  });

  /**
   * POST /session/:id/resume — Resume a session (unarchive and mark as active).
   */
  router.post("/:id/resume", (c) => {
    const db = getDatabase();
    const id = c.req.param("id");

    const session = db.prepare<Session, [string]>(
      "SELECT * FROM session WHERE id = ?",
    ).get(id);

    if (!session) {
      return c.json({ ok: false, error: "Session not found" }, 404);
    }

    db.prepare(
      "UPDATE session SET archived_at = NULL, updated_at = ? WHERE id = ?",
    ).run(Date.now(), id);

    log.info(`Session resumed: ${id}`);

    return c.json({
      ok: true,
      data: { session_id: id, status: "resumed" },
    });
  });

  /**
   * DELETE /session/:id — Archive a session (soft delete).
   */
  router.delete("/:id", (c) => {
    const db = getDatabase();
    const id = c.req.param("id");

    const session = db.prepare<Session, [string]>(
      "SELECT * FROM session WHERE id = ?",
    ).get(id);

    if (!session) {
      return c.json({ ok: false, error: "Session not found" }, 404);
    }

    db.prepare(
      "UPDATE session SET archived_at = ?, updated_at = ? WHERE id = ?",
    ).run(Date.now(), Date.now(), id);

    log.info(`Session archived: ${id}`);

    return c.json({
      ok: true,
      data: { session_id: id, status: "archived" },
    });
  });

  return router;
}
