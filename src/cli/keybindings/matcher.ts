/**
 * Keybinding Subsystem — pure matching + parsing primitives.
 *
 * Nothing in this file touches React, Ink streams, or module state. Every
 * function takes typed input and returns typed output. This makes the
 * subsystem trivially unit-testable: parse round-trips, normalizers are
 * deterministic, and match logic is a boolean function of inputs.
 *
 * Public surface:
 *   - normalizeInkKey  — Ink's Key → KeyEvent
 *   - parseChord       — "ctrl+k ctrl+s" → Chord
 *   - formatChord      — Chord → display string
 *   - keyEventsEqual   — strict equality on two KeyEvents
 *   - chordMatches     — full match
 *   - chordStartsWith  — prefix match (chord dispatch uses this for pending)
 */

import type { Chord, KeyEvent, NamedKey } from "./types.js";
import { NAMED_KEYS } from "./types.js";

// ---------------------------------------------------------------------------
// Ink normalization
// ---------------------------------------------------------------------------

/**
 * The exact shape we accept from Ink's `useInput(inputHandler)` callback.
 * We mirror the Ink Key type keys we actually care about — unused fields
 * (super/hyper/capsLock/numLock/eventType) are permitted but ignored.
 */
export interface InkKey {
  readonly upArrow: boolean;
  readonly downArrow: boolean;
  readonly leftArrow: boolean;
  readonly rightArrow: boolean;
  readonly pageDown: boolean;
  readonly pageUp: boolean;
  readonly home: boolean;
  readonly end: boolean;
  readonly return: boolean;
  readonly escape: boolean;
  readonly tab: boolean;
  readonly backspace: boolean;
  readonly delete: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
}

/** Map of Ink's boolean-key names to our canonical NamedKey. */
const INK_NAMED_KEY_MAP: ReadonlyArray<readonly [keyof InkKey, NamedKey]> = [
  ["upArrow",    "up"],
  ["downArrow",  "down"],
  ["leftArrow",  "left"],
  ["rightArrow", "right"],
  ["pageUp",     "pageup"],
  ["pageDown",   "pagedown"],
  ["home",       "home"],
  ["end",        "end"],
  ["return",     "return"],
  ["escape",     "escape"],
  ["tab",        "tab"],
  ["backspace",  "backspace"],
  ["delete",     "delete"],
];

/**
 * Convert Ink's per-call `(input, key)` pair into a canonical KeyEvent.
 * Returns null for cases where no single key event can be identified
 * (e.g. pasted text with multiple characters — pastes are handled by a
 * different path and never dispatched through the keybinding store).
 */
export function normalizeInkKey(input: string, key: InkKey): KeyEvent | null {
  // A named key was pressed — it takes priority over `input`.
  for (const [inkFlag, canonical] of INK_NAMED_KEY_MAP) {
    if (key[inkFlag]) {
      return {
        key: canonical,
        ctrl:  key.ctrl,
        meta:  key.meta,
        shift: key.shift,
      };
    }
  }

  // Space is the one literal character with a canonical name.
  if (input === " ") {
    return { key: "space", ctrl: key.ctrl, meta: key.meta, shift: key.shift };
  }

  // Multi-character input with no modifier is a paste — not a key event.
  if (input.length !== 1) return null;

  return {
    key:   input.toLowerCase(),
    ctrl:  key.ctrl,
    meta:  key.meta,
    shift: key.shift,
  };
}

// ---------------------------------------------------------------------------
// Chord parsing — "ctrl+k ctrl+s" → Chord
// ---------------------------------------------------------------------------

/** Known modifier tokens in chord strings. */
const MODIFIER_TOKENS = new Set(["ctrl", "meta", "alt", "shift"]);

/** Alias map from config-string tokens to NamedKey. Accepts ergonomic variants. */
const KEY_ALIASES: Readonly<Record<string, NamedKey>> = {
  enter:     "return",
  return:    "return",
  esc:       "escape",
  escape:    "escape",
  up:        "up",
  down:      "down",
  left:      "left",
  right:     "right",
  tab:       "tab",
  bs:        "backspace",
  backspace: "backspace",
  del:       "delete",
  delete:    "delete",
  home:      "home",
  end:       "end",
  pageup:    "pageup",
  pagedown:  "pagedown",
  space:     "space",
};

const NAMED_KEY_SET: ReadonlySet<string> = new Set(NAMED_KEYS);

export class ChordParseError extends Error {
  public readonly spec: string;
  constructor(spec: string, detail: string) {
    super(`Invalid chord "${spec}": ${detail}`);
    this.name = "ChordParseError";
    this.spec = spec;
  }
}

