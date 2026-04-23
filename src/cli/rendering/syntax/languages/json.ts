/**
 * Language preset — JSON.
 *
 * Keys (quoted strings followed by a colon) get the `property` kind so they
 * render distinct from string values, matching IDE highlighting conventions.
 */

import type { Language } from "../types.js";

export const json: Language = {
  id: "json",
  displayName: "JSON",
  aliases: [],
  rules: [
    // Keys first so the trailing `:` is captured and they don't match as strings.
    { pattern: /"(?:[^"\\]|\\.)*"\s*:/g,                    kind: "property" },
    { pattern: /"(?:[^"\\]|\\.)*"/g,                         kind: "string"   },
    { pattern: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/g,            kind: "number"   },
    { pattern: /\b(true|false|null)\b/g,                     kind: "keyword"  },
  ],
};
