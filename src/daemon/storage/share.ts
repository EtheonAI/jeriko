// Storage — Shared session management backed by SQLite.
// Creates public snapshots of conversations for sharing via jeriko.ai/s/<share_id>.

import { getDatabase } from "./db.js";
import type { SharedSession } from "./schema.js";
import { randomUUID, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Length of the random share ID (URL-safe base64, ~8 chars). */
const SHARE_ID_BYTES = 6;

/** Default share expiry: 30 days in milliseconds. */
const DEFAULT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShareCreateOpts {
  sessionId: string;
  title: string;
  model: string;
  /** JSON-encoded message array snapshot. */
  messages: string;
  /** Expiry duration in ms from now. Null = no expiry. Default: 30 days. */
  expiresInMs?: number | null;
}

export interface ShareMessage {
  role: string;
  content: string;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a URL-safe short ID for share links. */
function generateShareId(): string {
  return randomBytes(SHARE_ID_BYTES).toString("base64url");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a shared session snapshot.
 * Captures the current conversation state as an immutable share.
 */
export function createShare(opts: ShareCreateOpts): SharedSession {
  const db = getDatabase();
  const id = randomUUID();
  const shareId = generateShareId();
  const now = Date.now();
  const expiresAt = opts.expiresInMs === null
    ? null
    : now + (opts.expiresInMs ?? DEFAULT_EXPIRY_MS);

  db.prepare(
    `INSERT INTO shared_session (id, share_id, session_id, title, model, messages, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, shareId, opts.sessionId, opts.title, opts.model, opts.messages, now, expiresAt);

  return {
    id,
    share_id: shareId,
    session_id: opts.sessionId,
    title: opts.title,
    model: opts.model,
    messages: opts.messages,
    created_at: now,
    expires_at: expiresAt,
    revoked_at: null,
  };
}

/**
 * Retrieve a shared session by its short share ID.
 * Returns null if not found, revoked, or expired.
 */
export function getShare(shareId: string): SharedSession | null {
  const db = getDatabase();
  const row = db
    .query<SharedSession, [string]>(
      "SELECT * FROM shared_session WHERE share_id = ?",
    )
    .get(shareId);

  if (!row) return null;
  if (row.revoked_at !== null) return null;
  if (row.expires_at !== null && row.expires_at < Date.now()) return null;

  return row;
}

/**
 * Retrieve a shared session by share ID without filtering revoked/expired.
 * Used for admin operations like revoke lookups.
 */
export function getShareRaw(shareId: string): SharedSession | null {
  const db = getDatabase();
  return db
    .query<SharedSession, [string]>(
      "SELECT * FROM shared_session WHERE share_id = ?",
    )
    .get(shareId) ?? null;
}

/**
 * Revoke a shared session. The share link will no longer be accessible.
 */
export function revokeShare(shareId: string): boolean {
  const db = getDatabase();
  const result = db.prepare(
    "UPDATE shared_session SET revoked_at = ? WHERE share_id = ? AND revoked_at IS NULL",
  ).run(Date.now(), shareId);
  return result.changes > 0;
}

/**
 * List all shared sessions for a given source session.
 * Returns active (non-revoked, non-expired) shares.
 */
export function listSharesBySession(sessionId: string): SharedSession[] {
  const db = getDatabase();
  const now = Date.now();
  return db
    .query<SharedSession, [string, number]>(
      `SELECT * FROM shared_session
       WHERE session_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC`,
    )
    .all(sessionId, now);
}

/**
 * List all shared sessions, most recent first.
 */
export function listShares(limit: number = 50): SharedSession[] {
  const db = getDatabase();
  return db
    .query<SharedSession, [number]>(
      "SELECT * FROM shared_session ORDER BY created_at DESC LIMIT ?",
    )
    .all(limit);
}
