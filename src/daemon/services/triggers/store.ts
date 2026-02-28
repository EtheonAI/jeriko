// Trigger persistence — SQLite-backed store for trigger configurations.

import { getDatabase } from "../../storage/db.js";
import type { TriggerConfig } from "./engine.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

const SQL_CREATE = `
CREATE TABLE IF NOT EXISTS trigger_config (
  id         TEXT    PRIMARY KEY,
  type       TEXT    NOT NULL CHECK (type IN ('cron', 'webhook', 'file', 'http')),
  enabled    INTEGER NOT NULL DEFAULT 1,
  config     TEXT    NOT NULL DEFAULT '{}',
  action     TEXT    NOT NULL DEFAULT '{}',
  label      TEXT,
  last_fired TEXT,
  created_at TEXT    NOT NULL
);
`;

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

interface TriggerRow {
  id: string;
  type: string;
  enabled: number;
  config: string;
  action: string;
  label: string | null;
  last_fired: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class TriggerStore {
  private initialized = false;

  /**
   * Ensure the table exists. Called lazily on first access.
   */
  private ensureTable(): void {
    if (this.initialized) return;

    try {
      const db = getDatabase();
      db.exec(SQL_CREATE);
      this.initialized = true;
    } catch (err) {
      log.error(`TriggerStore: failed to create table: ${err}`);
      throw err;
    }
  }

  /**
   * Save (upsert) a trigger configuration.
   */
  save(trigger: TriggerConfig): void {
    this.ensureTable();
    const db = getDatabase();

    db.prepare(`
      INSERT INTO trigger_config (id, type, enabled, config, action, label, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type    = excluded.type,
        enabled = excluded.enabled,
        config  = excluded.config,
        action  = excluded.action,
        label   = excluded.label
    `).run(
      trigger.id,
      trigger.type,
      trigger.enabled ? 1 : 0,
      JSON.stringify(trigger.config),
      JSON.stringify(trigger.action),
      trigger.label ?? null,
      trigger.created_at ?? new Date().toISOString(),
    );
  }

  /**
   * Remove a trigger by ID.
   */
  remove(id: string): boolean {
    this.ensureTable();
    const db = getDatabase();
    const result = db.prepare("DELETE FROM trigger_config WHERE id = ?").run(id);
    return result.changes > 0;
  }

  /**
   * Get a single trigger by ID.
   */
  get(id: string): TriggerConfig | null {
    this.ensureTable();
    const db = getDatabase();
    const row = db.prepare<TriggerRow, [string]>(
      "SELECT * FROM trigger_config WHERE id = ?",
    ).get(id);

    return row ? this.rowToConfig(row) : null;
  }

  /**
   * List all triggers.
   */
  listAll(): TriggerConfig[] {
    this.ensureTable();
    const db = getDatabase();
    const rows = db.prepare<TriggerRow, []>(
      "SELECT * FROM trigger_config ORDER BY created_at",
    ).all();

    return rows.map((row) => this.rowToConfig(row));
  }

  /**
   * List triggers by type.
   */
  listByType(type: TriggerConfig["type"]): TriggerConfig[] {
    this.ensureTable();
    const db = getDatabase();
    const rows = db.prepare<TriggerRow, [string]>(
      "SELECT * FROM trigger_config WHERE type = ? ORDER BY created_at",
    ).all(type);

    return rows.map((row) => this.rowToConfig(row));
  }

  /**
   * Record that a trigger has fired (update last_fired timestamp).
   */
  recordFire(id: string): void {
    this.ensureTable();
    const db = getDatabase();
    db.prepare("UPDATE trigger_config SET last_fired = ? WHERE id = ?").run(
      new Date().toISOString(),
      id,
    );
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private rowToConfig(row: TriggerRow): TriggerConfig {
    return {
      id: row.id,
      type: row.type as TriggerConfig["type"],
      enabled: row.enabled === 1,
      config: JSON.parse(row.config),
      action: JSON.parse(row.action),
      label: row.label ?? undefined,
      created_at: row.created_at,
    };
  }
}
