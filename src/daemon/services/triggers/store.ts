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
  id          TEXT    PRIMARY KEY,
  type        TEXT    NOT NULL CHECK (type IN ('cron', 'webhook', 'file', 'http', 'email')),
  enabled     INTEGER NOT NULL DEFAULT 1,
  config      TEXT    NOT NULL DEFAULT '{}',
  action      TEXT    NOT NULL DEFAULT '{}',
  label       TEXT,
  run_count   INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  max_runs    INTEGER NOT NULL DEFAULT 0,
  last_fired  TEXT,
  created_at  TEXT    NOT NULL
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
  run_count: number;
  error_count: number;
  max_runs: number;
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

      // Add columns that may be missing from older installations.
      // ALTER TABLE ... ADD COLUMN is idempotent if wrapped in try/catch.
      const columnMigrations = [
        "ALTER TABLE trigger_config ADD COLUMN run_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE trigger_config ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE trigger_config ADD COLUMN max_runs INTEGER NOT NULL DEFAULT 0",
      ];
      for (const sql of columnMigrations) {
        try { db.exec(sql); } catch { /* column already exists */ }
      }

      // Migrate CHECK constraint to include 'email' type for existing databases.
      // SQLite doesn't support ALTER CHECK — must recreate the table.
      this.migrateCheckConstraint(db);

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
      INSERT INTO trigger_config (id, type, enabled, config, action, label, run_count, error_count, max_runs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type        = excluded.type,
        enabled     = excluded.enabled,
        config      = excluded.config,
        action      = excluded.action,
        label       = excluded.label,
        run_count   = excluded.run_count,
        error_count = excluded.error_count,
        max_runs    = excluded.max_runs
    `).run(
      trigger.id,
      trigger.type,
      trigger.enabled ? 1 : 0,
      JSON.stringify(trigger.config),
      JSON.stringify(trigger.action),
      trigger.label ?? null,
      trigger.run_count ?? 0,
      trigger.error_count ?? 0,
      trigger.max_runs ?? 0,
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
   * Record that a trigger has fired. Updates last_fired timestamp and run_count.
   */
  recordFire(id: string, runCount?: number): void {
    this.ensureTable();
    const db = getDatabase();
    if (runCount !== undefined) {
      db.prepare("UPDATE trigger_config SET last_fired = ?, run_count = ? WHERE id = ?").run(
        new Date().toISOString(),
        runCount,
        id,
      );
    } else {
      db.prepare("UPDATE trigger_config SET last_fired = ?, run_count = run_count + 1 WHERE id = ?").run(
        new Date().toISOString(),
        id,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Migrations
  // -----------------------------------------------------------------------

  /**
   * Ensure the CHECK constraint on `type` includes 'email'.
   * SQLite doesn't support ALTER CHECK, so we recreate the table if needed.
   * This is a no-op for fresh databases (SQL_CREATE already includes 'email').
   */
  private migrateCheckConstraint(db: ReturnType<typeof getDatabase>): void {
    try {
      // Probe whether the current CHECK allows 'email' by attempting an insert.
      // If it fails with a constraint error, we need to migrate.
      const probeId = "__check_probe__";
      db.prepare(
        `INSERT INTO trigger_config (id, type, enabled, config, action, created_at)
         VALUES (?, 'email', 0, '{}', '{}', ?)`,
      ).run(probeId, new Date().toISOString());

      // If we get here, the CHECK already allows 'email'. Clean up the probe row.
      db.prepare("DELETE FROM trigger_config WHERE id = ?").run(probeId);
    } catch {
      // CHECK constraint rejected 'email' — recreate the table.
      log.info("TriggerStore: migrating CHECK constraint to include 'email' type");

      db.exec("BEGIN TRANSACTION");
      try {
        db.exec("ALTER TABLE trigger_config RENAME TO trigger_config_old");
        db.exec(SQL_CREATE);
        db.exec(`
          INSERT INTO trigger_config
            (id, type, enabled, config, action, label, run_count, error_count, max_runs, last_fired, created_at)
          SELECT
            id, type, enabled, config, action, label, run_count, error_count, max_runs, last_fired, created_at
          FROM trigger_config_old
        `);
        db.exec("DROP TABLE trigger_config_old");
        db.exec("COMMIT");
        log.info("TriggerStore: CHECK constraint migration complete");
      } catch (migrationErr) {
        db.exec("ROLLBACK");
        log.error(`TriggerStore: CHECK constraint migration failed: ${migrationErr}`);
        throw migrationErr;
      }
    }
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
      run_count: row.run_count ?? 0,
      error_count: row.error_count ?? 0,
      max_runs: row.max_runs ?? 0,
      last_fired: row.last_fired ?? undefined,
      created_at: row.created_at,
    };
  }
}
