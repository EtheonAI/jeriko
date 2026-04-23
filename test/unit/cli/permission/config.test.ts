/**
 * Tests for the permission config loader + saver.
 *
 * IO is injected so tests never touch disk. Every diagnostic path is
 * covered; happy paths assert round-trip semantics.
 */

import { describe, test, expect } from "bun:test";
import {
  loadPermissions,
  savePermissions,
} from "../../../../src/cli/permission/index.js";
import type {
  LoaderIO,
  PermissionRule,
} from "../../../../src/cli/permission/index.js";

function fakeIO(overrides: Partial<LoaderIO> = {}): LoaderIO {
  return {
    readFile:  overrides.readFile  ?? (async () => { throw new Error("readFile not stubbed"); }),
    writeFile: overrides.writeFile ?? (async () => {}),
    rename:    overrides.rename    ?? (async () => {}),
    mkdir:     overrides.mkdir     ?? (async () => {}),
  };
}

function enoent(): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error("ENOENT");
  err.code = "ENOENT";
  return err;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

describe("loadPermissions — missing file", () => {
  test("returns empty rules + missing-file diagnostic", async () => {
    const result = await loadPermissions("/no/such/path", {
      readFile: async () => { throw enoent(); },
    });
    expect(result.rules).toEqual([]);
    expect(result.diagnostics[0]?.kind).toBe("missing-file");
  });
});

describe("loadPermissions — unreadable file", () => {
  test("non-ENOENT errors yield 'unreadable' diagnostic", async () => {
    const err = new Error("EACCES") as NodeJS.ErrnoException;
    err.code = "EACCES";
    const result = await loadPermissions("/no/access", {
      readFile: async () => { throw err; },
    });
    expect(result.rules).toEqual([]);
    expect(result.diagnostics[0]?.kind).toBe("unreadable");
  });
});

describe("loadPermissions — malformed JSON", () => {
  test("returns empty rules + malformed-json diagnostic", async () => {
    const result = await loadPermissions("/bad.json", {
      readFile: async () => "{ not json",
    });
    expect(result.rules).toEqual([]);
    expect(result.diagnostics[0]?.kind).toBe("malformed-json");
  });
});

describe("loadPermissions — shape errors", () => {
  test("top-level wrong shape is rejected", async () => {
    const result = await loadPermissions("/config", {
      readFile: async () => JSON.stringify({ rules: "not-an-array" }),
    });
    expect(result.diagnostics[0]?.kind).toBe("shape-error");
    expect(result.rules).toEqual([]);
  });

  test("extra top-level keys are rejected (strict)", async () => {
    const result = await loadPermissions("/config", {
      readFile: async () => JSON.stringify({ rules: [], extra: true }),
    });
    expect(result.diagnostics[0]?.kind).toBe("shape-error");
  });

  test("invalid rule kind is rejected", async () => {
    const result = await loadPermissions("/config", {
      readFile: async () => JSON.stringify({
        rules: [{ kind: "not-a-kind", target: "x", decision: "allow" }],
      }),
    });
    expect(result.diagnostics[0]?.kind).toBe("shape-error");
  });

  test("invalid decision is rejected", async () => {
    const result = await loadPermissions("/config", {
      readFile: async () => JSON.stringify({
        rules: [{ kind: "bash", target: "git ", decision: "sometimes" }],
      }),
    });
    expect(result.diagnostics[0]?.kind).toBe("shape-error");
  });
});

describe("loadPermissions — happy paths", () => {
  test("empty rules array yields no diagnostics", async () => {
    const result = await loadPermissions("/ok", {
      readFile: async () => JSON.stringify({ rules: [] }),
    });
    expect(result.rules).toEqual([]);
    expect(result.diagnostics).toHaveLength(0);
  });

  test("valid rules are loaded with origin=persistent", async () => {
    const result = await loadPermissions("/ok", {
      readFile: async () => JSON.stringify({
        rules: [
          { kind: "bash",      target: "git ", decision: "allow" },
          { kind: "web-fetch", target: "https://api.stripe.com", decision: "allow" },
        ],
      }),
    });
    expect(result.diagnostics).toHaveLength(0);
    expect(result.rules).toHaveLength(2);
    for (const r of result.rules) expect(r.origin).toBe("persistent");
  });
});

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

describe("savePermissions", () => {
  test("writes via a temp-file rename", async () => {
    const writes: Array<[string, string]> = [];
    const renames: Array<[string, string]> = [];
    const mkdirs: string[] = [];
    const io = fakeIO({
      writeFile: async (p, c) => { writes.push([p, c]); },
      rename:    async (from, to) => { renames.push([from, to]); },
      mkdir:     async (p) => { mkdirs.push(p); },
    });

    const rules: PermissionRule[] = [
      { kind: "bash", target: "git ", decision: "allow", origin: "persistent" },
    ];
    const result = await savePermissions("/cfg/permissions.json", rules, io);
    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[0]).toBe("/cfg/permissions.json.tmp");
    expect(renames).toHaveLength(1);
    expect(renames[0]?.[1]).toBe("/cfg/permissions.json");
    expect(mkdirs[0]).toBe("/cfg");
  });

  test("strips session-origin rules (they don't persist)", async () => {
    let captured: string = "";
    const io = fakeIO({
      writeFile: async (_, c) => { captured = c; },
      rename:    async () => {},
      mkdir:     async () => {},
    });

    const rules: PermissionRule[] = [
      { kind: "bash",      target: "rm ", decision: "deny",  origin: "persistent" },
      { kind: "bash",      target: "git", decision: "allow", origin: "session"    },
    ];
    await savePermissions("/cfg.json", rules, io);
    const parsed = JSON.parse(captured);
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0].kind).toBe("bash");
    expect(parsed.rules[0].target).toBe("rm ");
  });

  test("write error is surfaced as diagnostic, not thrown", async () => {
    const io = fakeIO({
      writeFile: async () => { throw new Error("disk full"); },
      mkdir:     async () => {},
    });
    const result = await savePermissions("/cfg.json", [], io);
    expect(result.ok).toBe(false);
    expect(result.diagnostic?.kind).toBe("write-failed");
  });

  test("round-trip: save then load yields the same rules", async () => {
    let captured: string = "";
    const io = fakeIO({
      writeFile: async (_, c) => { captured = c; },
      rename:    async () => {},
      mkdir:     async () => {},
    });

    const rules: PermissionRule[] = [
      { kind: "web-fetch", target: "https://api.stripe.com", decision: "allow", origin: "persistent" },
      { kind: "bash",      target: "git ",                    decision: "allow", origin: "persistent" },
    ];
    await savePermissions("/cfg.json", rules, io);

    const loaded = await loadPermissions("/cfg.json", {
      readFile: async () => captured,
    });
    expect(loaded.diagnostics).toHaveLength(0);
    expect(loaded.rules).toHaveLength(2);
    // Targets + kinds + decisions preserved; origin reinstated as "persistent".
    for (const r of loaded.rules) expect(r.origin).toBe("persistent");
  });
});
