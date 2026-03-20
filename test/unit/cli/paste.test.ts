/**
 * Tests for bracketed paste mode pure logic.
 *
 * Tests stripPasteMarkers, hasPasteMarkers, and enableBracketedPaste
 * without requiring any UI runtime or terminal.
 */

import { describe, test, expect } from "bun:test";
import { EventEmitter } from "events";
import {
  stripPasteMarkers,
  hasPasteMarkers,
  enableBracketedPaste,
  StdinFilter,
  PASTE_START,
  PASTE_END,
  PASTE_MODE_ENABLE,
  PASTE_MODE_DISABLE,
} from "../../../src/cli/lib/paste.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("paste constants", () => {
  test("PASTE_START is the CSI 200~ sequence", () => {
    expect(PASTE_START).toBe("\x1b[200~");
  });

  test("PASTE_END is the CSI 201~ sequence", () => {
    expect(PASTE_END).toBe("\x1b[201~");
  });

  test("PASTE_MODE_ENABLE is the DEC private mode 2004 enable", () => {
    expect(PASTE_MODE_ENABLE).toBe("\x1b[?2004h");
  });

  test("PASTE_MODE_DISABLE is the DEC private mode 2004 disable", () => {
    expect(PASTE_MODE_DISABLE).toBe("\x1b[?2004l");
  });
});

// ---------------------------------------------------------------------------
// stripPasteMarkers
// ---------------------------------------------------------------------------

describe("stripPasteMarkers", () => {
  // ----- Pass-through (no markers) -----

  test("returns empty string unchanged", () => {
    expect(stripPasteMarkers("")).toBe("");
  });

  test("returns plain text unchanged", () => {
    expect(stripPasteMarkers("hello world")).toBe("hello world");
  });

  test("returns text with newlines unchanged", () => {
    expect(stripPasteMarkers("line1\nline2\nline3")).toBe("line1\nline2\nline3");
  });

  test("returns text with special chars unchanged", () => {
    expect(stripPasteMarkers("fn(x) { return x * 2; }")).toBe("fn(x) { return x * 2; }");
  });

  // ----- Full escape sequences (both ESC + CSI + param + final byte) -----

  test("strips full start marker wrapping content", () => {
    expect(stripPasteMarkers("\x1b[200~hello world\x1b[201~")).toBe("hello world");
  });

  test("strips full start marker only", () => {
    expect(stripPasteMarkers("\x1b[200~hello world")).toBe("hello world");
  });

  test("strips full end marker only", () => {
    expect(stripPasteMarkers("hello world\x1b[201~")).toBe("hello world");
  });

  test("strips full markers from multi-line paste", () => {
    const input = "\x1b[200~line1\nline2\nline3\x1b[201~";
    expect(stripPasteMarkers(input)).toBe("line1\nline2\nline3");
  });

  // ----- Partial: ESC consumed, brackets + param + tilde remain -----

  test("strips [200~ (ESC consumed by terminal)", () => {
    expect(stripPasteMarkers("[200~hello world[201~")).toBe("hello world");
  });

  test("strips [201~ end marker (ESC consumed)", () => {
    expect(stripPasteMarkers("hello world[201~")).toBe("hello world");
  });

  // ----- Partial: ESC and tilde consumed, brackets + param remain -----
  // This is the exact pattern reported by Konsole/Linux users

  test("strips [200 bare start marker", () => {
    expect(stripPasteMarkers("[200hello world")).toBe("hello world");
  });

  test("strips [201 bare end marker (Konsole/Linux reported issue)", () => {
    expect(stripPasteMarkers("hello world[201")).toBe("hello world");
  });

  test("strips [201 when it appears alone (empty paste artifact)", () => {
    expect(stripPasteMarkers("[201")).toBe("");
  });

  test("strips [200 when it appears alone", () => {
    expect(stripPasteMarkers("[200")).toBe("");
  });

  // ----- Partial: ESC consumed, tilde present -----

  test("strips mixed partial markers", () => {
    expect(stripPasteMarkers("[200~content here[201")).toBe("content here");
  });

  // ----- Multiple markers in single input -----

  test("strips multiple marker occurrences", () => {
    const input = "\x1b[200~first\x1b[201~\x1b[200~second\x1b[201~";
    expect(stripPasteMarkers(input)).toBe("firstsecond");
  });

  // ----- Content preservation -----

  test("preserves bracket characters in normal text", () => {
    expect(stripPasteMarkers("array[0] = value")).toBe("array[0] = value");
  });

  test("preserves numbered brackets that are not paste markers", () => {
    expect(stripPasteMarkers("item[100] and item[202]")).toBe("item[100] and item[202]");
  });

  test("preserves code with brackets", () => {
    const code = "const arr = [1, 2, 3];\nfor (let i = 0; i < arr.length; i++) {}";
    expect(stripPasteMarkers(code)).toBe(code);
  });

  // ----- Edge cases -----

  test("handles marker at start of input", () => {
    expect(stripPasteMarkers("[201~rest of text")).toBe("rest of text");
  });

  test("handles marker in middle of input", () => {
    expect(stripPasteMarkers("before[201~after")).toBe("beforeafter");
  });

  test("handles consecutive markers with no content", () => {
    expect(stripPasteMarkers("\x1b[200~\x1b[201~")).toBe("");
  });

  test("handles partial ESC-stripped markers in sequence", () => {
    expect(stripPasteMarkers("[200~[201~")).toBe("");
  });

  // ----- ESC without full CSI (just ESC + [ + param, no tilde) -----

  test("strips \\x1b[200 (no tilde)", () => {
    expect(stripPasteMarkers("\x1b[200hello")).toBe("hello");
  });

  test("strips \\x1b[201 (no tilde)", () => {
    expect(stripPasteMarkers("hello\x1b[201")).toBe("hello");
  });

  // ----- Real-world paste scenarios -----

  test("cleans a pasted npm command on Konsole", () => {
    // User pastes "npm install express" — Konsole sends markers
    expect(stripPasteMarkers("[200~npm install express[201~")).toBe("npm install express");
  });

  test("cleans a pasted multi-line prompt on Konsole", () => {
    const input = "[200~Create a React component that:\n- Has a header\n- Shows a list\n- Handles click events[201~";
    const expected = "Create a React component that:\n- Has a header\n- Shows a list\n- Handles click events";
    expect(stripPasteMarkers(input)).toBe(expected);
  });

  test("cleans when only end marker leaks (most common case)", () => {
    // Most terminals: Ink consumes the start marker, end marker leaks
    expect(stripPasteMarkers("npm install express[201")).toBe("npm install express");
  });
});

