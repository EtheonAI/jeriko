/**
 * Bracketed Paste — Terminal paste mode handling and stdin filtering.
 *
 * Terminals supporting bracketed paste mode (xterm, Konsole, iTerm2, GNOME
 * Terminal, Windows Terminal) wrap pasted content in CSI escape sequences:
 *
 *   \x1b[200~  (paste start)
 *   ...pasted content...
 *   \x1b[201~  (paste end)
 *
 * Ink's useInput hook does not natively parse these CSI sequences. Depending
 * on the terminal and platform, the escape byte (\x1b) and/or the CSI final
 * byte (~) may be consumed by the input library, leaving partial fragments
 * (e.g. "[201~", "[201") in the delivered input string.
 *
 * Architecture:
 *
 *   process.stdin → StdinFilter (strips markers) → Ink render({ stdin })
 *
 * StdinFilter is a stream adapter (Adapter pattern) that wraps the real
 * stdin, strips paste markers from raw data chunks BEFORE Ink's input
 * parser sees them, and proxies all TTY methods so Ink treats it as a
 * real terminal stream. This is the only reliable approach because Ink
 * may split escape sequences across multiple useInput callbacks.
 *
 * This module also exports pure utility functions for direct marker
 * stripping and detection, usable as defense-in-depth at higher layers.
 *
 * No UI, React, or Ink dependencies — fully testable in isolation.
 */

import { PassThrough } from "stream";

// ---------------------------------------------------------------------------
// Constants — ECMA-48 / xterm bracketed paste mode escape sequences
// ---------------------------------------------------------------------------

/** CSI sequence that marks the start of pasted content. */
export const PASTE_START = "\x1b[200~";

/** CSI sequence that marks the end of pasted content. */
export const PASTE_END = "\x1b[201~";

/** Enable bracketed paste mode — sent to the terminal. */
export const PASTE_MODE_ENABLE = "\x1b[?2004h";

/** Disable bracketed paste mode — sent to the terminal. */
export const PASTE_MODE_DISABLE = "\x1b[?2004l";

/**
 * All known fragment patterns that may leak through the input library.
 *
 * Terminal emulators and input parsers (Ink, readline, libuv) may partially
 * consume the escape sequences, leaving these fragments:
 *
 *   Full:     \x1b[200~  / \x1b[201~   (ESC + CSI + param + final byte)
 *   No ESC:  [200~      / [201~        (Ink consumed ESC as sequence start)
 *   No ~:    \x1b[200   / \x1b[201     (terminal consumed ~ as CSI terminator)
 *   Bare:    [200       / [201         (both ESC and ~ consumed)
 *
 * Ordered longest-first so the regex engine matches the most specific
 * pattern before falling through to shorter fragments.
 */
const PASTE_FRAGMENTS: readonly string[] = [
  PASTE_START,       // \x1b[200~
  PASTE_END,         // \x1b[201~
  "\x1b[200",        // no final byte
  "\x1b[201",        // no final byte
  "[200~",           // no ESC
  "[201~",           // no ESC
  "[200",            // no ESC, no final byte
  "[201",            // no ESC, no final byte
];

/**
 * Compiled regex matching all paste marker fragment patterns.
 * Built from PASTE_FRAGMENTS with proper escaping, global flag.
 */
const PASTE_MARKER_RE: RegExp = buildMarkerRegex(PASTE_FRAGMENTS);

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Build a global regex from an array of literal strings, escaping
 * regex-special characters.
 */
function buildMarkerRegex(fragments: readonly string[]): RegExp {
  const escaped = fragments.map((s) =>
    s.replace(/[[\]\\^$.|?*+(){}]/g, "\\$&"),
  );
  return new RegExp(escaped.join("|"), "g");
}

/**
 * Strip all bracketed paste escape sequence artifacts from an input string.
 *
 * Safe to call on every input event — returns the original string unchanged
 * when no markers are present (fast path: single indexOf check).
 *
 * @param input - Raw input string from Ink's useInput callback
 * @returns Cleaned string with all paste marker fragments removed
 */
