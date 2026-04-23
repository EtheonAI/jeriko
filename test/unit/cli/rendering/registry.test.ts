/**
 * Tests for the syntax language registry.
 */

import { describe, test, expect, afterEach } from "bun:test";
import {
  DuplicateLanguageError,
  getLanguage,
  listLanguages,
  registerLanguage,
  supportedLanguages,
} from "../../../../src/cli/rendering/index.js";
import type { Language } from "../../../../src/cli/rendering/index.js";

const cleanups: Array<() => void> = [];
function track(fn: () => void): void { cleanups.push(fn); }
afterEach(() => { while (cleanups.length > 0) cleanups.pop()?.(); });

function makeLang(id: string, aliases: string[] = []): Language {
  return {
    id,
    displayName: id,
    aliases,
    rules: [{ pattern: /\btest\b/g, kind: "keyword" }],
  };
}

describe("built-in languages are registered at module load", () => {
  const expected = [
    "javascript", "typescript", "js", "ts", "jsx", "tsx",
    "python", "py", "bash", "sh", "shell", "zsh",
    "json", "sql", "go", "golang",
    "rust", "rs", "ruby", "rb",
    "yaml", "yml", "toml",
    "html", "xml", "css", "scss", "less",
  ];

  for (const key of expected) {
    test(`${key} resolves`, () => {
      expect(getLanguage(key)).toBeDefined();
    });
  }

  test("supportedLanguages contains every expected key", () => {
    const langs = supportedLanguages();
    for (const key of expected) expect(langs).toContain(key);
  });

  test("listLanguages returns one entry per language (no alias duplication)", () => {
    const seen = new Set<string>();
    for (const lang of listLanguages()) {
      expect(seen.has(lang.id)).toBe(false);
      seen.add(lang.id);
    }
    expect(seen.size).toBe(12); // 12 built-in languages
  });
});

describe("case-insensitive lookup", () => {
  test("Uppercase alias resolves", () => {
    expect(getLanguage("JS")).toBeDefined();
    expect(getLanguage("PYTHON")).toBeDefined();
  });
});

describe("registerLanguage", () => {
  test("adds a new language and its aliases", () => {
    const lang = makeLang("regtest-1", ["rt1"]);
    track(registerLanguage(lang));
    expect(getLanguage("regtest-1")).toBe(lang);
    expect(getLanguage("rt1")).toBe(lang);
  });

  test("duplicate id throws DuplicateLanguageError", () => {
    const lang = makeLang("dup-id");
    track(registerLanguage(lang));
    expect(() => registerLanguage(makeLang("dup-id"))).toThrow(DuplicateLanguageError);
  });

  test("duplicate alias throws DuplicateLanguageError", () => {
    const lang = makeLang("dup-alias-a", ["shared-alias"]);
    track(registerLanguage(lang));
    expect(() => registerLanguage(makeLang("dup-alias-b", ["shared-alias"]))).toThrow(DuplicateLanguageError);
  });

  test("built-in id cannot be re-registered", () => {
    expect(() => registerLanguage(makeLang("javascript"))).toThrow(DuplicateLanguageError);
  });

  test("unregister removes the language and its aliases", () => {
    const lang = makeLang("unreg", ["u1", "u2"]);
    const off = registerLanguage(lang);
    off();
    expect(getLanguage("unreg")).toBeUndefined();
    expect(getLanguage("u1")).toBeUndefined();
    expect(getLanguage("u2")).toBeUndefined();
  });
});
