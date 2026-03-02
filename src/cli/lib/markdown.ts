/**
 * Markdown renderer — Pure function that converts markdown text to
 * chalk-styled strings for terminal output.
 *
 * Supported patterns:
 *   **bold**        → chalk.bold
 *   _italic_        → chalk.italic
 *   `inline code`   → chalk.hex(PALETTE.blue)
 *   ```lang\n...\n``` → syntax highlighted with border
 *   [text](url)     → text underlined + url dim
 *   # Header        → chalk.bold
 *   - list item     → bullet with indent
 *   > blockquote    → left border + muted
 *
 * No external dependencies — uses chalk + PALETTE from theme.
 */

import chalk from "chalk";
import { PALETTE } from "../theme.js";
import { highlightCode } from "./syntax.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A parsed block from the markdown source. */
type MarkdownBlock =
  | { type: "code"; language: string; content: string }
  | { type: "text"; lines: string[] };

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Render markdown text to a chalk-styled string.
 * Pure function — no side effects.
 */
export function renderMarkdown(text: string): string {
  if (!text) return "";

  const blocks = parseBlocks(text);
  const rendered = blocks.map(renderBlock);
  return rendered.join("\n");
}

// ---------------------------------------------------------------------------
// Block-level parsing
// ---------------------------------------------------------------------------

/**
 * Split raw text into alternating text/code blocks.
 * Code fences are recognized by ``` with an optional language tag.
 */
function parseBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.split("\n");
  let currentTextLines: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];

  for (const line of lines) {
    if (!inCodeBlock) {
      const fenceMatch = line.match(/^```(\w*)$/);
      if (fenceMatch) {
        // Flush accumulated text
        if (currentTextLines.length > 0) {
          blocks.push({ type: "text", lines: currentTextLines });
          currentTextLines = [];
        }
        inCodeBlock = true;
        codeLang = fenceMatch[1] ?? "";
        codeLines = [];
        continue;
      }
      currentTextLines.push(line);
    } else {
      if (line.match(/^```$/)) {
        // Close code block
        blocks.push({ type: "code", language: codeLang, content: codeLines.join("\n") });
        inCodeBlock = false;
        codeLang = "";
        codeLines = [];
        continue;
      }
      codeLines.push(line);
    }
  }

  // Flush remaining
  if (inCodeBlock) {
    // Unclosed code block — treat as code anyway
    blocks.push({ type: "code", language: codeLang, content: codeLines.join("\n") });
  }
  if (currentTextLines.length > 0) {
    blocks.push({ type: "text", lines: currentTextLines });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function renderBlock(block: MarkdownBlock): string {
  if (block.type === "code") {
    return renderCodeBlock(block.language, block.content);
  }
  return block.lines.map(renderInlineLine).join("\n");
}

/**
 * Render a fenced code block with optional syntax highlighting.
 * Draws a left border in dim color.
 */
function renderCodeBlock(language: string, content: string): string {
  const border = chalk.hex(PALETTE.dim);
  const langTag = language
    ? chalk.hex(PALETTE.dim)(` ${language}`)
    : "";

  const highlighted = language
    ? highlightCode(content, language)
    : chalk.hex(PALETTE.blue)(content);

  const codeLines = highlighted.split("\n");
  const bordered = codeLines.map((line) => `${border("│")} ${line}`);

  return [
    border("╭─") + langTag,
    ...bordered,
    border("╰─"),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Inline rendering (line-level patterns)
// ---------------------------------------------------------------------------

/**
 * Render inline markdown patterns within a single line.
 * Applies patterns in order: headers, blockquotes, lists, then inline spans.
 */
function renderInlineLine(line: string): string {
  // Headers: # ## ###
  const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
  if (headerMatch) {
    return chalk.bold(headerMatch[2]);
  }

  // Blockquote: > text
  const quoteMatch = line.match(/^>\s?(.*)$/);
  if (quoteMatch) {
    return chalk.hex(PALETTE.dim)("│ ") + chalk.hex(PALETTE.muted)(quoteMatch[1]);
  }

  // Unordered list: - item or * item
  const listMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
  if (listMatch) {
    const indent = listMatch[1] ?? "";
    return `${indent}${chalk.hex(PALETTE.dim)("•")} ${renderInlineSpans(listMatch[2]!)}`;
  }

  // Ordered list: 1. item
  const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
  if (olMatch) {
    const indent = olMatch[1] ?? "";
    const num = olMatch[2];
    return `${indent}${chalk.hex(PALETTE.dim)(`${num}.`)} ${renderInlineSpans(olMatch[3]!)}`;
  }

  return renderInlineSpans(line);
}

/**
 * Render inline spans within text: bold, italic, code, links.
 * Processes patterns left-to-right via regex replacement.
 */
function renderInlineSpans(text: string): string {
  let result = text;

  // Inline code: `code` (process first to prevent other patterns inside)
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    return chalk.hex(PALETTE.blue)(code);
  });

  // Bold: **text**
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, content) => {
    return chalk.bold(content);
  });

  // Italic: _text_ (but not __text__)
  result = result.replace(/(?<![_\\])_([^_]+)_(?!_)/g, (_, content) => {
    return chalk.italic(content);
  });

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
    return chalk.underline(linkText) + chalk.hex(PALETTE.dim)(` (${url})`);
  });

  return result;
}
