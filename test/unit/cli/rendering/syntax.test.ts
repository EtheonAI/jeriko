/**
 * Tests for syntax highlighter — per-language token rules.
 */

import { describe, test, expect } from "bun:test";
import { highlightCode, supportedLanguages } from "../../../../src/cli/rendering/index.js";

// ---------------------------------------------------------------------------
// Helper — strip ANSI for content testing
// ---------------------------------------------------------------------------

function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

/**
 * Check that the output contains ANSI color codes (i.e., highlighting happened).
 */
function hasAnsi(str: string): boolean {
  return /\u001b\[[0-9;]*m/.test(str);
}

// ---------------------------------------------------------------------------
// supportedLanguages
// ---------------------------------------------------------------------------

describe("supportedLanguages", () => {
  test("includes js and typescript", () => {
    const langs = supportedLanguages();
    expect(langs).toContain("js");
    expect(langs).toContain("typescript");
    expect(langs).toContain("ts");
  });

  test("includes python", () => {
    const langs = supportedLanguages();
    expect(langs).toContain("py");
    expect(langs).toContain("python");
  });

  test("includes bash", () => {
    const langs = supportedLanguages();
    expect(langs).toContain("bash");
    expect(langs).toContain("sh");
    expect(langs).toContain("shell");
  });

  test("includes json, sql, go", () => {
    const langs = supportedLanguages();
    expect(langs).toContain("json");
    expect(langs).toContain("sql");
    expect(langs).toContain("go");
  });
});

// ---------------------------------------------------------------------------
// Unknown language fallback
// ---------------------------------------------------------------------------

describe("highlightCode — unknown language", () => {
  test("returns content with base color", () => {
    const result = highlightCode("hello world", "brainfuck");
    expect(stripAnsi(result)).toBe("hello world");
    expect(hasAnsi(result)).toBe(true);
  });

  test("empty code returns empty", () => {
    const result = highlightCode("", "js");
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// JavaScript / TypeScript
// ---------------------------------------------------------------------------

describe("highlightCode — JavaScript", () => {
  test("highlights keywords", () => {
    const result = highlightCode("const x = 1;", "js");
    expect(stripAnsi(result)).toBe("const x = 1;");
    expect(hasAnsi(result)).toBe(true);
  });

  test("highlights strings", () => {
    const result = highlightCode('const s = "hello";', "ts");
    expect(stripAnsi(result)).toBe('const s = "hello";');
  });

  test("highlights comments", () => {
    const result = highlightCode("// this is a comment", "js");
    expect(stripAnsi(result)).toBe("// this is a comment");
  });

  test("highlights numbers", () => {
    const result = highlightCode("const x = 42.5;", "js");
    expect(stripAnsi(result)).toBe("const x = 42.5;");
  });

  test("highlights arrow functions", () => {
    const result = highlightCode("const f = (x) => x + 1;", "ts");
    expect(stripAnsi(result)).toBe("const f = (x) => x + 1;");
  });

  test("highlights TypeScript types", () => {
    const result = highlightCode("interface Foo { bar: string }", "ts");
    expect(stripAnsi(result)).toBe("interface Foo { bar: string }");
    expect(hasAnsi(result)).toBe(true);
  });

  test("multi-line code", () => {
    const code = "function add(a, b) {\n  return a + b;\n}";
    const result = highlightCode(code, "js");
    expect(stripAnsi(result)).toBe(code);
  });
});

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

describe("highlightCode — Python", () => {
  test("highlights keywords", () => {
    const result = highlightCode("def foo():", "python");
    expect(stripAnsi(result)).toBe("def foo():");
    expect(hasAnsi(result)).toBe(true);
  });

  test("highlights strings", () => {
    const result = highlightCode('x = "hello"', "py");
    expect(stripAnsi(result)).toBe('x = "hello"');
  });

  test("highlights comments", () => {
    const result = highlightCode("# comment", "py");
    expect(stripAnsi(result)).toBe("# comment");
  });

  test("highlights decorators", () => {
    const result = highlightCode("@property", "py");
    expect(stripAnsi(result)).toBe("@property");
    expect(hasAnsi(result)).toBe(true);
  });

  test("highlights built-in types", () => {
    const result = highlightCode("x: int = 42", "py");
    expect(stripAnsi(result)).toBe("x: int = 42");
  });
});

// ---------------------------------------------------------------------------
// Bash
// ---------------------------------------------------------------------------

describe("highlightCode — Bash", () => {
  test("highlights variables", () => {
    const result = highlightCode('echo $HOME', "bash");
    expect(stripAnsi(result)).toBe("echo $HOME");
    expect(hasAnsi(result)).toBe(true);
  });

  test("highlights keywords", () => {
    const result = highlightCode("if [ -f file ]; then", "sh");
    expect(stripAnsi(result)).toBe("if [ -f file ]; then");
  });

  test("highlights common commands", () => {
    const result = highlightCode("git commit -m 'fix'", "bash");
    expect(stripAnsi(result)).toBe("git commit -m 'fix'");
  });

  test("highlights ${} expansion", () => {
    const result = highlightCode('echo ${HOME}', "bash");
    expect(stripAnsi(result)).toBe("echo ${HOME}");
  });
});

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

describe("highlightCode — JSON", () => {
  test("highlights keys and values", () => {
    const code = '{"name": "test", "count": 42}';
    const result = highlightCode(code, "json");
    expect(stripAnsi(result)).toBe(code);
    expect(hasAnsi(result)).toBe(true);
  });

  test("highlights booleans and null", () => {
    const code = '{"ok": true, "error": null}';
    const result = highlightCode(code, "json");
    expect(stripAnsi(result)).toBe(code);
  });

  test("multi-line JSON", () => {
    const code = '{\n  "a": 1,\n  "b": false\n}';
    const result = highlightCode(code, "json");
    expect(stripAnsi(result)).toBe(code);
  });
});

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

describe("highlightCode — SQL", () => {
  test("highlights keywords", () => {
    const code = "SELECT * FROM users WHERE id = 1";
    const result = highlightCode(code, "sql");
    expect(stripAnsi(result)).toBe(code);
    expect(hasAnsi(result)).toBe(true);
  });

  test("highlights comments", () => {
    const code = "-- fetch users\nSELECT * FROM users";
    const result = highlightCode(code, "sql");
    expect(stripAnsi(result)).toBe(code);
  });

  test("case-insensitive keyword matching", () => {
    const code = "select name from users";
    const result = highlightCode(code, "sql");
    expect(stripAnsi(result)).toBe(code);
    expect(hasAnsi(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

describe("highlightCode — Go", () => {
  test("highlights keywords", () => {
    const code = "func main() {\n\tfmt.Println(\"hello\")\n}";
    const result = highlightCode(code, "go");
    expect(stripAnsi(result)).toBe(code);
    expect(hasAnsi(result)).toBe(true);
  });

  test("highlights types", () => {
    const code = "var x int = 42";
    const result = highlightCode(code, "go");
    expect(stripAnsi(result)).toBe(code);
  });

  test("highlights raw strings", () => {
    const code = 'var s = `raw string`';
    const result = highlightCode(code, "go");
    expect(stripAnsi(result)).toBe(code);
  });
});

// ---------------------------------------------------------------------------
// Content preservation
// ---------------------------------------------------------------------------

describe("highlightCode — content preservation", () => {
  test("stripped ANSI output equals original code", () => {
    const codes = [
      { lang: "js", code: "const x = await fetch('url');" },
      { lang: "py", code: "for i in range(10):\n    print(i)" },
      { lang: "bash", code: "curl -s https://api.example.com | jq ." },
      { lang: "json", code: '{"nested": {"a": [1, 2, 3]}}' },
      { lang: "sql", code: "INSERT INTO users (name) VALUES ('alice')" },
      { lang: "go", code: "package main\n\nimport \"fmt\"" },
    ];

    for (const { lang, code } of codes) {
      const result = highlightCode(code, lang);
      expect(stripAnsi(result)).toBe(code);
    }
  });
});
