/**
 * Mascot — ASCII art builder for Jeriko's cat logo.
 *
 * The Jeriko cat logo, rendered with Unicode block characters (█ ▀ ▄)
 * for high-resolution terminal display. Downscaled from the source artwork
 * (ascii-art-jeriko.txt) using half-block character compositing — each
 * display row represents two pixel rows from the original.
 *
 * Pre-colored with the brand palette: amber body, blue eye accents,
 * dim shadow edges. All lines padded to uniform visual width for
 * column alignment in the welcome banner.
 *
 * Two sizes:
 *   buildMascot()        — full logo (13 lines, ~30 chars) for welcome banner
 *   buildMascotCompact() — compact logo (8 lines, ~22 chars) for inline use
 */

import { t } from "../theme.js";
import { stripAnsi } from "../format.js";

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Build the Jeriko cat logo as an array of chalk-styled lines.
 * All lines are padded to the same visual width for column alignment.
 *
 * Features: two asymmetric ears (right larger), round face, squinting
 * eye detail, and smoothly narrowing chin.
 */
export function buildMascot(): string[] {
  const b = t.brand;    // body — warm amber
  const e = t.blue;     // eyes — blue accents
  const d = t.dim;      // shadow / edge detail

  // Jeriko cat — 13-line logo, 30 chars wide
  // Downscaled from ascii-art-jeriko.txt via half-block compositing.
  const raw = [
    `    ${d("▄▄")}               ${d("▄▄")}${b("██")}${d("▄")}`,
    `   ${b("████")}${d("▄▄")}          ${d("▄")}${b("██████")}`,
    `  ${b("████████████████████████")}`,
    `  ${d("▀")}${b("███████████████████████")}`,
    `   ${b("███████████████████████")}`,
    `  ${d("▄")}${b("████████████████████████")}${d("▄")}`,
    ` ${b("████████████████████████████")}`,
    `${d("▄")}${b("█████████████████")}${e("▀▀▀▀")}${b("████████")}`,
    `${b("██████████████████████████████")}`,
    ` ${b("████████████████████████████")}`,
    `  ${b("██████████████████████████")}`,
    `   ${d("▀▀▀")}${b("███████████████████")}${d("▀▀")}`,
    `       ${d("▀▀")}${b("██████████████")}${d("▀")}`,
  ];

  return normalizeWidth(raw);
}

/**
 * Build a compact cat logo (fewer lines) for narrow terminals or inline use.
 */
export function buildMascotCompact(): string[] {
  const b = t.brand;
  const d = t.dim;

  // Compact cat — 8-line logo, 22 chars wide
  const raw = [
    `  ${d("▄▄▄▄")}         ${d("▄")}${b("██")}${d("▄")}`,
    `  ${b("█████")}${d("▄▄▄")}${b("█")}${d("▄▄▄")}${b("█████")}`,
    `  ${b("█████████████████")}`,
    ` ${d("▄")}${b("██████████████████")}${d("▄")}`,
    `${d("▄")}${b("█████████████████████")}`,
    `${b("██████████████████████")}`,
    ` ${d("▀")}${b("██████████████████")}${d("▀")}`,
    `    ${d("▀▀")}${b("███████████")}${d("▀▀")}`,
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