export function stripPasteMarkers(input: string): string {
  if (!input) return input;

  // Fast path: skip regex when no bracket character is present.
  // All fragments contain "[" so this is a reliable pre-filter.
  if (!input.includes("[")) return input;

  return input.replace(PASTE_MARKER_RE, "");
}

/**
 * Check whether an input string contains any paste marker artifacts.
 *
 * Useful for logging or diagnostics without modifying the string.
 *
 * @param input - Raw input string to inspect
 * @returns true if any paste marker fragments are detected
 */
export function hasPasteMarkers(input: string): boolean {
  if (!input || !input.includes("[")) return false;
  PASTE_MARKER_RE.lastIndex = 0;
  return PASTE_MARKER_RE.test(input);
}

/**
 * Enable bracketed paste mode on a TTY write stream.
 *
 * @param tty - The stdout or stderr stream (must be a TTY)
 * @returns Cleanup function that disables paste mode, or undefined if not a TTY
 */
export function enableBracketedPaste(
  tty: NodeJS.WriteStream | undefined,
): (() => void) | undefined {
  if (!tty?.isTTY) return undefined;
  tty.write(PASTE_MODE_ENABLE);
  return () => {
    tty.write(PASTE_MODE_DISABLE);
  };
}

// ---------------------------------------------------------------------------
// StdinFilter — Stream adapter for Ink's custom stdin option
// ---------------------------------------------------------------------------

/**
 * Stream adapter that wraps process.stdin to strip bracketed paste markers
 * from raw data BEFORE Ink's input parser processes them.
 *
 * Ink's useInput hook splits escape sequences across multiple callbacks,
 * making it impossible to reliably strip markers at the useInput level.
 * StdinFilter solves this by intercepting data at the stream level where
 * terminal escape sequences arrive as atomic chunks.
 *
 * Proxies all TTY methods (setRawMode, ref, unref) and properties (isTTY)
 * so Ink treats it as a real terminal stream.
 *
 * Usage in chat.tsx:
 *   const filteredStdin = new StdinFilter(process.stdin);
 *   render(<App />, { stdin: filteredStdin as NodeJS.ReadStream });
 *
 * @see https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Bracketed-Paste-Mode
 */
export class StdinFilter extends PassThrough {
  /** Mirrors source.isTTY so Ink enables raw mode and keypress handling. */
  readonly isTTY: boolean;

  /** Reference to the underlying stdin for TTY method proxying. */
  private readonly source: NodeJS.ReadStream;

  constructor(source: NodeJS.ReadStream) {
    super();
    this.source = source;
    this.isTTY = source.isTTY ?? false;

    // Forward data with paste markers stripped. Terminal escape sequences
    // arrive as atomic chunks at this level, so per-chunk replacement is
    // reliable without a cross-chunk state machine.
    source.on("data", (chunk: Buffer | string) => {
      const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      const cleaned = stripPasteMarkers(str);
      if (cleaned.length > 0) {
        this.push(typeof chunk === "string" ? cleaned : Buffer.from(cleaned, "utf-8"));
      }
    });

    source.on("end", () => this.push(null));
    source.on("error", (err) => this.destroy(err));
  }

  /** Proxy setRawMode to the underlying TTY stream. */
  setRawMode(mode: boolean): this {
    if (typeof this.source.setRawMode === "function") {
      this.source.setRawMode(mode);
    }
    return this;
  }

  /** Proxy ref() to keep the event loop alive. */
  ref(): this {
    if (typeof this.source.ref === "function") {
      this.source.ref();
    }
    return this;
  }

  /** Proxy unref() to allow the event loop to exit. */
  unref(): this {
    if (typeof this.source.unref === "function") {
      this.source.unref();
    }
    return this;
  }
}
