/**
 * Banner — Welcome banner printed to console before Ink takes over.
 *
 * Uses formatWelcome from format.ts. Called once at startup via
 * console.log (not rendered as an Ink component) so it stays in
 * the terminal's scrollback buffer.
 */

import { formatWelcome } from "../format.js";

/**
 * Print the welcome banner to stdout.
 * Called before Ink's render() to ensure it stays in scrollback.
 */
export function printBanner(version: string, model: string, cwd: string): void {
  console.log("");
  console.log(formatWelcome(version, model, cwd));
  console.log("");
}
