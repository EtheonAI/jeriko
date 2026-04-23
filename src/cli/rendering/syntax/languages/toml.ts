/**
 * Language preset — TOML.
 */

import type { Language } from "../types.js";

export const toml: Language = {
  id: "toml",
  displayName: "TOML",
  aliases: [],
  rules: [
    { pattern: /#.*$/gm,                           kind: "comment" },

    // Section headers: [section] or [[array-of-tables]].
    { pattern: /^\[\[[^\]]+\]\]$/gm,               kind: "type"    },
    { pattern: /^\[[^\]]+\]$/gm,                   kind: "type"    },

    // Keys at line start: key =
    { pattern: /^[ \t]*[A-Za-z_][\w.-]*(?=\s*=)/gm, kind: "property" },

    // Multi-line and single-line strings.
    { pattern: /"""[\s\S]*?"""/g,                  kind: "string"  },
    { pattern: /'''[\s\S]*?'''/g,                  kind: "string"  },
    { pattern: /"(?:[^"\\]|\\.)*"/g,               kind: "string"  },
    { pattern: /'[^']*'/g,                          kind: "string"  },

    // Numbers, dates (treated as numbers for coloring), booleans.
    { pattern: /\b\d{4}-\d{2}-\d{2}(T[\d:.+\-Z]+)?\b/g, kind: "number" },
    { pattern: /\b\d+(_\d+)*(\.\d+)?\b/g,          kind: "number"  },
    { pattern: /\b(true|false)\b/g,                 kind: "keyword" },
  ],
};
