/**
 * Tests for the 6 new languages added in Subsystem 6.
 *
 * Each language test asserts:
 *   1. stripped ANSI equals the original input (no content lost)
 *   2. the output contains ANSI codes (highlighting actually happened)
 *   3. at least one canonical token for the language lands in a recognized kind
 *
 * These together catch both regressions in the registry (language not
 * found → base-color fallback, no keyword highlight) and regressions in
 * individual rule sets.
 */

import { describe, test, expect } from "bun:test";
import {
  extractSpans,
  getLanguage,
  highlightCode,
} from "../../../../src/cli/rendering/index.js";
import type { TokenKind } from "../../../../src/cli/rendering/index.js";

const ANSI = /\[[0-9;]*m/g;
function stripAnsi(s: string): string { return s.replace(ANSI, ""); }
function hasAnsi(s: string): boolean { return ANSI.test(s); }

/**
 * Assert that the given code produces at least one matched span of the
 * expected kind against the named language. Ensures rule sets didn't
 * silently break from under the highlighter.
 */
function expectKindInCode(code: string, languageId: string, kind: TokenKind): void {
  const lang = getLanguage(languageId);
  expect(lang).toBeDefined();
  const spans = extractSpans(code, lang!);
  expect(spans.some((s) => s.kind === kind)).toBe(true);
}

// ---------------------------------------------------------------------------
// Rust
// ---------------------------------------------------------------------------

describe("Rust", () => {
  const code = "fn main() {\n    let x: i32 = 42;\n    println!(\"hi\");\n}";

  test("preserves content", () => {
    expect(stripAnsi(highlightCode(code, "rust"))).toBe(code);
  });
  test("applies highlighting", () => {
    expect(hasAnsi(highlightCode(code, "rust"))).toBe(true);
  });
  test("has keywords", () => {
    expectKindInCode(code, "rust", "keyword");
  });
  test("has types", () => {
    expectKindInCode(code, "rust", "type");
  });
  test("has strings", () => {
    expectKindInCode(code, "rust", "string");
  });
  test("rs alias resolves", () => {
    expect(hasAnsi(highlightCode("fn x() {}", "rs"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ruby
// ---------------------------------------------------------------------------

describe("Ruby", () => {
  const code = "def greet(name)\n  puts \"Hello, #{name}!\"\nend";

  test("preserves content", () => {
    expect(stripAnsi(highlightCode(code, "ruby"))).toBe(code);
  });
  test("applies highlighting", () => {
    expect(hasAnsi(highlightCode(code, "ruby"))).toBe(true);
  });
  test("has keywords", () => {
    expectKindInCode(code, "ruby", "keyword");
  });
  test("rb alias resolves", () => {
    expect(hasAnsi(highlightCode("class X; end", "rb"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// YAML
// ---------------------------------------------------------------------------

describe("YAML", () => {
  const code = "name: jeriko\nversion: 2.0\nenabled: true";

  test("preserves content", () => {
    expect(stripAnsi(highlightCode(code, "yaml"))).toBe(code);
  });
  test("applies highlighting", () => {
    expect(hasAnsi(highlightCode(code, "yaml"))).toBe(true);
  });
  test("has property keys", () => {
    expectKindInCode(code, "yaml", "property");
  });
  test("yml alias resolves", () => {
    expect(hasAnsi(highlightCode("a: 1", "yml"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TOML
// ---------------------------------------------------------------------------

describe("TOML", () => {
  const code = "[package]\nname = \"jeriko\"\nversion = \"2.0.0\"";

  test("preserves content", () => {
    expect(stripAnsi(highlightCode(code, "toml"))).toBe(code);
  });
  test("applies highlighting", () => {
    expect(hasAnsi(highlightCode(code, "toml"))).toBe(true);
  });
  test("has section header type", () => {
    expectKindInCode(code, "toml", "type");
  });
});

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

describe("HTML", () => {
  const code = '<div class="container">\n  <p>Hello</p>\n</div>';

  test("preserves content", () => {
    expect(stripAnsi(highlightCode(code, "html"))).toBe(code);
  });
  test("applies highlighting", () => {
    expect(hasAnsi(highlightCode(code, "html"))).toBe(true);
  });
  test("has tag types", () => {
    expectKindInCode(code, "html", "type");
  });
  test("xml alias resolves", () => {
    expect(hasAnsi(highlightCode("<root><item/></root>", "xml"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

describe("CSS", () => {
  const code = ".card {\n  color: #333;\n  padding: 8px;\n}";

  test("preserves content", () => {
    expect(stripAnsi(highlightCode(code, "css"))).toBe(code);
  });
  test("applies highlighting", () => {
    expect(hasAnsi(highlightCode(code, "css"))).toBe(true);
  });
  test("has property names", () => {
    expectKindInCode(code, "css", "property");
  });
  test("has number + hex values", () => {
    expectKindInCode(code, "css", "number");
  });
  test("scss alias resolves", () => {
    expect(hasAnsi(highlightCode(".a { color: red; }", "scss"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Theme reactivity — cache key includes theme id
// ---------------------------------------------------------------------------

describe("highlightCode honors theme via live PALETTE read", () => {
  test("ANSI output contains the active theme's hex codes", async () => {
    const { setActiveTheme, getActiveTheme } = await import("../../../../src/cli/theme.js");
    const { resolveTheme } = await import("../../../../src/cli/themes/index.js");
    const originalTheme = getActiveTheme();
    try {
      setActiveTheme(resolveTheme("jeriko"));
      const darkFrame = highlightCode("const x = 1;", "js");
      setActiveTheme(resolveTheme("nocturne"));
      const nocturneFrame = highlightCode("const x = 1;", "js");
      expect(darkFrame).not.toBe(nocturneFrame);
    } finally {
      setActiveTheme(resolveTheme(originalTheme));
    }
  });
});
