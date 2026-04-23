/**
 * Structural validation for DEFAULT_BINDINGS.
 *
 * Catches drift between the declarative list and the subsystem's contract:
 * every spec must have a unique id, a non-empty description, a recognized
 * scope, and a non-empty chord. If any entry fails, CI rejects the change.
 */

import { describe, test, expect } from "bun:test";
import {
  BINDING_SCOPES,
  DEFAULT_BINDINGS,
  DEFAULT_BINDINGS_BY_ID,
} from "../../../../src/cli/keybindings/index.js";

const SCOPES = new Set<string>(BINDING_SCOPES);

describe("DEFAULT_BINDINGS", () => {
  test("is non-empty", () => {
    expect(DEFAULT_BINDINGS.length).toBeGreaterThan(0);
  });

  test("every entry has a unique id", () => {
    const ids = DEFAULT_BINDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every entry has a non-empty description", () => {
    for (const b of DEFAULT_BINDINGS) {
      expect(b.description.length).toBeGreaterThan(0);
    }
  });

  test("every entry has a recognized scope", () => {
    for (const b of DEFAULT_BINDINGS) {
      expect(SCOPES.has(b.scope)).toBe(true);
    }
  });

  test("every entry has a non-empty chord", () => {
    for (const b of DEFAULT_BINDINGS) {
      expect(b.chord.length).toBeGreaterThan(0);
    }
  });

  test("DEFAULT_BINDINGS_BY_ID has an entry for every binding", () => {
    for (const b of DEFAULT_BINDINGS) {
      expect(DEFAULT_BINDINGS_BY_ID.get(b.id)).toBe(b);
    }
    expect(DEFAULT_BINDINGS_BY_ID.size).toBe(DEFAULT_BINDINGS.length);
  });

  test("includes the canonical ids callers depend on", () => {
    const expected = [
      "global.interrupt",
      "input.submit",
      "input.escape",
      "input.history.prev",
      "input.history.next",
      "input.cursor.line-start",
      "input.cursor.line-end",
      "input.edit.delete-word-back",
      "input.autocomplete.accept",
      "wizard.next",
      "wizard.back",
      "help.dismiss",
    ];
    for (const id of expected) {
      expect(DEFAULT_BINDINGS_BY_ID.has(id)).toBe(true);
    }
  });
});
