// Storage — Key-value store backed by SQLite.

import { getDatabase } from "./db.js";
import { getLogger } from "../../shared/logger.js";

const log = getLogger();

/** Parse JSON safely — returns null and logs on corrupt data. */
function safeParseKV(key: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    log.warn(`Corrupt JSON in KV store for key "${key}": ${json.slice(0, 80)}`);
    return null;
  }
}

/**
 * Set a key-value pair. The value is JSON-serialized before storage.
 * If the key already exists, it is updated (upsert).
 */
export function kvSet(key: string, value: unknown): void {
  const db = getDatabase();
  const json = JSON.stringify(value);
  const now = Date.now();
  db.prepare(
    `INSERT INTO key_value (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, json, now);
}

/**
 * Get a value by key. Returns the JSON-parsed value, or null if the key
 * does not exist.
 */
export function kvGet<T = unknown>(key: string): T | null {
  const db = getDatabase();
  const row = db
    .query<{ value: string }, [string]>("SELECT value FROM key_value WHERE key = ?")
    .get(key);
  if (row === null) return null;
  return safeParseKV(key, row.value) as T;
}

/**
 * Delete a key-value pair. No-op if the key does not exist.
 */
export function kvDelete(key: string): void {
  const db = getDatabase();
  db.prepare("DELETE FROM key_value WHERE key = ?").run(key);
}

/**
 * List key-value pairs, optionally filtered by a key prefix.
 *
 * @param prefix  If provided, only keys starting with this string are returned.
 * @returns       Array of `{ key, value }` objects with parsed JSON values.
 *
 * @example
 *   kvSet("session:abc", { model: "claude" });
 *   kvSet("session:def", { model: "gpt-4" });
 *   kvList("session:");
 *   // [{ key: "session:abc", value: { model: "claude" } }, ...]
 */
export function kvList(prefix?: string): Array<{ key: string; value: unknown }> {
  const db = getDatabase();

  let rows: Array<{ key: string; value: string }>;

  if (prefix !== undefined && prefix !== "") {
    rows = db
      .query<{ key: string; value: string }, [string]>(
        "SELECT key, value FROM key_value WHERE key LIKE ? || '%' ORDER BY key",
      )
      .all(prefix);
  } else {
    rows = db
      .query<{ key: string; value: string }, []>(
        "SELECT key, value FROM key_value ORDER BY key",
      )
      .all();
  }

  return rows.map((row) => ({
    key: row.key,
    value: safeParseKV(row.key, row.value),
  }));
}
