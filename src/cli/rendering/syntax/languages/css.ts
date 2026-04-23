/**
 * Language preset — CSS.
 */

import type { Language } from "../types.js";

export const css: Language = {
  id: "css",
  displayName: "CSS",
  aliases: ["scss", "less"],
  rules: [
    { pattern: /\/\*[\s\S]*?\*\//g,                kind: "comment"  },

    // At-rules: @media, @import, @keyframes.
    { pattern: /@[\w-]+/g,                         kind: "keyword"  },

    // Property names (e.g. `color:`).
    { pattern: /\b[\w-]+(?=\s*:)/g,                kind: "property" },

    // Strings.
    { pattern: /"(?:[^"\\]|\\.)*"/g,               kind: "string"   },
    { pattern: /'(?:[^'\\]|\\.)*'/g,               kind: "string"   },

    // Numbers + common units.
    { pattern: /-?\d+(\.\d+)?(px|em|rem|vh|vw|%|s|ms|deg|rad|fr)?\b/g, kind: "number" },

    // Hex colors (#abc / #abcdef / #abcdefgh for alpha).
    { pattern: /#[0-9a-fA-F]{3,8}\b/g,             kind: "number"   },

    // CSS variables and custom functions.
    { pattern: /var\([^)]+\)/g,                    kind: "builtin"  },

    // Pseudo-classes and pseudo-elements (::before, :hover).
    { pattern: /::?[\w-]+/g,                       kind: "type"     },

    // !important.
    { pattern: /!important\b/g,                    kind: "operator" },
  ],
};
