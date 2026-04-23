/**
 * Language preset — JavaScript + TypeScript.
 *
 * One preset covers JS and TS; aliases (ts/tsx/jsx/typescript/javascript)
 * are registered against the same rule set. Keyword list intentionally
 * combines ES and TS-only tokens — the extra noise on vanilla JS doesn't
 * false-highlight because the additional identifiers don't commonly occur
 * outside type positions.
 */

import type { Language } from "../types.js";

export const javascript: Language = {
  id: "javascript",
  displayName: "JavaScript / TypeScript",
  aliases: ["js", "ts", "jsx", "tsx", "typescript"],
  rules: [
    // Comments first so //-starting strings don't win.
    { pattern: /\/\/.*$/gm,              kind: "comment" },
    { pattern: /\/\*[\s\S]*?\*\//gm,     kind: "comment" },

    // Strings (including template literals).
    { pattern: /"(?:[^"\\]|\\.)*"/g,     kind: "string"  },
    { pattern: /'(?:[^'\\]|\\.)*'/g,     kind: "string"  },
    { pattern: /`(?:[^`\\]|\\.)*`/g,     kind: "string"  },

    // Numbers.
    { pattern: /\b\d+(\.\d+)?\b/g,       kind: "number"  },

    // Keywords.
    {
      pattern: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|delete|typeof|instanceof|in|of|class|extends|import|export|from|default|async|await|yield|this|super|static|get|set|true|false|null|undefined|void)\b/g,
      kind: "keyword",
    },

    // TypeScript type keywords.
    {
      pattern: /\b(string|number|boolean|any|void|never|unknown|object|interface|type|enum|namespace|declare|as|is|keyof|readonly|infer)\b/g,
      kind: "type",
    },

    // Arrow fat arrow.
    { pattern: /=>/g,                     kind: "operator" },
  ],
};
