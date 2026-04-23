/**
 * Markdown renderer — pure function `renderMarkdown(text) -> ANSI string`.
 *
 * Supports:
 *   **bold**             → chalk.bold
 *   _italic_             → chalk.italic
 *   ***bold+italic***    → chalk.bold.italic
 *   **_bold+italic_**    → chalk.bold.italic
 *   ~~strikethrough~~    → chalk.strikethrough
 *   `inline code`        → colored via theme
 *   ```lang\n…\n```      → syntax-highlighted with left border
 *   [text](url)          → underlined text + dim url
 *   # Header             → chalk.bold
 *   > blockquote         → left border + muted
 *   - list / 1. list     → bullet or number indent
 *   - [ ] / [x]          → task-list checkbox
 *   --- / ***            → horizontal rule
 *
 * Theming: colors are read from `PALETTE` at call time. The LRU cache
 * keys on `(themeId, fnv1a(text))`, so `setTheme()` implicitly invalidates
 * any stale entries — the next render under the new theme misses and
 * recolors from scratch.
 */

import chalk from "chalk";
import { PALETTE } from "../../theme.js";
import { getActiveTheme } from "../../theme.js";
import { highlightCode } from "../syntax/render.js";
import type { MarkdownBlock, TableAlignment } from "./types.js";
import { makeCacheKey, sharedMarkdownCache } from "./cache.js";

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Render markdown text to a chalk-styled string. Theme-keyed caching means
 * repeat renders of the same text under the same theme are O(1).
 */
export function renderMarkdown(text: string): string {
  if (text.length === 0) return "";

  const themeId = getActiveTheme();
  const key = makeCacheKey(themeId, text);
  const cached = sharedMarkdownCache.get(key);
  if (cached !== undefined) return cached;

  const blocks = parseBlocks(text);
  const rendered = blocks.map(renderBlock).join("\n");

  sharedMarkdownCache.set(key, rendered);
  return rendered;
}

// ---------------------------------------------------------------------------
// Block-level parsing
// ---------------------------------------------------------------------------

function parseBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.split("\n");
  let currentTextLines: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];

  const flushText = (): void => {
    if (currentTextLines.length === 0) return;
    const tableResult = extractTable(currentTextLines);
    if (tableResult !== null) {
      if (tableResult.before.length > 0) {
        blocks.push({ type: "text", lines: tableResult.before });
      }
      blocks.push(tableResult.table);
    } else {
      blocks.push({ type: "text", lines: currentTextLines });
    }
    currentTextLines = [];
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

  if (inCodeBlock) {
    // Unclosed fence — flush the code we've accumulated.
    blocks.push({ type: "code", language: codeLang, content: codeLines.join("\n") });
  }
  flushText();

  return blocks;
}

// ---------------------------------------------------------------------------
// Table extraction
// ---------------------------------------------------------------------------

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|?$/.test(line.trim());
}

function parseAlignments(sep: string): TableAlignment[] {
  return parseTableRow(sep).map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
    if (trimmed.endsWith(":")) return "right";
    return "left";
  });
}

interface TableExtraction {
  readonly before: string[];
  readonly table: Extract<MarkdownBlock, { type: "table" }>;
}

