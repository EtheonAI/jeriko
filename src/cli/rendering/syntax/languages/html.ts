/**
 * Language preset — HTML / XML.
 *
 * Distinguishes tags (type), attribute names (property), attribute values
 * (string), and comments. The rules are deliberately simple — embedded
 * script / style languages are not highlighted; a future enhancement can
 * detect fenced sections and dispatch to the right language.
 */

import type { Language } from "../types.js";

export const html: Language = {
  id: "html",
  displayName: "HTML",
  aliases: ["xml"],
  rules: [
    { pattern: /<!--[\s\S]*?-->/g,                kind: "comment"  },
    { pattern: /<!DOCTYPE[^>]*>/gi,               kind: "keyword"  },

    // Attribute values (either quoting style).
    { pattern: /"(?:[^"\\]|\\.)*"/g,              kind: "string"   },
    { pattern: /'(?:[^'\\]|\\.)*'/g,              kind: "string"   },

    // Tag names: <tag ...>  or  </tag>
    { pattern: /<\/?[A-Za-z][\w-]*/g,             kind: "type"     },

    // Attribute names (identifier before = within a tag). Applying broadly
    // and relying on order/overlap resolution keeps the rule set small.
    { pattern: /\b[A-Za-z_][\w-]*(?=\s*=)/g,      kind: "property" },

    // Tag closers (just the > character).
    { pattern: /[<>]/g,                            kind: "operator" },
  ],
};
