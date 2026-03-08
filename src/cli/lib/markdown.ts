/**
 * Markdown renderer — Pure function that converts markdown text to
 * chalk-styled strings for terminal output.
 *
 * Supported patterns:
 *   **bold**              → chalk.bold
 *   _italic_              → chalk.italic
 *   ***bold+italic***     → chalk.bold.italic
 *   **_bold+italic_**     → chalk.bold.italic
 *   ~~strikethrough~~     → chalk.strikethrough
 *   `inline code`         → chalk.hex(PALETTE.blue)
 *   ```lang\n...\n```     → syntax highlighted with border
 *   [text](url)           → text underlined + url dim
 *   # Header              → chalk.bold
 *   - list item           → bullet with indent
 *   > blockquote          → left border + muted
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
  | { type: "table"; rows: string[][]; alignments: Array<"left" | "center" | "right"> }
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
 * Split raw text into alternating text/code/table blocks.
 * Code fences are recognized by ``` with an optional language tag.
 * Tables are recognized by pipe-delimited rows with a separator line.
 */
function parseBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.split("\n");
  let currentTextLines: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];

  /** Flush text lines, extracting any trailing table. */
  const flushText = () => {
    if (currentTextLines.length === 0) return;

    // Check if the trailing lines form a table
    const tableResult = extractTable(currentTextLines);
    if (tableResult) {
      if (tableResult.before.length > 0) {
        blocks.push({ type: "text", lines: tableResult.before });
      }
      blocks.push(tableResult.table);
      currentTextLines = [];
    } else {
      blocks.push({ type: "text", lines: currentTextLines });
      currentTextLines = [];
    }
  };

  for (const line of lines) {
    if (!inCodeBlock) {
      const fenceMatch = line.match(/^```(\w*).*$/);
      if (fenceMatch && line.startsWith("```")) {
        flushText();
        inCodeBlock = true;
        codeLang = fenceMatch[1] ?? "";
        codeLines = [];
        continue;
      }
      currentTextLines.push(line);
    } else {
      if (line.match(/^```$/)) {
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
    blocks.push({ type: "code", language: codeLang, content: codeLines.join("\n") });
  }
  flushText();

  return blocks;
}

/** Parse a pipe-delimited row into cells. */
function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Check if a line is a table separator (e.g., |---|:---:|---:|). */
function isTableSeparator(line: string): boolean {
  return /^\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|?$/.test(line.trim());
}

/** Parse alignment from separator cells. */
function parseAlignments(sep: string): Array<"left" | "center" | "right"> {
  return parseTableRow(sep).map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
    if (trimmed.endsWith(":")) return "right";
    return "left";
  });
}

/**
 * Extract a markdown table from the end of a text lines array.
 * Returns the table block and any preceding text lines, or null if no table.
 */
function extractTable(
  lines: string[],
): { before: string[]; table: MarkdownBlock & { type: "table" } } | null {
  // Need at least 3 lines: header, separator, data row
  // Find the separator line
  for (let sepIdx = 1; sepIdx < lines.length; sepIdx++) {
    if (!isTableSeparator(lines[sepIdx]!)) continue;

    // Header is the line before separator
    const headerLine = lines[sepIdx - 1]!;
    if (!headerLine.includes("|")) continue;

    // Count how many contiguous pipe-rows follow the separator
    let endIdx = sepIdx + 1;
    while (endIdx < lines.length && lines[endIdx]!.includes("|")) {
      endIdx++;
    }

    // Must have at least 1 data row
    if (endIdx <= sepIdx + 1 && endIdx < lines.length) continue;

    const header = parseTableRow(headerLine);
    const alignments = parseAlignments(lines[sepIdx]!);
    const rows: string[][] = [header];

    for (let i = sepIdx + 1; i < endIdx; i++) {
      rows.push(parseTableRow(lines[i]!));
    }

    // Everything before the header is regular text, everything after table is ignored (handled by next block)
    const before = lines.slice(0, sepIdx - 1);

    return {
      before,
      table: { type: "table", rows, alignments },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function renderBlock(block: MarkdownBlock): string {
  if (block.type === "code") {
    return renderCodeBlock(block.language, block.content);
  }
  if (block.type === "table") {
    return renderTable(block.rows, block.alignments);
  }
  return block.lines.map(renderInlineLine).join("\n");
}

/**
 * Render a markdown table with box-drawing borders.
 */
function renderTable(
  rows: string[][],
  alignments: Array<"left" | "center" | "right">,
): string {
  if (rows.length === 0) return "";

  // Compute column widths
  const colCount = Math.max(...rows.map((r) => r.length));
  const colWidths: number[] = Array(colCount).fill(0);
  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      colWidths[c] = Math.max(colWidths[c]!, (row[c] ?? "").length);
    }
  }

  const border = chalk.hex(PALETTE.dim);

  /** Pad a cell to its column width respecting alignment. */
  const padCell = (text: string, colIdx: number): string => {
    const width = colWidths[colIdx] ?? text.length;
    const align = alignments[colIdx] ?? "left";
    if (align === "right") return text.padStart(width);
    if (align === "center") {
      const total = width - text.length;
      const left = Math.floor(total / 2);
      return " ".repeat(left) + text + " ".repeat(total - left);
    }
    return text.padEnd(width);
  };

  const renderRow = (row: string[], isHeader: boolean): string => {
    const cells = Array.from({ length: colCount }, (_, c) => {
      const text = padCell(row[c] ?? "", c);
      return isHeader ? chalk.bold(text) : text;
    });
    return border(" ") + cells.join(border(" | ")) + border(" ");
  };

  const separator = border(" ") +
    colWidths.map((w) => border("\u2500".repeat(w))).join(border("\u2500+\u2500")) +
    border(" ");

  const result: string[] = [];

  // Header
  if (rows.length > 0) {
    result.push(renderRow(rows[0]!, true));
    result.push(separator);
  }

  // Data rows
  for (let i = 1; i < rows.length; i++) {
    result.push(renderRow(rows[i]!, false));
  }

  return result.join("\n");
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
  // Horizontal rule: ---, ***, ___
  if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
    return chalk.hex(PALETTE.dim)("\u2500".repeat(40));
  }

  // Headers: # ## ###
  const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
  if (headerMatch) {
    return chalk.bold(headerMatch[2]);
  }

  // Blockquote: > text
  const quoteMatch = line.match(/^>\s?(.*)$/);
  if (quoteMatch) {
    return chalk.hex(PALETTE.dim)("\u2502 ") + chalk.hex(PALETTE.muted)(quoteMatch[1]);
  }

  // Task list: - [ ] or - [x]
  const taskMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.+)$/);
  if (taskMatch) {
    const indent = taskMatch[1] ?? "";
    const checked = taskMatch[2] !== " ";
    const icon = checked
      ? chalk.hex(PALETTE.success)("\u2611")
      : chalk.hex(PALETTE.dim)("\u2610");
    return `${indent}${icon} ${renderInlineSpans(taskMatch[3]!)}`;
  }

  // Unordered list: - item or * item
  const listMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
  if (listMatch) {
    const indent = listMatch[1] ?? "";
    return `${indent}${chalk.hex(PALETTE.dim)("\u2022")} ${renderInlineSpans(listMatch[2]!)}`;
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

  // Bold+italic: ***text*** or **_text_** or _**text**_
  result = result.replace(/\*\*\*([^*]+)\*\*\*/g, (_, content) => {
    return chalk.bold.italic(content);
  });
  result = result.replace(/\*\*_([^_]+)_\*\*/g, (_, content) => {
    return chalk.bold.italic(content);
  });
  result = result.replace(/_\*\*([^*]+)\*\*_/g, (_, content) => {
    return chalk.bold.italic(content);
  });

  // Bold: **text**
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, content) => {
    return chalk.bold(content);
  });

  // Italic: _text_ (but not __text__)
  result = result.replace(/(?<![_\\])_([^_]+)_(?!_)/g, (_, content) => {
    return chalk.italic(content);
  });

  // Strikethrough: ~~text~~
  result = result.replace(/~~([^~]+)~~/g, (_, content) => {
    return chalk.strikethrough(content);
  });

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
    return chalk.underline(linkText) + chalk.hex(PALETTE.dim)(` (${url})`);
  });

  return result;
}
