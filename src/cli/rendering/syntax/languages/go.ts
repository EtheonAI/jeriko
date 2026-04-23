/**
 * Language preset — Go.
 */

import type { Language } from "../types.js";

export const go: Language = {
  id: "go",
  displayName: "Go",
  aliases: ["golang"],
  rules: [
    { pattern: /\/\/.*$/gm,              kind: "comment" },
    { pattern: /\/\*[\s\S]*?\*\//gm,     kind: "comment" },
    { pattern: /"(?:[^"\\]|\\.)*"/g,     kind: "string"  },
    { pattern: /`[^`]*`/g,               kind: "string"  },
    { pattern: /\b\d+(\.\d+)?\b/g,       kind: "number"  },
    {
      pattern: /\b(package|import|func|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|chan|map|struct|interface|type|var|const|true|false|nil|make|new|append|len|cap|delete|close|panic|recover)\b/g,
      kind: "keyword",
    },
    {
      pattern: /\b(string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|error|any)\b/g,
      kind: "type",
    },
  ],
};
