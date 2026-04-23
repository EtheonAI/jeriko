/**
 * Language preset — Ruby.
 */

import type { Language } from "../types.js";

export const ruby: Language = {
  id: "ruby",
  displayName: "Ruby",
  aliases: ["rb"],
  rules: [
    { pattern: /#.*$/gm,                          kind: "comment" },
    { pattern: /"(?:[^"\\]|\\.)*"/g,              kind: "string"  },
    { pattern: /'(?:[^'\\]|\\.)*'/g,              kind: "string"  },

    // Symbols (:name).
    { pattern: /:[a-z_][a-z0-9_]*/g,              kind: "builtin" },

    // Instance, class, and global variables.
    { pattern: /@@?\w+/g,                         kind: "variable" },
    { pattern: /\$\w+/g,                          kind: "variable" },

    // Numbers (with optional underscores: 1_000_000).
    { pattern: /\b\d+(_\d+)*(\.\d+)?\b/g,         kind: "number"  },

    // Keywords.
    {
      pattern: /\b(def|end|class|module|if|elsif|else|unless|case|when|while|until|for|in|do|begin|rescue|ensure|raise|return|yield|break|next|redo|retry|require|require_relative|include|extend|attr_accessor|attr_reader|attr_writer|lambda|proc|self|nil|true|false|and|or|not)\b/g,
      kind: "keyword",
    },

    // Constants (uppercase identifiers).
    { pattern: /\b[A-Z][A-Za-z0-9_]*\b/g,         kind: "type"    },
  ],
};
