/**
 * Mascot — ASCII art builder for Jeriko's visual identity.
 *
 * Produces a multi-line string array of a geometric AI agent.
 * Each line is pre-colored with chalk using the PALETTE.
 * All lines are padded to uniform visual width.
 *
 * Design philosophy: diamond eyes, data-stream chest, arm circuits.
 * Sleek, modern, distinctive — not cute, not corporate.
 */

import { t } from "../theme.js";
import { stripAnsi } from "../format.js";

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Build the mascot ASCII art as an array of chalk-styled lines.
 * All lines are padded to the same visual width for column alignment.
 */
export function buildMascot(): string[] {
  const b = t.blue;     // body structure
  const e = t.brand;    // eyes + accent
  const d = t.cyan;     // decorative details

  const raw = [
    "",
    `       ${b("╭━━━━━━━━━╮")}`,
    `       ${b("┃")}  ${e("◆")}   ${e("◆")}  ${b("┃")}`,
    `       ${b("┃")}    ${d("◇")}    ${b("┃")}`,
    `       ${b("╰┳━━━━━┳╯")}`,
    `    ${b("╭━━━┫")} ${d("▰▰▰")} ${b("┣━━━╮")}`,
    `    ${b("┃")}   ${b("╰━━┳━━╯")}   ${b("┃")}`,
    `    ${b("╰━━╮")}   ${b("┃")}   ${b("╭━━╯")}`,
    `       ${b("╰━━━┻━━━╯")}`,
    "",
  ];

  return normalizeWidth(raw);
}

/**
 * Build a compact mascot (fewer lines) for narrow terminals or inline use.
 */
export function buildMascotCompact(): string[] {
  const b = t.blue;
  const e = t.brand;
  const d = t.cyan;

  const raw = [
    `  ${b("╭───────╮")}`,
    `  ${b("│")} ${e("◆")}   ${e("◆")} ${b("│")}`,
    `  ${b("│")}   ${d("◇")}   ${b("│")}`,
    `  ${b("╰┬─────┬╯")}`,
    `   ${b("│")} ${d("═══")} ${b("│")}`,
    `   ${b("╰─────╯")}`,
  ];

  return normalizeWidth(raw);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pad all lines to the same visual width (ignoring ANSI escapes).
 */
function normalizeWidth(lines: string[]): string[] {
  const maxWidth = Math.max(...lines.map((l) => stripAnsi(l).length));
  return lines.map((l) => {
    const pad = Math.max(0, maxWidth - stripAnsi(l).length);
    return l + " ".repeat(pad);
  });
}
