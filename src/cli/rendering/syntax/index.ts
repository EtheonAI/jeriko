/**
 * Syntax subsystem — barrel.
 */

export type {
  Language,
  LanguageRule,
  MatchedSpan,
  TokenKind,
} from "./types.js";
export { TOKEN_KINDS } from "./types.js";

export {
  DuplicateLanguageError,
  getLanguage,
  listLanguages,
  registerLanguage,
  supportedLanguages,
} from "./registry.js";

export { extractSpans, highlightCode } from "./render.js";
