#!/usr/bin/env bun
/**
 * Jeriko — Unix-first CLI toolkit for AI agents
 *
 * Entry point: routes to CLI dispatcher or daemon based on command.
 *   `jeriko serve`  → starts the daemon (always-on background service)
 *   `jeriko <cmd>`  → runs CLI command (standalone, no daemon needed)
 *   `jeriko`        → interactive chat (connects to daemon if running)
 */

import { dispatcher } from "./cli/dispatcher.js";

const args = process.argv.slice(2);
dispatcher(args).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
