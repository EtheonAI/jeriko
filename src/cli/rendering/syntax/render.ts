/**
 * Syntax renderer — tokenize code against a Language's rules and emit
 * ANSI-colored text via chalk.
 *
 * The tokenizer is intentionally simple: each rule is scanned with its
 * global regex; non-overlapping spans are retained in declaration order.
 * Unmatched gaps render with the base-code color (theme `tool`).
 *
 * Colors for each TokenKind come from the active theme's `PALETTE`, read
 * at call time. That makes the renderer theme-reactive for free — the
 * markdown cache that wraps this function keys by theme id, so stale
 * colors never cache.
 */

import chalk from "chalk";
import { PALETTE } from "../../theme.js";
import type { Language, MatchedSpan, TokenKind } from "./types.js";
import { getLanguage } from "./registry.js";

// ---------------------------------------------------------------------------
// TokenKind → palette slot
// ---------------------------------------------------------------------------

/**
 * Maps every TokenKind to a PALETTE slot. Exhaustive switch — adding a
 * new kind to TOKEN_KINDS is a compile-time error here until wired up.
 */
function colorFor(kind: TokenKind): string {
  switch (kind) {
    case "keyword":  return PALETTE.purple;
    case "string":   return PALETTE.success;
    case "number":   return PALETTE.warning;
    case "comment":  return PALETTE.dim;
    case "type":     return PALETTE.info;
    case "function": return PALETTE.tool;
    case "operator": return PALETTE.error;
    case "property": return PALETTE.text;
    case "builtin":  return PALETTE.info;
    case "variable": return PALETTE.text;
  }
}

/** Base color for unmatched spans and unknown languages. */
function defaultColor(): string {
  return PALETTE.tool;
}

// ---------------------------------------------------------------------------
// Span extraction
// ---------------------------------------------------------------------------

/**
 * Scan every rule; retain matches that don't overlap anything already
 * added. Returns spans sorted by start offset.
 */
export function extractSpans(code: string, language: Language): MatchedSpan[] {
  const spans: MatchedSpan[] = [];

  for (const rule of language.rules) {
    // Fresh regex so we control lastIndex across this scan only.
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(code)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (!overlapsAny(spans, start, end)) {
        spans.push({ start, end, kind: rule.kind });
      }
      // Guard against zero-width matches looping forever.
      if (match[0].length === 0) regex.lastIndex++;
    }
  }

  spans.sort((a, b) => a.start - b.start);
  return spans;
}

function overlapsAny(spans: readonly MatchedSpan[], start: number, end: number): boolean {
  for (const span of spans) {
    if (start < span.end && end > span.start) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Highlight a code string in a given language. Unknown languages fall back
 * to a uniform base-color render. Always returns a chalk-coloured string,
 * never throws.
 */
export function highlightCode(code: string, languageId: string | undefined): string {
  if (!languageId) return chalk.hex(defaultColor())(code);
  const language = getLanguage(languageId);
  if (language === undefined) return chalk.hex(defaultColor())(code);

  const spans = extractSpans(code, language);
  if (spans.length === 0) return chalk.hex(defaultColor())(code);

  const base = chalk.hex(defaultColor());
  let out = "";
  let cursor = 0;

  for (const span of spans) {
    if (cursor < span.start) out += base(code.slice(cursor, span.start));
    out += chalk.hex(colorFor(span.kind))(code.slice(span.start, span.end));
    cursor = span.end;
  }

  if (cursor < code.length) out += base(code.slice(cursor));
  return out;
}