// ---------------------------------------------------------------------------
// hasPasteMarkers
// ---------------------------------------------------------------------------

describe("hasPasteMarkers", () => {
  test("returns false for empty string", () => {
    expect(hasPasteMarkers("")).toBe(false);
  });

  test("returns false for plain text", () => {
    expect(hasPasteMarkers("hello world")).toBe(false);
  });

  test("returns false for normal brackets", () => {
    expect(hasPasteMarkers("array[0]")).toBe(false);
  });

  test("returns true for full start marker", () => {
    expect(hasPasteMarkers("\x1b[200~hello")).toBe(true);
  });

  test("returns true for full end marker", () => {
    expect(hasPasteMarkers("hello\x1b[201~")).toBe(true);
  });

  test("returns true for bare [201 (Konsole artifact)", () => {
    expect(hasPasteMarkers("hello[201")).toBe(true);
  });

  test("returns true for [200~ without ESC", () => {
    expect(hasPasteMarkers("[200~content")).toBe(true);
  });

  test("returns false for [202] (not a paste marker)", () => {
    expect(hasPasteMarkers("item[202]")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// enableBracketedPaste
// ---------------------------------------------------------------------------

describe("enableBracketedPaste", () => {
  test("returns undefined for non-TTY stream", () => {
    const stream = { isTTY: false, write: () => true } as unknown as NodeJS.WriteStream;
    expect(enableBracketedPaste(stream)).toBeUndefined();
  });

  test("returns undefined for undefined stream", () => {
    expect(enableBracketedPaste(undefined)).toBeUndefined();
  });

  test("writes enable sequence to TTY", () => {
    const written: string[] = [];
    const stream = {
      isTTY: true,
      write: (data: string) => { written.push(data); return true; },
    } as unknown as NodeJS.WriteStream;

    enableBracketedPaste(stream);
    expect(written).toEqual([PASTE_MODE_ENABLE]);
  });

  test("cleanup writes disable sequence", () => {
    const written: string[] = [];
    const stream = {
      isTTY: true,
      write: (data: string) => { written.push(data); return true; },
    } as unknown as NodeJS.WriteStream;

    const cleanup = enableBracketedPaste(stream);
    expect(cleanup).toBeFunction();

    cleanup!();
    expect(written).toEqual([PASTE_MODE_ENABLE, PASTE_MODE_DISABLE]);
  });
});

// ---------------------------------------------------------------------------
// StdinFilter — Stream adapter
// ---------------------------------------------------------------------------

/** Create a mock stdin source (EventEmitter with TTY properties). */
function createMockStdin(options: { isTTY?: boolean } = {}) {
  const emitter = new EventEmitter() as EventEmitter & {
    isTTY: boolean;
    setRawMode: (mode: boolean) => void;
    ref: () => void;
    unref: () => void;
    _rawMode: boolean;
    _refCalls: number;
    _unrefCalls: number;
  };
  emitter.isTTY = options.isTTY ?? true;
  emitter._rawMode = false;
  emitter._refCalls = 0;
  emitter._unrefCalls = 0;
  emitter.setRawMode = (mode: boolean) => { emitter._rawMode = mode; };
  emitter.ref = () => { emitter._refCalls++; };
  emitter.unref = () => { emitter._unrefCalls++; };
  return emitter;
}

/** Collect all data from a StdinFilter into a string. */
function collectData(filter: StdinFilter): Promise<string> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    filter.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf-8")));
    // Resolve after a tick to let events propagate
    setTimeout(() => resolve(chunks.join("")), 10);
  });
}

describe("StdinFilter", () => {
  // ----- TTY property proxying -----

  test("mirrors isTTY from source", () => {
    const source = createMockStdin({ isTTY: true });
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);
    expect(filter.isTTY).toBe(true);
  });

  test("mirrors isTTY=false from non-TTY source", () => {
    const source = createMockStdin({ isTTY: false });
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);
    expect(filter.isTTY).toBe(false);
  });

  test("proxies setRawMode to source", () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);

    filter.setRawMode(true);
    expect(source._rawMode).toBe(true);

    filter.setRawMode(false);
    expect(source._rawMode).toBe(false);
  });

  test("setRawMode returns this for chaining", () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);
    expect(filter.setRawMode(true)).toBe(filter);
  });

  test("proxies ref to source", () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);
    filter.ref();
    expect(source._refCalls).toBe(1);
  });

  test("proxies unref to source", () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);
    filter.unref();
    expect(source._unrefCalls).toBe(1);
  });

  // ----- Data filtering -----

  test("passes through plain text unchanged", async () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);

    source.emit("data", Buffer.from("hello world"));
    const result = await collectData(filter);
    expect(result).toBe("hello world");
  });

  test("passes through multi-line text unchanged", async () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);

    source.emit("data", Buffer.from("line1\nline2\nline3"));
    const result = await collectData(filter);
    expect(result).toBe("line1\nline2\nline3");
  });

  test("strips full paste markers from data chunks", async () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);

    source.emit("data", Buffer.from("\x1b[200~hello world\x1b[201~"));
    const result = await collectData(filter);
    expect(result).toBe("hello world");
  });

  test("strips partial [201~ marker (Konsole/Linux)", async () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);

    source.emit("data", Buffer.from("[200~npm install express[201~"));
    const result = await collectData(filter);
    expect(result).toBe("npm install express");
  });

  test("strips bare [201 marker (ESC and tilde consumed)", async () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);

    source.emit("data", Buffer.from("npm install express[201"));
    const result = await collectData(filter);
    expect(result).toBe("npm install express");
  });

  test("suppresses data events when chunk is entirely markers", async () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);
    const chunks: Buffer[] = [];
    filter.on("data", (chunk: Buffer) => chunks.push(chunk));

    source.emit("data", Buffer.from("\x1b[200~"));
    source.emit("data", Buffer.from("\x1b[201~"));
    await new Promise((r) => setTimeout(r, 10));
    expect(chunks).toHaveLength(0);
  });

  test("handles string data (not just Buffer)", async () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);

    source.emit("data", "\x1b[200~pasted text\x1b[201~");
    const result = await collectData(filter);
    expect(result).toBe("pasted text");
  });

  test("handles multi-line paste with markers", async () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);

    const pasted = "\x1b[200~Create a React component that:\n- Has a header\n- Shows a list\x1b[201~";
    source.emit("data", Buffer.from(pasted));
    const result = await collectData(filter);
    expect(result).toBe("Create a React component that:\n- Has a header\n- Shows a list");
  });

  test("handles multiple data events in sequence", async () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);
    const chunks: string[] = [];
    filter.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));

    source.emit("data", Buffer.from("first"));
    source.emit("data", Buffer.from("\x1b[200~second\x1b[201~"));
    source.emit("data", Buffer.from("third"));
    await new Promise((r) => setTimeout(r, 10));

    expect(chunks).toEqual(["first", "second", "third"]);
  });

  test("preserves array bracket notation in code", async () => {
    const source = createMockStdin();
    const filter = new StdinFilter(source as unknown as NodeJS.ReadStream);

    source.emit("data", Buffer.from("const x = arr[0] + arr[1]"));
    const result = await collectData(filter);
    expect(result).toBe("const x = arr[0] + arr[1]");
  });
});
