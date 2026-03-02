/**
 * Tests for markdown renderer — block parsing, inline formatting, code blocks.
 */

import { describe, test, expect } from "bun:test";
import { renderMarkdown } from "../../../../src/cli/lib/markdown.js";

// ---------------------------------------------------------------------------
// Helper — strip ANSI escape codes for content testing
// ---------------------------------------------------------------------------

function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

// ---------------------------------------------------------------------------
// Empty / no-op cases
// ---------------------------------------------------------------------------

describe("renderMarkdown — edge cases", () => {
  test("empty string returns empty", () => {
    expect(renderMarkdown("")).toBe("");
  });

  test("plain text passes through", () => {
    const result = stripAnsi(renderMarkdown("Hello world"));
    expect(result).toBe("Hello world");
  });

  test("preserves newlines in plain text", () => {
    const result = stripAnsi(renderMarkdown("line 1\nline 2\nline 3"));
    expect(result).toContain("line 1");
    expect(result).toContain("line 2");
    expect(result).toContain("line 3");
  });
});

// ---------------------------------------------------------------------------
// Bold
// ---------------------------------------------------------------------------

describe("renderMarkdown — bold", () => {
  test("renders **bold** text", () => {
    const result = renderMarkdown("Hello **world**");
    // The text should contain "world" and ANSI bold sequences
    expect(stripAnsi(result)).toContain("world");
    // Check that bold ANSI codes are present (\e[1m...\e[22m)
    expect(result).toContain("\u001b[1m");
  });

  test("bold in the middle of text", () => {
    const result = stripAnsi(renderMarkdown("This is **very** important"));
    expect(result).toContain("very");
    expect(result).toContain("This is");
    expect(result).toContain("important");
  });

  test("multiple bold spans", () => {
    const result = renderMarkdown("**a** and **b**");
    const plain = stripAnsi(result);
    expect(plain).toContain("a");
    expect(plain).toContain("b");
  });
});

// ---------------------------------------------------------------------------
// Italic
// ---------------------------------------------------------------------------

describe("renderMarkdown — italic", () => {
  test("renders _italic_ text", () => {
    const result = renderMarkdown("Hello _world_");
    expect(stripAnsi(result)).toContain("world");
    // Check for italic ANSI codes (\e[3m...\e[23m)
    expect(result).toContain("\u001b[3m");
  });
});

// ---------------------------------------------------------------------------
// Inline code
// ---------------------------------------------------------------------------

describe("renderMarkdown — inline code", () => {
  test("renders `code` with color", () => {
    const result = renderMarkdown("Use `npm install`");
    const plain = stripAnsi(result);
    expect(plain).toContain("npm install");
  });

  test("preserves content inside backticks", () => {
    const result = stripAnsi(renderMarkdown("Run `echo 'hello'` first"));
    expect(result).toContain("echo 'hello'");
  });
});

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

describe("renderMarkdown — links", () => {
  test("renders [text](url) format", () => {
    const result = stripAnsi(renderMarkdown("See [docs](https://example.com)"));
    expect(result).toContain("docs");
    expect(result).toContain("https://example.com");
  });
});

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

describe("renderMarkdown — headers", () => {
  test("renders # header as bold", () => {
    const result = renderMarkdown("# Introduction");
    expect(stripAnsi(result)).toContain("Introduction");
    expect(result).toContain("\u001b[1m");
  });

  test("renders ## subheader", () => {
    const result = renderMarkdown("## Details");
    expect(stripAnsi(result)).toContain("Details");
    expect(result).toContain("\u001b[1m");
  });

  test("renders ### sub-subheader", () => {
    const result = renderMarkdown("### Minor");
    expect(stripAnsi(result)).toContain("Minor");
  });
});

// ---------------------------------------------------------------------------
// Blockquotes
// ---------------------------------------------------------------------------

describe("renderMarkdown — blockquotes", () => {
  test("renders > quote with border", () => {
    const result = stripAnsi(renderMarkdown("> This is a quote"));
    expect(result).toContain("│");
    expect(result).toContain("This is a quote");
  });
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

describe("renderMarkdown — lists", () => {
  test("renders - item with bullet", () => {
    const result = stripAnsi(renderMarkdown("- First item"));
    expect(result).toContain("•");
    expect(result).toContain("First item");
  });

  test("renders * item with bullet", () => {
    const result = stripAnsi(renderMarkdown("* Second item"));
    expect(result).toContain("•");
    expect(result).toContain("Second item");
  });

  test("renders ordered list", () => {
    const result = stripAnsi(renderMarkdown("1. First\n2. Second"));
    expect(result).toContain("1.");
    expect(result).toContain("First");
    expect(result).toContain("2.");
    expect(result).toContain("Second");
  });

  test("inline formatting in list items", () => {
    const result = stripAnsi(renderMarkdown("- **bold** item"));
    expect(result).toContain("bold");
    expect(result).toContain("item");
  });
});

// ---------------------------------------------------------------------------
// Code blocks
// ---------------------------------------------------------------------------

describe("renderMarkdown — code blocks", () => {
  test("renders fenced code block with border", () => {
    const input = "```js\nconst x = 1;\n```";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("│");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("js");
  });

  test("renders code block without language", () => {
    const input = "```\nhello world\n```";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("│");
    expect(result).toContain("hello world");
  });

  test("handles unclosed code block", () => {
    const input = "```python\ndef foo():\n  pass";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("def foo()");
  });

  test("multiple code blocks", () => {
    const input = "```js\na\n```\ntext\n```py\nb\n```";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("a");
    expect(result).toContain("text");
    expect(result).toContain("b");
  });

  test("text before and after code block", () => {
    const input = "Before\n```\ncode\n```\nAfter";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("Before");
    expect(result).toContain("code");
    expect(result).toContain("After");
  });
});

// ---------------------------------------------------------------------------
// Mixed content
// ---------------------------------------------------------------------------

describe("renderMarkdown — mixed content", () => {
  test("complete markdown document", () => {
    const input = [
      "# Title",
      "",
      "Some **bold** and _italic_ text.",
      "",
      "> A wise quote",
      "",
      "- Item one",
      "- Item two",
      "",
      "```js",
      "const x = 42;",
      "```",
      "",
      "See [link](https://example.com).",
    ].join("\n");

    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("Title");
    expect(result).toContain("bold");
    expect(result).toContain("italic");
    expect(result).toContain("A wise quote");
    expect(result).toContain("Item one");
    expect(result).toContain("const x = 42;");
    expect(result).toContain("link");
    expect(result).toContain("https://example.com");
  });
});
