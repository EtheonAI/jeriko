/**
 * Tests for the theme registry.
 *
 * Built-in registration is verified structurally (all BuiltinThemeIds must
 * resolve, ids must be unique). Runtime registration is verified by happy
 * path + duplicate rejection + unregister.
 */

import { describe, test, expect } from "bun:test";
import type { BuiltinThemeId, Theme } from "../../../../src/cli/themes/index.js";
import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME,
  DuplicateThemeError,
  THEMES,
  getTheme,
  listThemeDescriptors,
  listThemes,
  listThemesByKind,
  registerTheme,
  resolveTheme,
} from "../../../../src/cli/themes/index.js";

const BUILTIN_IDS: readonly BuiltinThemeId[] = [
  "jeriko",
  "jeriko-light",
  "nocturne",
  "solarized-dark",
  "high-contrast",
  "ansi-dark",
];

describe("built-in registration", () => {
  test("every BuiltinThemeId resolves to a theme", () => {
    for (const id of BUILTIN_IDS) {
      const theme = getTheme(id);
      expect(theme).toBeDefined();
      expect(theme!.id).toBe(id);
    }
  });

  test("THEMES record has exactly the built-in ids as keys", () => {
    const keys = Object.keys(THEMES).sort();
    expect(keys).toEqual([...BUILTIN_IDS].sort());
  });

  test("listThemes() returns at least all built-ins", () => {
    const list = listThemes();
    for (const id of BUILTIN_IDS) {
      expect(list.some((t) => t.id === id)).toBe(true);
    }
  });

  test("listThemeDescriptors() returns id/displayName/kind only", () => {
    const descriptors = listThemeDescriptors();
    for (const d of descriptors) {
      expect(Object.keys(d).sort()).toEqual(["displayName", "id", "kind"]);
    }
  });

  test("ids are unique across the registry", () => {
    const ids = listThemes().map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("default theme", () => {
  test("DEFAULT_THEME_ID resolves to a registered theme", () => {
    expect(getTheme(DEFAULT_THEME_ID)).toBeDefined();
  });

  test("DEFAULT_THEME back-compat alias equals DEFAULT_THEME_ID", () => {
    expect(DEFAULT_THEME).toBe(DEFAULT_THEME_ID);
  });
});

describe("resolveTheme()", () => {
  test("returns the requested theme when it exists", () => {
    const theme = resolveTheme("nocturne");
    expect(theme.id).toBe("nocturne");
  });

  test("falls back to the default when id is unknown", () => {
    const theme = resolveTheme("does-not-exist");
    expect(theme.id).toBe(DEFAULT_THEME_ID);
  });

  test("falls back to the default when id is undefined", () => {
    const theme = resolveTheme(undefined);
    expect(theme.id).toBe(DEFAULT_THEME_ID);
  });
});

describe("listThemesByKind()", () => {
  test("returns only themes with the requested kind", () => {
    const darks = listThemesByKind("dark");
    expect(darks.length).toBeGreaterThan(0);
    for (const t of darks) expect(t.kind).toBe("dark");

    const lights = listThemesByKind("light");
    for (const t of lights) expect(t.kind).toBe("light");

    const hc = listThemesByKind("high-contrast");
    for (const t of hc) expect(t.kind).toBe("high-contrast");
  });

  test("every built-in theme is reachable via listThemesByKind", () => {
    const all = [
      ...listThemesByKind("dark"),
      ...listThemesByKind("light"),
      ...listThemesByKind("high-contrast"),
    ];
    for (const id of BUILTIN_IDS) {
      expect(all.some((t) => t.id === id)).toBe(true);
    }
  });
});

describe("registerTheme()", () => {
  const custom: Theme = {
    id: "test-registry-custom",
    displayName: "Test Custom",
    kind: "dark",
    colors: {
      brand: "#111111", brandDim: "#222222", text: "#eeeeee",
      muted: "#888888", dim: "#444444", faint: "#333333",
      tool: "#7788ff", success: "#55ff55", error: "#ff5555",
      warning: "#ffaa55", info: "#55aaff", purple: "#aa55ff",
      teal: "#55ffff", orange: "#ff8855", pink: "#ff55aa",
      diffAdd: "#55ff55", diffRm: "#ff5555", diffCtx: "#444444",
    },
  };

  test("registers a theme and returns an unregister handle", () => {
    const unregister = registerTheme(custom);
    try {
      expect(getTheme(custom.id)).toEqual(custom);
      expect(listThemes().some((t) => t.id === custom.id)).toBe(true);
    } finally {
      unregister();
    }
    expect(getTheme(custom.id)).toBeUndefined();
  });

  test("throws DuplicateThemeError for already-registered ids", () => {
    const unregister = registerTheme({ ...custom, id: "dupe-check" });
    try {
      expect(() => registerTheme({ ...custom, id: "dupe-check" })).toThrow(DuplicateThemeError);
    } finally {
      unregister();
    }
  });

  test("registering a built-in id is also a duplicate", () => {
    expect(() => registerTheme({ ...custom, id: "jeriko" })).toThrow(DuplicateThemeError);
  });
});
