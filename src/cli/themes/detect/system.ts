/**
 * System theme detection.
 *
 * Resolves a ThemeKind from the terminal's actual background color, falling
 * back through progressively weaker signals:
 *
 *   1. OSC 11 reply (terminal-provided, most reliable)
 *   2. $COLORFGBG (set by rxvt derivatives; "<fg>;<bg>" indices)
 *   3. $TERM_PROGRAM / $TERM (heuristic)
 *   4. default: "dark"
 *
 * The function is pure-ish — it calls out to OSC 11 (async I/O) but never
 * throws. Callers are free to pass a stubbed detector in tests.
 */

import type { ThemeKind } from "../types.js";
import type { OSC11Result, QueryOutcome, TerminalIO } from "./osc11.js";
import { queryBackgroundColor } from "./osc11.js";

// ---------------------------------------------------------------------------
// Luminance — ITU-R BT.709 relative luminance
// ---------------------------------------------------------------------------

const LINEAR_THRESHOLD = 0.03928;

function gammaExpand(channel: number): number {
  if (channel <= LINEAR_THRESHOLD) return channel / 12.92;
  return Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** BT.709 relative luminance in [0, 1]. */
export function relativeLuminance(rgb: OSC11Result): number {
  const r = gammaExpand(rgb.r);
  const g = gammaExpand(rgb.g);
  const b = gammaExpand(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Classify a background as "dark" or "light" using a luminance midpoint.
 * 0.5 is a reasonable cutoff in practice — very few terminals set an actual
 * mid-gray background, and anything brighter than 0.5 is visually "light".
 */
export function kindFromLuminance(luminance: number): ThemeKind {
  return luminance >= 0.5 ? "light" : "dark";
}

// ---------------------------------------------------------------------------
// $COLORFGBG parser
// ---------------------------------------------------------------------------

/**
 * Parse a COLORFGBG env var value.
 *   "15;0"   — white fg, black bg → dark
 *   "0;15"   — black fg, white bg → light
 *   "7;default" — some xterms emit "default" for untouched bg
 * Returns null if the value isn't in the expected shape.
 */
export function parseColorFgBg(value: string | undefined): ThemeKind | null {
  if (value === undefined || value === "") return null;
  const parts = value.split(";");
  if (parts.length < 2) return null;
  const bg = parts[parts.length - 1];
  if (bg === undefined) return null;
  if (bg === "default") return null;
  const n = Number(bg);
  if (!Number.isFinite(n)) return null;
  // In ANSI 16-color space, 0 is black and 15 is bright white. 0-6 are dark
  // family, 7-15 are light family. (Non-conformant values still useful: a
  // 256-color index below 16 is still the ANSI 16 palette.)
  return n >= 7 ? "light" : "dark";
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export interface DetectOptions {
  readonly env?: Record<string, string | undefined>;
  readonly input?: TerminalIO;
  readonly output?: TerminalIO;
  readonly timeoutMs?: number;
}

/**
 * Detect the terminal's theme kind. Never throws. Falls back to "dark"
 * when every signal is inconclusive.
 */
export async function detectSystemTheme(opts: DetectOptions = {}): Promise<ThemeKind> {
  const env = opts.env ?? process.env;

  // 1. OSC 11 — but only if both streams are provided (tests can opt out).
  if (opts.input && opts.output) {
    const outcome: QueryOutcome = await queryBackgroundColor(opts.input, opts.output, {
      timeoutMs: opts.timeoutMs,
    });
    if (outcome.ok) {
      return kindFromLuminance(relativeLuminance(outcome.value));
    }
  }

  // 2. $COLORFGBG
  const fromEnv = parseColorFgBg(env.COLORFGBG);
  if (fromEnv !== null) return fromEnv;

  // 3. Loose heuristic via $TERM_PROGRAM (Apple Terminal defaults dark,
  //    iTerm2 defaults dark, VS Code defaults to editor theme — unknowable).
  //    We only use this to avoid being surprising; light is rare by default.
  //    No-op: returning "dark" below has the same effect.

  // 4. Default
  return "dark";
}
