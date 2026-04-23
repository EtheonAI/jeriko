/**
 * Language preset — Python.
 */

import type { Language } from "../types.js";

export const python: Language = {
  id: "python",
  displayName: "Python",
  aliases: ["py"],
  rules: [
    // Comments.
    { pattern: /#.*$/gm,                         kind: "comment" },

    // Triple-quoted strings (placed before single-quoted to win overlap).
    { pattern: /"""[\s\S]*?"""/g,                kind: "string"  },
    { pattern: /'''[\s\S]*?'''/g,                kind: "string"  },

    // Single-line strings.
    { pattern: /"(?:[^"\\]|\\.)*"/g,             kind: "string"  },
    { pattern: /'(?:[^'\\]|\\.)*'/g,             kind: "string"  },

    // Numbers.
    { pattern: /\b\d+(\.\d+)?\b/g,               kind: "number"  },

    // Keywords.
    {
      pattern: /\b(def|class|return|if|elif|else|for|while|break|continue|try|except|finally|raise|with|as|import|from|pass|yield|lambda|and|or|not|in|is|True|False|None|global|nonlocal|assert|del|async|await)\b/g,
      kind: "keyword",
    },

    // Built-in types.
    {
      pattern: /\b(int|float|str|bool|list|dict|tuple|set|bytes|type|object)\b/g,
      kind: "type",
    },

    // Decorators (before the rest of identifier parsing so @name colors as builtin).
    { pattern: /@\w+/g,                          kind: "builtin" },
  ],
};
