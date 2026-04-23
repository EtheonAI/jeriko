/**
 * Syntax Subsystem — type contracts.
 *
 * Every language declaration uses these types. Each language is a small
 * record mapping an id + aliases to an ordered list of regex → token-kind
 * rules. The registry consumes them, a renderer maps token kinds to
 * theme colors at call time.
 *
 * Keeping the shape declarative (data, not functions) means every language
 * is testable in isolation, shippable as a one-file addition, and cannot
 * leak logic into the tokenizer core.
 */

// ---------------------------------------------------------------------------
// TokenKind — closed enum of the categories the renderer knows how to color
// ---------------------------------------------------------------------------

/**
 * Canonical syntax-token categories. Adding a new kind is a coordinated
 * edit to both this union and the theme-color mapping in render.ts, so the
 * compiler catches any missed pairing.
 */
export const TOKEN_KINDS = [
  "keyword",
  "string",
  "number",
  "comment",
  "type",
  "function",
  "operator",
  "property",
  "builtin",
  "variable",
] as const;

export type TokenKind = (typeof TOKEN_KINDS)[number];

// ---------------------------------------------------------------------------
// LanguageRule — regex + kind
// ---------------------------------------------------------------------------

/**
 * One regex → one TokenKind. Rules are applied in declared order; the
 * first rule whose match does not overlap an earlier match wins for that
 * span of characters.
 */
export interface LanguageRule {
  readonly pattern: RegExp;
  readonly kind: TokenKind;
}

// ---------------------------------------------------------------------------
// Language — identity + rules
// ---------------------------------------------------------------------------

export interface Language {
  /** Canonical id (e.g. `"javascript"`). */
  readonly id: string;
  /** Display label for pickers and tooling. */
  readonly displayName: string;
  /**
   * Lower-case aliases recognized by the registry (`"js"`, `"jsx"`, `"ts"`).
   * The id itself is always resolvable without being listed here.
   */
  readonly aliases: readonly string[];
  /** Ordered rules; earlier rules win in overlap resolution. */
  readonly rules: readonly LanguageRule[];
}

// ---------------------------------------------------------------------------
// Tokenizer output (internal)
// ---------------------------------------------------------------------------

/**
 * A non-overlapping span of matched text. The renderer consumes these to
 * build the final ANSI-colored output. Internal type — exported for tests.
 */
export interface MatchedSpan {
  readonly start: number;
  readonly end: number;
  readonly kind: TokenKind;
}
