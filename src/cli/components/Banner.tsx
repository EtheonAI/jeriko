/**
 * Banner — Minimal startup banner printed to console before Ink takes over.
 *
 * Clean 2-line format:
 *   jeriko v2.1.0
 *   model: claude-sonnet-4  cwd: ~/projects/myapp
 */

import { formatWelcome } from "../format.js";

/**
 * Print the welcome banner to stdout.
 * Called before Ink's render() to ensure it stays in scrollback.
 */
export function printBanner(version: string, model: string, cwd: string, mode?: string): void {
  console.log("");
  console.log(formatWelcome(version, model, cwd, mode));
  console.log("");
}
