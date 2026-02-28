// Daemon — Session lifecycle management.
// All operations are backed by SQLite via the storage layer.

import { getDatabase } from "../../storage/db.js";
import type { Session as SessionRow } from "../../storage/schema.js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types (re-export the schema type for consumers)
// ---------------------------------------------------------------------------

export type { SessionRow as Session };

export interface SessionCreateOpts {
  title?: string;
  model?: string;
  /** Parent session ID for sub-agent sessions. */
  parentSessionId?: string;
  /** Agent type preset (default: "general"). */
  agentType?: string;
}

// ---------------------------------------------------------------------------
// Slug generation — human-readable short identifier
// ---------------------------------------------------------------------------

const ADJECTIVES = [
  "bold", "calm", "dark", "fast", "keen", "neat", "safe", "warm",
  "blue", "deep", "gold", "iron", "just", "open", "pure", "wise",
];

const NOUNS = [
  "agent", "brain", "cloud", "delta", "flame", "grove", "haven", "nexus",
  "orbit", "prism", "quest", "spark", "surge", "tower", "unity", "vault",
];

function generateSlug(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `${adj}-${noun}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new conversation session.
 *
 * @param opts.title  Human-readable title (default: auto-generated slug)
 * @param opts.model  Model identifier (default: "claude")
 * @returns           The newly created session row.
 */
export function createSession(opts: SessionCreateOpts = {}): SessionRow {
  const db = getDatabase();
  const now = Date.now();
  const id = randomUUID();
  const slug = generateSlug();
  const title = opts.title ?? slug;
  const model = opts.model ?? "claude";
  const parentSessionId = opts.parentSessionId ?? null;
  const agentType = opts.agentType ?? "general";

  db.prepare(
    `INSERT INTO session (id, slug, title, model, created_at, updated_at, token_count, parent_session_id, agent_type)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, slug, title, model, now, now, parentSessionId, agentType);

  return {
    id,
    slug,
    title,
    model,
    created_at: now,
    updated_at: now,
    archived_at: null,
    token_count: 0,
    parent_session_id: parentSessionId,
    agent_type: agentType,
  };
}

/**
 * Retrieve a session by ID.
 * Returns null if the session does not exist.
 */
export function getSession(id: string): SessionRow | null {
  const db = getDatabase();
  return db
    .query<SessionRow, [string]>("SELECT * FROM session WHERE id = ?")
    .get(id) ?? null;
}

/**
 * Retrieve a session by slug.
 */
export function getSessionBySlug(slug: string): SessionRow | null {
  const db = getDatabase();
  return db
    .query<SessionRow, [string]>("SELECT * FROM session WHERE slug = ?")
    .get(slug) ?? null;
}

/**
 * List sessions, most recent first.
 *
 * @param limit  Max sessions to return (default: 50)
 * @param includeArchived  Whether to include archived sessions (default: false)
 */
export function listSessions(
  limit: number = 50,
  includeArchived: boolean = false,
): SessionRow[] {
  const db = getDatabase();
  const where = includeArchived ? "" : "WHERE archived_at IS NULL";
  return db
    .query<SessionRow, [number]>(
      `SELECT * FROM session ${where} ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit);
}

/**
 * Archive a session (soft-delete). The session is hidden from default
 * listings but can still be accessed by ID.
 */
export function archiveSession(id: string): void {
  const db = getDatabase();
  db.prepare("UPDATE session SET archived_at = ? WHERE id = ?").run(Date.now(), id);
}

/**
 * Permanently delete a session and all its messages + parts.
 * Foreign keys with ON DELETE CASCADE handle child rows.
 */
export function deleteSession(id: string): void {
  const db = getDatabase();
  db.prepare("DELETE FROM session WHERE id = ?").run(id);
}

/**
 * Update a session's metadata. Only provided fields are changed.
 */
export function updateSession(
  id: string,
  updates: Partial<Pick<SessionRow, "title" | "model" | "token_count">>,
): void {
  const db = getDatabase();
  const now = Date.now();

  if (updates.title !== undefined) {
    db.prepare("UPDATE session SET title = ?, updated_at = ? WHERE id = ?")
      .run(updates.title, now, id);
  }
  if (updates.model !== undefined) {
    db.prepare("UPDATE session SET model = ?, updated_at = ? WHERE id = ?")
      .run(updates.model, now, id);
  }
  if (updates.token_count !== undefined) {
    db.prepare("UPDATE session SET token_count = ?, updated_at = ? WHERE id = ?")
      .run(updates.token_count, now, id);
  }
}

/**
 * Touch the session's updated_at timestamp.
 */
export function touchSession(id: string): void {
  const db = getDatabase();
  db.prepare("UPDATE session SET updated_at = ? WHERE id = ?").run(Date.now(), id);
}