/**
 * Parse a chord specification. Accepts space-separated key descriptors; each
 * descriptor is plus-joined modifiers followed by a key:
 *
 *   "escape"               → [{key: "escape"}]
 *   "ctrl+c"               → [{key: "c", ctrl: true}]
 *   "ctrl+shift+a"         → [{key: "a", ctrl: true, shift: true}]
 *   "ctrl+k ctrl+s"        → [{key: "k", ctrl: true}, {key: "s", ctrl: true}]
 *
 * Throws ChordParseError for malformed input — callers should catch and
 * report to the user. Never throws for a valid chord.
 */
export function parseChord(spec: string): Chord {
  const trimmed = spec.trim();
  if (trimmed === "") throw new ChordParseError(spec, "empty string");

  const segments = trimmed.split(/\s+/);
  const events: KeyEvent[] = [];

  for (const segment of segments) {
    const parts = segment.toLowerCase().split("+").map((p) => p.trim());
    if (parts.some((p) => p === "")) {
      throw new ChordParseError(spec, `empty segment in "${segment}"`);
    }

    let ctrl = false;
    let meta = false;
    let shift = false;
    let resolvedKey: string | null = null;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      if (!isLast) {
        // Non-terminal parts must be modifiers.
        if (!MODIFIER_TOKENS.has(part)) {
          throw new ChordParseError(
            spec,
            `"${part}" is not a modifier (expected ctrl/meta/alt/shift)`,
          );
        }
        if (part === "ctrl")  ctrl = true;
        if (part === "meta")  meta = true;
        if (part === "alt")   meta = true; // alt is an alias for meta
        if (part === "shift") shift = true;
        continue;
      }
      // Final part is the key.
      const alias = KEY_ALIASES[part];
      if (alias !== undefined) {
        resolvedKey = alias;
      } else if (NAMED_KEY_SET.has(part)) {
        resolvedKey = part;
      } else if (part.length === 1) {
        resolvedKey = part;
      } else {
        throw new ChordParseError(spec, `unknown key "${part}"`);
      }
    }

    if (resolvedKey === null) {
      throw new ChordParseError(spec, `segment "${segment}" has no key`);
    }

    events.push({ key: resolvedKey, ctrl, meta, shift });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Chord formatting — Chord → display string
// ---------------------------------------------------------------------------

/** Canonical display for named keys in help text. */
const NAMED_KEY_DISPLAY: Readonly<Record<NamedKey, string>> = {
  return:    "Enter",
  escape:    "Esc",
  up:        "↑",
  down:      "↓",
  left:      "←",
  right:     "→",
  tab:       "Tab",
  backspace: "⌫",
  delete:    "Del",
  home:      "Home",
  end:       "End",
  pageup:    "PgUp",
  pagedown:  "PgDn",
  space:     "Space",
};

function formatKeyEvent(event: KeyEvent): string {
  const modifiers: string[] = [];
  if (event.ctrl)  modifiers.push("Ctrl");
  if (event.meta)  modifiers.push("Alt");
  if (event.shift) modifiers.push("Shift");
  const named = NAMED_KEY_DISPLAY[event.key as NamedKey];
  const keyText = named ?? event.key.toUpperCase();
  return [...modifiers, keyText].join("+");
}

/** Human-readable rendering of a chord, e.g. `Ctrl+K Ctrl+S`. */
export function formatChord(chord: Chord): string {
  return chord.map(formatKeyEvent).join(" ");
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Strict equality on two KeyEvents. */
export function keyEventsEqual(a: KeyEvent, b: KeyEvent): boolean {
  return (
    a.key   === b.key   &&
    a.ctrl  === b.ctrl  &&
    a.meta  === b.meta  &&
    a.shift === b.shift
  );
}

/** True if `chord` equals `candidate` (same length, element-wise equal). */
export function chordMatches(chord: Chord, candidate: Chord): boolean {
  if (chord.length !== candidate.length) return false;
  for (let i = 0; i < chord.length; i++) {
    if (!keyEventsEqual(chord[i]!, candidate[i]!)) return false;
  }
  return true;
}

/**
 * True if `candidate` is a strict prefix of `chord` (used for chord pending).
 * A chord is NOT its own prefix — chordStartsWith(X, X) === false.
 */
export function chordStartsWith(chord: Chord, candidate: Chord): boolean {
  if (candidate.length === 0) return false;
  if (candidate.length >= chord.length) return false;
  for (let i = 0; i < candidate.length; i++) {
    if (!keyEventsEqual(chord[i]!, candidate[i]!)) return false;
  }
  return true;
}