function extractTable(lines: readonly string[]): TableExtraction | null {
  for (let sepIdx = 1; sepIdx < lines.length; sepIdx++) {
    if (!isTableSeparator(lines[sepIdx]!)) continue;
    const headerLine = lines[sepIdx - 1]!;
    if (!headerLine.includes("|")) continue;

    let endIdx = sepIdx + 1;
    while (endIdx < lines.length && lines[endIdx]!.includes("|")) endIdx++;
    if (endIdx <= sepIdx + 1 && endIdx < lines.length) continue;

    const header = parseTableRow(headerLine);
    const alignments = parseAlignments(lines[sepIdx]!);
    const rows: string[][] = [header];
    for (let i = sepIdx + 1; i < endIdx; i++) rows.push(parseTableRow(lines[i]!));

    return {
      before: lines.slice(0, sepIdx - 1),
      table: { type: "table", rows, alignments },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function renderBlock(block: MarkdownBlock): string {
  if (block.type === "code") return renderCodeBlock(block.language, block.content);
  if (block.type === "table") return renderTable(block.rows, block.alignments);
  return block.lines.map(renderInlineLine).join("\n");
}

function renderCodeBlock(language: string, content: string): string {
  const border = chalk.hex(PALETTE.dim);
  const langTag = language !== "" ? chalk.hex(PALETTE.dim)(` ${language}`) : "";
  const highlighted = language !== "" ? highlightCode(content, language) : chalk.hex(PALETTE.tool)(content);

  const codeLines = highlighted.split("\n");
  const bordered = codeLines.map((line) => `${border("│")} ${line}`);

  return [border("╭─") + langTag, ...bordered, border("╰─")].join("\n");
}

function renderTable(
  rows: readonly (readonly string[])[],
  alignments: readonly TableAlignment[],
): string {
  if (rows.length === 0) return "";
  const colCount = Math.max(...rows.map((r) => r.length));
  const colWidths: number[] = Array<number>(colCount).fill(0);
  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      colWidths[c] = Math.max(colWidths[c]!, (row[c] ?? "").length);
    }
  }

  const border = chalk.hex(PALETTE.dim);

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

  const renderRow = (row: readonly string[], isHeader: boolean): string => {
    const cells = Array.from({ length: colCount }, (_, c) => {
      const text = padCell(row[c] ?? "", c);
      return isHeader ? chalk.bold(text) : text;
    });
    return border(" ") + cells.join(border(" | ")) + border(" ");
  };

  const separator = border(" ") +
    colWidths.map((w) => border("─".repeat(w))).join(border("─+─")) +
    border(" ");

  const out: string[] = [];
  if (rows.length > 0) {
    out.push(renderRow(rows[0]!, true));
    out.push(separator);
  }
  for (let i = 1; i < rows.length; i++) out.push(renderRow(rows[i]!, false));
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

function renderInlineLine(line: string): string {
  // Horizontal rule: ---, ***, ___
  if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
    return chalk.hex(PALETTE.dim)("─".repeat(40));
  }

  // Headers: # ## ###
  const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
  if (headerMatch) return chalk.bold(headerMatch[2]!);

  // Blockquote: > text
  const quoteMatch = line.match(/^>\s?(.*)$/);
  if (quoteMatch) {
    return chalk.hex(PALETTE.dim)("│ ") + chalk.hex(PALETTE.muted)(quoteMatch[1]!);
  }

  // Task list: - [ ] or - [x]
  const taskMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.+)$/);
  if (taskMatch) {
    const indent = taskMatch[1] ?? "";
    const checked = taskMatch[2] !== " ";
    const icon = checked
      ? chalk.hex(PALETTE.success)("☑")
      : chalk.hex(PALETTE.dim)("☐");
    return `${indent}${icon} ${renderInlineSpans(taskMatch[3]!)}`;
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
    const num = olMatch[2]!;
    return `${indent}${chalk.hex(PALETTE.dim)(`${num}.`)} ${renderInlineSpans(olMatch[3]!)}`;
  }

  return renderInlineSpans(line);
}

function renderInlineSpans(text: string): string {
  let result = text;

  // Inline code first so other patterns don't match inside.
  result = result.replace(/`([^`]+)`/g, (_, code: string) =>
    chalk.hex(PALETTE.tool)(code),
  );

  // Bold+italic combos.
  result = result.replace(/\*\*\*([^*]+)\*\*\*/g, (_, c: string) => chalk.bold.italic(c));
  result = result.replace(/\*\*_([^_]+)_\*\*/g, (_, c: string) => chalk.bold.italic(c));
  result = result.replace(/_\*\*([^*]+)\*\*_/g, (_, c: string) => chalk.bold.italic(c));

  // Bold.
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, c: string) => chalk.bold(c));

  // Italic: _text_ (not __text__).
  result = result.replace(/(?<![_\\])_([^_]+)_(?!_)/g, (_, c: string) => chalk.italic(c));

  // Strikethrough.
  result = result.replace(/~~([^~]+)~~/g, (_, c: string) => chalk.strikethrough(c));

  // Links.
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText: string, url: string) =>
    chalk.underline(linkText) + chalk.hex(PALETTE.dim)(` (${url})`),
  );

  return result;
}
