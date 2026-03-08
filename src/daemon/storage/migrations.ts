/**
 * Embedded SQL migrations — imported as text so they're bundled into the binary.
 *
 * Bun's bundler inlines `import ... with { type: "text" }` at compile time,
 * ensuring migrations are available in the compiled binary without filesystem access.
 *
 * Migration contract:
 *   - Each entry has a filename (for tracking in _migrations table) and SQL content.
 *   - Entries MUST be in lexicographic order by filename.
 *   - Adding a new migration: import the .sql file and append to MIGRATIONS array.
 */


import init from "./migrations/0001_init.sql" with { type: "text" };

import orchestrator from "./migrations/0002_orchestrator.sql" with { type: "text" };

import triggerConsolidate from "./migrations/0003_trigger_consolidate.sql" with { type: "text" };

import share from "./migrations/0004_share.sql" with { type: "text" };

import billing from "./migrations/0005_billing.sql" with { type: "text" };

import billingConsent from "./migrations/0006_billing_consent.sql" with { type: "text" };

export interface Migration {
  filename: string;
  sql: string;
}

/**
 * All migrations in order. The filename is used as the key in the _migrations
 * tracking table — it must match the original .sql filename exactly.
 */
export const MIGRATIONS: readonly Migration[] = [
  { filename: "0001_init.sql", sql: init },
  { filename: "0002_orchestrator.sql", sql: orchestrator },
  { filename: "0003_trigger_consolidate.sql", sql: triggerConsolidate },
  { filename: "0004_share.sql", sql: share },
  { filename: "0005_billing.sql", sql: billing },
  { filename: "0006_billing_consent.sql", sql: billingConsent },
];
