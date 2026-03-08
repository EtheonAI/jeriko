/**
 * Mascot — Jeriko cat head ASCII art for the welcome banner.
 *
 * Uses Unicode half-block characters for a clean, recognizable cat face.
 * Compact 4-line art with ears, eyes, nose, and jaw.
 *
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
// Art definition — block-character cat head
//
// ▄▄       ▄▄
// █▀▀▀▀▀▀▀▀▀▀▀█
// █  ▀     ▀  █
// █     ▄     █
// ▀▀▀▀▀▀▀▀▀▀▀▀▀
//
// Anatomy:
//   Line 0: ear tips (▄▄ half-blocks with gap)
//   Line 1: head top (full blocks with inner space)
//   Line 2: eyes (▀ half-blocks as pupils)
//   Line 3: nose (▄ half-block center)
//   Line 4: jaw (▀ half-blocks)
// ---------------------------------------------------------------------------

const CAT_ART: readonly string[] = [
  "▄▄       ▄▄",
  "█▀▀▀▀▀▀▀▀▀▀▀█",
  "█  ▀     ▀  █",
  "█     ▄     █",
  "▀▀▀▀▀▀▀▀▀▀▀▀▀",
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
