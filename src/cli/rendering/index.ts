/**
 * Rendering subsystem — public barrel.
 *
 * Syntax highlighting and markdown rendering live here. Consumers import
 * from this module:
 *
 *   import { renderMarkdown, highlightCode, supportedLanguages } from "../rendering/index.js";
 */

// --- Syntax -----------------------------------------------------------------
export type {
  Language,
  LanguageRule,
  MatchedSpan,
  TokenKind,
} from "./syntax/index.js";
export {
  DuplicateLanguageError,
  TOKEN_KINDS,
  extractSpans,
  getLanguage,
  highlightCode,
  listLanguages,
  registerLanguage,
  supportedLanguages,
} from "./syntax/index.js";

// --- Markdown ---------------------------------------------------------------
export type { MarkdownBlock, TableAlignment } from "./markdown/index.js";
export {
  DEFAULT_CAPACITY,
  MarkdownCache,
  fnv1a,
  makeCacheKey,
  renderMarkdown,
  sharedMarkdownCache,
} from "./markdown/index.js";
