/**
 * Language preset — SQL (dialect-agnostic).
 *
 * Keywords match case-insensitively; strings use single-quote SQL convention.
 */

import type { Language } from "../types.js";

export const sql: Language = {
  id: "sql",
  displayName: "SQL",
  aliases: [],
  rules: [
    { pattern: /--.*$/gm,                   kind: "comment" },
    { pattern: /'(?:[^'\\]|\\.)*'/g,        kind: "string"  },
    { pattern: /\b\d+(\.\d+)?\b/g,          kind: "number"  },
    {
      pattern: /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|IN|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|IF|EXISTS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|BETWEEN|LIKE|UNION|ALL|CASE|WHEN|THEN|ELSE|END|PRIMARY|KEY|FOREIGN|REFERENCES|DEFAULT|CONSTRAINT|UNIQUE|CHECK)\b/gi,
      kind: "keyword",
    },
  ],
};
