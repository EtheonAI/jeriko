/**
 * Tests for the user config loader.
 *
 * Every error path returns diagnostics + falls back to defaults; no throw.
 * Happy path merges overrides onto defaults by id, preserving description
 * and scope.
 */

import { describe, test, expect } from "bun:test";
import {
  DEFAULT_BINDINGS,
  DEFAULT_BINDINGS_BY_ID,
  formatChord,
  loadKeybindings,
  parseChord,
} from "../../../../src/cli/keybindings/index.js";

function fakeReader(content: string | Error) {
  return async (_path: string): Promise<string> => {
    if (content instanceof Error) throw content;
    return content;
  };
}

function enoent(): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error("ENOENT");
  err.code = "ENOENT";
  return err;
}

// ---------------------------------------------------------------------------
// Missing file
// ---------------------------------------------------------------------------

describe("missing file", () => {
  test("returns defaults and a missing-file diagnostic", async () => {
    const result = await loadKeybindings("/does/not/exist", {
      readFile: fakeReader(enoent()),
    });
    expect(result.bindings).toEqual(DEFAULT_BINDINGS);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      kind: "missing-file",
      path: "/does/not/exist",
    });
  });
});

// ---------------------------------------------------------------------------
// Unreadable file
// ---------------------------------------------------------------------------

describe("unreadable file", () => {
  test("non-ENOENT errors surface as 'unreadable' diagnostic", async () => {
    const err = new Error("EACCES") as NodeJS.ErrnoException;
    err.code = "EACCES";
    const result = await loadKeybindings("/no/access", { readFile: fakeReader(err) });
    expect(result.bindings).toEqual(DEFAULT_BINDINGS);
    expect(result.diagnostics[0]?.kind).toBe("unreadable");
  });
});

// ---------------------------------------------------------------------------
// Malformed JSON
// ---------------------------------------------------------------------------

describe("malformed JSON", () => {
  test("returns defaults and a malformed-json diagnostic", async () => {
    const result = await loadKeybindings("/config", {
      readFile: fakeReader("{ not json"),
    });
    expect(result.bindings).toEqual(DEFAULT_BINDINGS);
    expect(result.diagnostics[0]?.kind).toBe("malformed-json");
  });
});

// ---------------------------------------------------------------------------
// Shape error (Zod)
// ---------------------------------------------------------------------------

describe("shape error", () => {
  test("top-level wrong shape is rejected", async () => {
    const result = await loadKeybindings("/config", {
      readFile: fakeReader(JSON.stringify({ bindings: "not-an-object" })),
    });
    expect(result.bindings).toEqual(DEFAULT_BINDINGS);
    expect(result.diagnostics[0]?.kind).toBe("shape-error");
  });

  test("extra top-level keys are rejected (strict)", async () => {
    const result = await loadKeybindings("/config", {
      readFile: fakeReader(JSON.stringify({ bindings: {}, extra: true })),
    });
    expect(result.diagnostics[0]?.kind).toBe("shape-error");
  });

  test("invalid binding id format is rejected", async () => {
    const result = await loadKeybindings("/config", {
      readFile: fakeReader(JSON.stringify({ bindings: { "Input.Submit": "return" } })),
    });
    expect(result.diagnostics[0]?.kind).toBe("shape-error");
  });
});

// ---------------------------------------------------------------------------
// Unknown binding id
// ---------------------------------------------------------------------------

describe("unknown binding", () => {
  test("diagnostic emitted, defaults preserved for the rest", async () => {
    const result = await loadKeybindings("/config", {
      readFile: fakeReader(JSON.stringify({
        bindings: { "not.a.real.binding": "ctrl+x" },
      })),
    });
    expect(result.diagnostics.some((d) => d.kind === "unknown-binding")).toBe(true);
    // Defaults still fully present
    expect(result.bindings.length).toBe(DEFAULT_BINDINGS.length);
  });
});

// ---------------------------------------------------------------------------
// Invalid chord value
// ---------------------------------------------------------------------------

describe("invalid chord", () => {
  test("per-entry diagnostic; other overrides still applied", async () => {
    const result = await loadKeybindings("/config", {
      readFile: fakeReader(JSON.stringify({
        bindings: {
          "input.submit":    "ctrl+return",      // valid
          "input.escape":    "banana+foo",       // invalid
        },
      })),
    });
    const invalidDiag = result.diagnostics.find((d) => d.kind === "invalid-chord");
    expect(invalidDiag).toBeDefined();

    const submit = result.bindings.find((b) => b.id === "input.submit")!;
    const escape = result.bindings.find((b) => b.id === "input.escape")!;
    expect(formatChord(submit.chord)).toBe(formatChord(parseChord("ctrl+return")));
    // Escape fell back to its default
    expect(formatChord(escape.chord)).toBe(
      formatChord(DEFAULT_BINDINGS_BY_ID.get("input.escape")!.chord),
    );
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("happy path", () => {
  test("overrides replace the chord only — description and scope unchanged", async () => {
    const result = await loadKeybindings("/config", {
      readFile: fakeReader(JSON.stringify({
        bindings: { "input.submit": "ctrl+return" },
      })),
    });
    const submit = result.bindings.find((b) => b.id === "input.submit")!;
    const defaultSubmit = DEFAULT_BINDINGS_BY_ID.get("input.submit")!;
    expect(formatChord(submit.chord)).toBe("Ctrl+Enter");
    expect(submit.description).toBe(defaultSubmit.description);
    expect(submit.scope).toBe(defaultSubmit.scope);
    expect(result.diagnostics).toHaveLength(0);
  });

  test("empty bindings object yields defaults with no diagnostics", async () => {
    const result = await loadKeybindings("/config", {
      readFile: fakeReader(JSON.stringify({ bindings: {} })),
    });
    expect(result.bindings).toEqual(DEFAULT_BINDINGS);
    expect(result.diagnostics).toHaveLength(0);
  });
});
