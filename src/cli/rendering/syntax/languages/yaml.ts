/**
 * Language preset — YAML.
 */

import type { Language } from "../types.js";

export const yaml: Language = {
  id: "yaml",
  displayName: "YAML",
  aliases: ["yml"],
  rules: [
    { pattern: /#.*$/gm,                           kind: "comment" },

    // Keys (match "key:" at start of line).
    { pattern: /^[ \t]*[A-Za-z_][\w.-]*(?=\s*:)/gm, kind: "property" },

    // Double-quoted and single-quoted strings.
    { pattern: /"(?:[^"\\]|\\.)*"/g,               kind: "string"   },
    { pattern: /'[^']*'/g,                          kind: "string"   },

    // Numbers and booleans.
    { pattern: /\b\d+(\.\d+)?\b/g,                 kind: "number"   },
    { pattern: /\b(true|false|null|yes|no|on|off)\b/gi, kind: "keyword" },

    // Anchors and aliases (&name, *name).
    { pattern: /[&*][A-Za-z_][\w.-]*/g,            kind: "variable" },

    // Document separators.
    { pattern: /^---$/gm,                           kind: "operator" },
    { pattern: /^\.\.\.$/gm,                        kind: "operator" },
  ],
};
