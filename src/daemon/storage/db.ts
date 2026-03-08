// Storage — SQLite database lifecycle (init, migrate, close).

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { MIGRATIONS } from "./migrations.js";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default data directory: ~/.jeriko/data (co-located with daemon PID/socket) */
const DATA_DIR = join(homedir(), ".jeriko", "data");

/** Database file path. */
const DB_PATH = join(DATA_DIR, "jeriko.db");

/** SQLite WAL-mode companion file extensions. */
const JOURNAL_EXTENSIONS = ["-wal", "-shm"] as const;

// ─── Singleton ──────────────────────────────────────────────────────────────

let _db: Database | null = null;

/**
 * Create and configure a new SQLite database connection.
 *
 * - Creates the data directory if it does not exist.
 * - Cleans up orphaned WAL/SHM journals (prevents "disk I/O error").
 * - Opens (or creates) the database file.
 * - Applies PRAGMA settings for performance and safety.
 * - Runs any pending migrations.
 *
 * This is the low-level initializer. Prefer `getDatabase()` for normal use.
 */
export function initDatabase(dbPath: string = DB_PATH): Database {
  // Ensure parent directory exists.
  const dir = join(dbPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Proactively clean up orphaned journal files before opening.
  // When a WAL-mode DB file is deleted but -wal/-shm remain,
  // SQLite cannot reconcile them and throws "disk I/O error".
  cleanOrphanedJournals(dbPath);

  const db = new Database(dbPath, { create: true });

  // Performance and durability pragmas.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA cache_size = -64000"); // 64 MB
  db.exec("PRAGMA foreign_keys = ON");

  // Run any pending migrations.
  runMigrations(db);

  // Set singleton so getDatabase() returns this instance.
  _db = db;

  return db;
}

/**
 * Remove orphaned SQLite WAL/SHM journal files before opening.
 *
 * Journals are orphaned when the main DB file is completely missing
 * but companion `-wal` and `-shm` files remain from a previous session.
 * This causes "disk I/O error" (SQLITE_IOERR_SHORT_READ) because SQLite
 * cannot reconcile WAL entries against a non-existent database.
 *
 * We ONLY clean when the DB file does not exist. If the DB file exists
 * (any size, including header-only), the WAL may contain valid uncommitted
 * data that hasn't been checkpointed yet. SQLite in WAL mode keeps the
 * main file small and stores active data in the WAL — deleting it
 * would destroy data.
 */
function cleanOrphanedJournals(dbPath: string): void {
  // If the DB file exists, the WAL/SHM may contain valid data — leave them
  if (existsSync(dbPath)) return;

  // DB file is missing — any remaining journals are orphaned
  for (const ext of JOURNAL_EXTENSIONS) {
    const journalPath = dbPath + ext;
    if (existsSync(journalPath)) {
      try { unlinkSync(journalPath); } catch { /* race — non-fatal */ }
    }
  }
}

/**
 * Get the shared database instance, creating it on first call.
 *
 * Thread-safe within a single Bun process (synchronous lazy init).
 */
export function getDatabase(): Database {
  if (_db === null) {
    _db = initDatabase();
  }
  return _db;
}

/**
 * Run all pending SQL migrations from the embedded migration registry.
 *
 * Migrations are embedded at compile time (see migrations.ts) so they
 * work in both development and compiled binary. Each migration is tracked
 * in the `_migrations` table so it only runs once.
 */
export function runMigrations(db: Database): void {
  // Ensure migration tracking table exists.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `);

  if (MIGRATIONS.length === 0) return;

  // Determine which have already been applied.
  const applied = new Set<string>(
    db
      .query<{ name: string }, []>("SELECT name FROM _migrations")
      .all()
      .map((row) => row.name),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.filename)) continue;

    // Run the entire migration inside a transaction.
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
        .run(migration.filename, Date.now());
    })();
  }
}

/**
 * Close the shared database connection and release the singleton.
 *
 * Forces a TRUNCATE checkpoint before closing to ensure all WAL data
 * is merged into the main DB file. This prevents stale WAL/SHM files
 * from causing "disk I/O error" on the next open.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * After closing, the next `getDatabase()` call will re-open a fresh connection.
 */
export function closeDatabase(): void {
  if (_db !== null) {
    // Merge all WAL data into the main DB and truncate the WAL file.
    // Without this, stale WAL/SHM files may remain after close and
    // cause SQLITE_IOERR_SHORT_READ on the next connection.
    try { _db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* DB may not be in WAL mode */ }
    _db.close();
    _db = null;
  }
}
