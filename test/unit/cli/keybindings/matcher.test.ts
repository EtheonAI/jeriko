/**
 * Tests for the pure matcher primitives — parseChord, formatChord,
 * normalizeInkKey, and the equality / prefix matchers.
 */

import { describe, test, expect } from "bun:test";
import {
  ChordParseError,
  chordMatches,
  chordStartsWith,
  formatChord,
  keyEventsEqual,
  normalizeInkKey,
  parseChord,
} from "../../../../src/cli/keybindings/index.js";
import type { InkKey, KeyEvent } from "../../../../src/cli/keybindings/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inkKey(overrides: Partial<InkKey> = {}): InkKey {
  return {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageUp: false,  pageDown: false,  home: false,      end: false,
    return: false,  escape: false,    tab: false,       backspace: false,
    delete: false,  ctrl: false,      shift: false,     meta: false,
    ...overrides,
  };
}

function key(partial: Partial<KeyEvent> & Pick<KeyEvent, "key">): KeyEvent {
  return { ctrl: false, meta: false, shift: false, ...partial };
}

// ---------------------------------------------------------------------------
// parseChord
// ---------------------------------------------------------------------------

describe("parseChord", () => {
  test("single named key", () => {
    expect(parseChord("escape")).toEqual([key({ key: "escape" })]);
  });

  test("single character key", () => {
    expect(parseChord("a")).toEqual([key({ key: "a" })]);
  });

  test("uppercase in spec is lowercased", () => {
    expect(parseChord("A")).toEqual([key({ key: "a" })]);
  });

  test("ctrl+c", () => {
    expect(parseChord("ctrl+c")).toEqual([key({ key: "c", ctrl: true })]);
  });

  test("all modifiers + a named key", () => {
    expect(parseChord("ctrl+shift+alt+tab")).toEqual([
      key({ key: "tab", ctrl: true, shift: true, meta: true }),
    ]);
  });

  test("chord (space-separated sequences)", () => {
    expect(parseChord("ctrl+k ctrl+s")).toEqual([
      key({ key: "k", ctrl: true }),
      key({ key: "s", ctrl: true }),
    ]);
  });

  test("alias: enter → return", () => {
    expect(parseChord("enter")).toEqual(parseChord("return"));
  });

  test("alias: esc → escape", () => {
    expect(parseChord("esc")).toEqual(parseChord("escape"));
  });

  test("alias: alt is a synonym for meta", () => {
    expect(parseChord("alt+f")).toEqual(parseChord("meta+f"));
  });

  test("empty string throws", () => {
    expect(() => parseChord("")).toThrow(ChordParseError);
  });

  test("unknown modifier throws", () => {
    expect(() => parseChord("super+a")).toThrow(ChordParseError);
  });

  test("multi-char key name with no alias throws", () => {
    expect(() => parseChord("foobar")).toThrow(ChordParseError);
  });

  test("trailing empty segment throws", () => {
    expect(() => parseChord("ctrl+")).toThrow(ChordParseError);
  });
});

// ---------------------------------------------------------------------------
// formatChord
// ---------------------------------------------------------------------------

describe("formatChord", () => {
  test("named keys get user-facing labels", () => {
    expect(formatChord(parseChord("escape"))).toBe("Esc");
    expect(formatChord(parseChord("return"))).toBe("Enter");
    expect(formatChord(parseChord("up"))).toBe("↑");
  });

  test("modifiers render in canonical order", () => {
    expect(formatChord(parseChord("shift+ctrl+a"))).toBe("Ctrl+Shift+A");
  });

  test("chord sequences render space-separated", () => {
    expect(formatChord(parseChord("ctrl+k ctrl+s"))).toBe("Ctrl+K Ctrl+S");
  });
});

// ---------------------------------------------------------------------------
// normalizeInkKey
// ---------------------------------------------------------------------------

describe("normalizeInkKey", () => {
  test("named keys take priority over input", () => {
    expect(normalizeInkKey("", inkKey({ return: true }))).toEqual(key({ key: "return" }));
    expect(normalizeInkKey("", inkKey({ escape: true }))).toEqual(key({ key: "escape" }));
    expect(normalizeInkKey("", inkKey({ upArrow: true }))).toEqual(key({ key: "up" }));
  });

  test("single-char input normalizes to lowercase key", () => {
    expect(normalizeInkKey("A", inkKey({ shift: true }))).toEqual(
      key({ key: "a", shift: true }),
    );
  });

  test("modifier combos round-trip", () => {
    expect(normalizeInkKey("c", inkKey({ ctrl: true }))).toEqual(
      key({ key: "c", ctrl: true }),
    );
  });

  test("space is canonicalized", () => {
    expect(normalizeInkKey(" ", inkKey())).toEqual(key({ key: "space" }));
  });

  test("multi-character input (paste) yields null", () => {
    expect(normalizeInkKey("hello", inkKey())).toBeNull();
  });

  test("empty input with no named key yields null", () => {
    expect(normalizeInkKey("", inkKey())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Matchers
// ---------------------------------------------------------------------------

describe("keyEventsEqual", () => {
  test("identical events are equal", () => {
    expect(keyEventsEqual(key({ key: "a" }), key({ key: "a" }))).toBe(true);
  });

  test("different key → not equal", () => {
    expect(keyEventsEqual(key({ key: "a" }), key({ key: "b" }))).toBe(false);
  });

  test("different modifier → not equal", () => {
    expect(keyEventsEqual(key({ key: "a" }), key({ key: "a", ctrl: true }))).toBe(false);
  });
});

describe("chordMatches", () => {
  test("identical chords match", () => {
    expect(chordMatches(parseChord("ctrl+k ctrl+s"), parseChord("ctrl+k ctrl+s"))).toBe(true);
  });

  test("different lengths don't match", () => {
    expect(chordMatches(parseChord("ctrl+k"), parseChord("ctrl+k ctrl+s"))).toBe(false);
  });

  test("different sequences don't match", () => {
    expect(chordMatches(parseChord("ctrl+k ctrl+a"), parseChord("ctrl+k ctrl+s"))).toBe(false);
  });
});

describe("chordStartsWith", () => {
  test("strict prefix returns true", () => {
    expect(chordStartsWith(parseChord("ctrl+k ctrl+s"), parseChord("ctrl+k"))).toBe(true);
  });

  test("full match is NOT a prefix (strict prefix only)", () => {
    expect(chordStartsWith(parseChord("ctrl+k ctrl+s"), parseChord("ctrl+k ctrl+s"))).toBe(false);
  });

  test("empty candidate is not a prefix", () => {
    expect(chordStartsWith(parseChord("ctrl+k"), [])).toBe(false);
  });

  test("non-matching prefix returns false", () => {
    expect(chordStartsWith(parseChord("ctrl+k ctrl+s"), parseChord("ctrl+a"))).toBe(false);
  });
});
