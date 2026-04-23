/**
 * Language preset — Rust.
 */

import type { Language } from "../types.js";

export const rust: Language = {
  id: "rust",
  displayName: "Rust",
  aliases: ["rs"],
  rules: [
    { pattern: /\/\/.*$/gm,                       kind: "comment" },
    { pattern: /\/\*[\s\S]*?\*\//gm,              kind: "comment" },

    // Byte string, raw string, regular string, char.
    { pattern: /b?r#*"(?:[^"\\]|\\.)*"#*/g,       kind: "string"  },
    { pattern: /b?"(?:[^"\\]|\\.)*"/g,            kind: "string"  },
    { pattern: /'(?:\\.|[^'\\])'/g,               kind: "string"  },

    // Numbers including suffixes (i32, u64, f64).
    { pattern: /\b\d+(_\d+)*(\.\d+)?([eE][+-]?\d+)?(i\d+|u\d+|f\d+|isize|usize)?\b/g, kind: "number" },

    // Keywords.
    {
      pattern: /\b(fn|let|mut|const|static|if|else|match|while|loop|for|in|break|continue|return|as|use|mod|pub|crate|super|self|Self|ref|dyn|impl|trait|struct|enum|type|where|unsafe|extern|async|await|move|box|true|false)\b/g,
      kind: "keyword",
    },

    // Built-in types.
    {
      pattern: /\b(i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|char|str|String|Vec|Option|Result|Box|Rc|Arc|RefCell|Cell)\b/g,
      kind: "type",
    },

    // Macros (name!).
    { pattern: /\b\w+!/g,                         kind: "builtin" },

    // Lifetime parameters ('a).
    { pattern: /'[a-z_][a-z0-9_]*/g,              kind: "variable" },
  ],
};
