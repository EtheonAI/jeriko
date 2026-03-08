/**
 * Mascot — Jeriko cat head ASCII art for the welcome banner.
 *
 * Uses Unicode Braille characters (U+2800–U+28FF) for the highest
 * possible terminal resolution: each character encodes a 2×4 dot grid
 * (8 sub-pixels per cell). This is the same technique used by terminal
 * image renderers for maximum fidelity.
 *
 * The art is compressed from the original full-size cat silhouette
 * (23×78 → 6×42). Effective resolution: 84×24 pixels in 42×6 chars.
 * Rendered in pure white (#ffffff) for AAA accessibility (21:1 contrast).
 */

import chalk from "chalk";
import { stripAnsi } from "../format.js";

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Build the Jeriko cat head as an array of chalk-styled lines.
 * All lines padded to uniform visual width for column alignment.
 */
export function buildMascotCompact(): string[] {
  return normalizeWidth(colorize(CAT_ART));
}

/** Alias — single mascot size. */
export const buildMascot = buildMascotCompact;

// ---------------------------------------------------------------------------
// Art definition — braille-compressed cat (side profile)
//
// Compressed from the original 23×78 full-block art using Braille
// character encoding: each cell maps a 2-col × 4-row pixel block
// to one of 256 Braille patterns (U+2800–U+28FF).
//
// Key features preserved at sub-pixel level:
//   - Ear tips and inner ear detail (lines 0–1)
//   - Head widening and body contour (lines 2–3)
//   - Two eye gaps as ⣶ (top dots missing) in line 4
//   - Front leg gap as ⠿ (bottom dots missing) in line 4
//   - Underbelly taper (line 5)
// ---------------------------------------------------------------------------

const CAT_ART: readonly string[] = [
  "                        ⢀⣠⣤⣿⣧⣤    ⢀⣀⣤⣾⣷⣤",
  "                     ⢠⣤⣶⡾⠟⠉⣤⣿⣿⣶⣤⣤⣴⣾⣿⣭⡅⢸⣿",
  "                ⢠⣴⣶⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
  "         ⣀⣀⣀⣀⣀⣀⡀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⡆",
  "       ⢸⣿⣿⣿⡿⠿⠿⠿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣶⣶⣾⣿⣿⣿⣿⣿⣶⣶⣶⣾⣿⣿⡇",
  "       ⠈⠉⠉⠉⠁   ⠉⠉⠉⠉⠛⠛⠻⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠛⠉⠁",
];

/** Number of lines in the art — useful for layout calculations. */
export const MASCOT_HEIGHT = CAT_ART.length;

// ---------------------------------------------------------------------------
// Colorize — pure white for maximum contrast
// ---------------------------------------------------------------------------

/** White chalk instance for the mascot — #ffffff for AAA contrast (21:1). */
const WHITE = chalk.hex("#ffffff");

/**
 * Apply white color to every non-space character in the art.
 * Covers all Unicode Braille Pattern characters (U+2800–U+28FF).
 */
function colorize(lines: readonly string[]): string[] {
  return lines.map((line) => {
    let result = "";
    for (const ch of line) {
      result += ch === " " ? ch : WHITE(ch);
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pad all lines to the same visual width (ignoring ANSI escapes). */
function normalizeWidth(lines: string[]): string[] {
  const maxWidth = Math.max(...lines.map((l) => stripAnsi(l).length));
  return lines.map((l) => {
    const pad = Math.max(0, maxWidth - stripAnsi(l).length);
    return l + " ".repeat(pad);
  });
}
