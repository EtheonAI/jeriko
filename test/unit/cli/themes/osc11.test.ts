/**
 * Tests for OSC 11 parsing + query flow.
 *
 * The query function is exercised via fake TerminalIO streams so we never
 * touch the real TTY. The 4-digit / 2-digit / BEL-terminated variants are
 * checked explicitly because real terminals disagree on all three.
 */

import { describe, test, expect } from "bun:test";
import { parseOSC11, queryBackgroundColor } from "../../../../src/cli/themes/index.js";
import type { TerminalIO } from "../../../../src/cli/themes/index.js";

// ---------------------------------------------------------------------------
// Fake streams
// ---------------------------------------------------------------------------

interface FakeTerminal {
  io: TerminalIO;
  emit: (chunk: string) => void;
  writes: string[];
  listeners: Array<(c: Buffer | string) => void>;
}

function makeFake(opts: { isTTY?: boolean } = {}): FakeTerminal {
  const writes: string[] = [];
  const listeners: Array<(c: Buffer | string) => void> = [];
  let isRaw = false;
  const io: TerminalIO = {
    write: (s) => { writes.push(s); },
    on: (_event, listener) => { listeners.push(listener); },
    off: (_event, listener) => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    },
    setRawMode: (r: boolean) => { isRaw = r; return isRaw; },
    isTTY: opts.isTTY ?? true,
  };
  return {
    io,
    writes,
    listeners,
    emit: (chunk) => {
      // Copy so concurrent unsubscription during emit is safe.
      for (const l of [...listeners]) l(chunk);
    },
  };
}

// ---------------------------------------------------------------------------
// parseOSC11
// ---------------------------------------------------------------------------

describe("parseOSC11", () => {
  test("parses 4-digit-per-channel response (xterm canonical)", () => {
    const result = parseOSC11("\x1b]11;rgb:ffff/ffff/ffff\x1b\\");
    expect(result).not.toBeNull();
    expect(result!.r).toBeCloseTo(1, 5);
    expect(result!.g).toBeCloseTo(1, 5);
    expect(result!.b).toBeCloseTo(1, 5);
  });

  test("parses 2-digit-per-channel response", () => {
    const result = parseOSC11("\x1b]11;rgb:00/00/00\x1b\\");
    expect(result).not.toBeNull();
    expect(result!.r).toBe(0);
    expect(result!.g).toBe(0);
    expect(result!.b).toBe(0);
  });

  test("parses BEL-terminated response", () => {
    const result = parseOSC11("\x1b]11;rgb:7f7f/0000/ffff\x07");
    expect(result).not.toBeNull();
    expect(result!.r).toBeCloseTo(0x7f7f / 0xffff, 5);
    expect(result!.b).toBeCloseTo(1, 5);
  });

  test("returns null for unrecognizable payload", () => {
    expect(parseOSC11("hello")).toBeNull();
    expect(parseOSC11("")).toBeNull();
    expect(parseOSC11("rgb:zz/zz/zz")).toBeNull();
  });

  test("mid-channel digit count of 1 is still accepted", () => {
    // Some terminals return short hex; contract says accept anything 1–8.
    const result = parseOSC11("\x1b]11;rgb:f/0/0\x1b\\");
    expect(result).not.toBeNull();
    expect(result!.r).toBe(1);
    expect(result!.g).toBe(0);
    expect(result!.b).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// queryBackgroundColor
// ---------------------------------------------------------------------------

describe("queryBackgroundColor", () => {
  test("resolves with parsed value when terminal replies", async () => {
    const input  = makeFake();
    const output = makeFake();
    const promise = queryBackgroundColor(input.io, output.io, { timeoutMs: 50 });
    // Simulate terminal reply
    input.emit("\x1b]11;rgb:1234/5678/9abc\x1b\\");
    const outcome = await promise;
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.r).toBeCloseTo(0x1234 / 0xffff, 4);
    }
  });

  test("resolves with no-tty when either stream is not a TTY", async () => {
    const input  = makeFake({ isTTY: false });
    const output = makeFake({ isTTY: true });
    const outcome = await queryBackgroundColor(input.io, output.io, { timeoutMs: 50 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("no-tty");
  });

  test("resolves with timeout when terminal never replies", async () => {
    const input  = makeFake();
    const output = makeFake();
    const outcome = await queryBackgroundColor(input.io, output.io, { timeoutMs: 20 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("timeout");
  });

  test("resolves with unparseable when terminal replies with garbage", async () => {
    const input  = makeFake();
    const output = makeFake();
    const promise = queryBackgroundColor(input.io, output.io, { timeoutMs: 30 });
    input.emit("garbled nonsense that isn't OSC 11");
    const outcome = await promise;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("unparseable");
  });

  test("writes the OSC 11 query to the output stream", async () => {
    const input  = makeFake();
    const output = makeFake();
    const promise = queryBackgroundColor(input.io, output.io, { timeoutMs: 20 });
    await promise;
    expect(output.writes.length).toBeGreaterThan(0);
    expect(output.writes[0]).toContain("\x1b]11;?");
  });

  test("detaches its data listener after resolving", async () => {
    const input  = makeFake();
    const output = makeFake();
    const promise = queryBackgroundColor(input.io, output.io, { timeoutMs: 30 });
    input.emit("\x1b]11;rgb:00/00/00\x1b\\");
    await promise;
    expect(input.listeners.length).toBe(0);
  });
});
