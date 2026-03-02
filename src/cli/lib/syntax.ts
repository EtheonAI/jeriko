/**
 * Syntax highlighter — Regex-based tokenizer for code blocks.
 *
 * Each language is defined as an ordered array of { pattern, color } rules.
 * Patterns are applied left-to-right — first match wins for each token.
 *
 * Supported languages:
 *   - JavaScript/TypeScript (js, ts, jsx, tsx, javascript, typescript)
 *   - Python (py, python)
 *   - Bash/Shell (bash, sh, shell, zsh)
 *   - JSON (json)
 *   - SQL (sql)
 *   - Go (go, golang)
 *
 * No external dependencies — uses chalk + PALETTE from theme.
 */

import chalk from "chalk";
import { PALETTE } from "../theme.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenRule {
  pattern: RegExp;
  color: string;
}

type LanguageRules = TokenRule[];

// ---------------------------------------------------------------------------
// Color palette for syntax elements
// ---------------------------------------------------------------------------

const SYN = {
  keyword:    PALETTE.purple,
  string:     PALETTE.green,
  number:     PALETTE.yellow,
  comment:    PALETTE.dim,
  type:       PALETTE.cyan,
  function:   PALETTE.blue,
  operator:   PALETTE.red,
  property:   PALETTE.text,
  builtin:    PALETTE.cyan,
  variable:   PALETTE.text,
} as const;

// ---------------------------------------------------------------------------
// Language definitions
// ---------------------------------------------------------------------------

const JS_RULES: LanguageRules = [
  // Comments
  { pattern: /\/\/.*$/gm, color: SYN.comment },
  { pattern: /\/\*[\s\S]*?\*\//gm, color: SYN.comment },
  // Strings
  { pattern: /"(?:[^"\\]|\\.)*"/g, color: SYN.string },
  { pattern: /'(?:[^'\\]|\\.)*'/g, color: SYN.string },
  { pattern: /`(?:[^`\\]|\\.)*`/g, color: SYN.string },
  // Numbers
  { pattern: /\b\d+(\.\d+)?\b/g, color: SYN.number },
  // Keywords
  { pattern: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|delete|typeof|instanceof|in|of|class|extends|import|export|from|default|async|await|yield|this|super|static|get|set|true|false|null|undefined|void)\b/g, color: SYN.keyword },
  // Types (TypeScript)
  { pattern: /\b(string|number|boolean|any|void|never|unknown|object|interface|type|enum|namespace|declare|as|is|keyof|readonly|infer)\b/g, color: SYN.type },
  // Arrow functions
  { pattern: /=>/g, color: SYN.operator },
];

const PYTHON_RULES: LanguageRules = [
  // Comments
  { pattern: /#.*$/gm, color: SYN.comment },
  // Strings (triple-quoted first)
  { pattern: /"""[\s\S]*?"""/g, color: SYN.string },
  { pattern: /'''[\s\S]*?'''/g, color: SYN.string },
  { pattern: /"(?:[^"\\]|\\.)*"/g, color: SYN.string },
  { pattern: /'(?:[^'\\]|\\.)*'/g, color: SYN.string },
  // Numbers
  { pattern: /\b\d+(\.\d+)?\b/g, color: SYN.number },
  // Keywords
  { pattern: /\b(def|class|return|if|elif|else|for|while|break|continue|try|except|finally|raise|with|as|import|from|pass|yield|lambda|and|or|not|in|is|True|False|None|global|nonlocal|assert|del|async|await)\b/g, color: SYN.keyword },
  // Built-in types
  { pattern: /\b(int|float|str|bool|list|dict|tuple|set|bytes|type|object)\b/g, color: SYN.type },
  // Decorators
  { pattern: /@\w+/g, color: SYN.builtin },
];

const BASH_RULES: LanguageRules = [
  // Comments
  { pattern: /#.*$/gm, color: SYN.comment },
  // Strings
  { pattern: /"(?:[^"\\]|\\.)*"/g, color: SYN.string },
  { pattern: /'[^']*'/g, color: SYN.string },
  // Variables
  { pattern: /\$\w+/g, color: SYN.variable },
  { pattern: /\$\{[^}]+\}/g, color: SYN.variable },
  // Keywords
  { pattern: /\b(if|then|else|elif|fi|for|do|done|while|until|case|esac|in|function|return|local|export|source|alias|unalias|eval|exec|exit|set|unset|shift|trap|wait)\b/g, color: SYN.keyword },
  // Common commands
  { pattern: /\b(echo|cd|ls|cat|grep|sed|awk|find|sort|head|tail|wc|cut|tr|xargs|mkdir|rm|cp|mv|chmod|chown|curl|wget|git|npm|bun|node|python)\b/g, color: SYN.builtin },
];

const JSON_RULES: LanguageRules = [
  // Strings (keys and values)
  { pattern: /"(?:[^"\\]|\\.)*"\s*:/g, color: SYN.property },
  { pattern: /"(?:[^"\\]|\\.)*"/g, color: SYN.string },
  // Numbers
  { pattern: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/g, color: SYN.number },
  // Keywords
  { pattern: /\b(true|false|null)\b/g, color: SYN.keyword },
];

const SQL_RULES: LanguageRules = [
  // Comments
  { pattern: /--.*$/gm, color: SYN.comment },
  // Strings
  { pattern: /'(?:[^'\\]|\\.)*'/g, color: SYN.string },
  // Numbers
  { pattern: /\b\d+(\.\d+)?\b/g, color: SYN.number },
  // Keywords (case-insensitive)
  { pattern: /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|IN|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|IF|EXISTS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|BETWEEN|LIKE|UNION|ALL|CASE|WHEN|THEN|ELSE|END|PRIMARY|KEY|FOREIGN|REFERENCES|DEFAULT|CONSTRAINT|UNIQUE|CHECK)\b/gi, color: SYN.keyword },
];

const GO_RULES: LanguageRules = [
  // Comments
  { pattern: /\/\/.*$/gm, color: SYN.comment },
  { pattern: /\/\*[\s\S]*?\*\//gm, color: SYN.comment },
  // Strings
  { pattern: /"(?:[^"\\]|\\.)*"/g, color: SYN.string },
  { pattern: /`[^`]*`/g, color: SYN.string },
  // Numbers
  { pattern: /\b\d+(\.\d+)?\b/g, color: SYN.number },
  // Keywords
  { pattern: /\b(package|import|func|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|chan|map|struct|interface|type|var|const|true|false|nil|make|new|append|len|cap|delete|close|panic|recover)\b/g, color: SYN.keyword },
  // Built-in types
  { pattern: /\b(string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|error|any)\b/g, color: SYN.type },
];

// ---------------------------------------------------------------------------
// Language registry
// ---------------------------------------------------------------------------

const LANGUAGE_MAP: Record<string, LanguageRules> = {
  // JavaScript/TypeScript
  js: JS_RULES,
  javascript: JS_RULES,
  ts: JS_RULES,
  typescript: JS_RULES,
  jsx: JS_RULES,
  tsx: JS_RULES,

  // Python
  py: PYTHON_RULES,
  python: PYTHON_RULES,

  // Bash/Shell
  bash: BASH_RULES,
  sh: BASH_RULES,
  shell: BASH_RULES,
  zsh: BASH_RULES,

  // JSON
  json: JSON_RULES,

  // SQL
  sql: SQL_RULES,

  // Go
  go: GO_RULES,
  golang: GO_RULES,
};

/**
 * Get the list of supported language identifiers.
 */
export function supportedLanguages(): string[] {
  return Object.keys(LANGUAGE_MAP);
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Apply syntax highlighting to a code string.
 * Returns a chalk-styled string.
 *
 * Unknown languages fall back to PALETTE.blue for all text.
 */
export function highlightCode(code: string, language: string): string {
  const rules = LANGUAGE_MAP[language.toLowerCase()];
  if (!rules) {
    // Unknown language — apply base code color
    return chalk.hex(PALETTE.blue)(code);
  }

  return applyRules(code, rules);
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Apply a set of regex rules to colorize source code.
 *
 * Strategy: Build a list of non-overlapping "color spans" from all rules.
 * Process rules in order — first match wins for any character position.
 * Unmatched text gets the default code color (PALETTE.blue).
 */
function applyRules(code: string, rules: LanguageRules): string {
  // Collect all match spans: [start, end, color]
  const spans: Array<[number, number, string]> = [];

  for (const rule of rules) {
    // Reset regex state for each scan
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(code)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Only add if no existing span overlaps
      if (!overlaps(spans, start, end)) {
        spans.push([start, end, rule.color]);
      }

      // Prevent infinite loop on zero-width matches
      if (match[0].length === 0) regex.lastIndex++;
    }
  }

  // Sort spans by start position
  spans.sort((a, b) => a[0] - b[0]);

  // Build the output string
  let result = "";
  let cursor = 0;

  for (const [start, end, color] of spans) {
    // Unmatched gap — default color
    if (cursor < start) {
      result += chalk.hex(PALETTE.blue)(code.slice(cursor, start));
    }
    // Matched span — rule color
    result += chalk.hex(color)(code.slice(start, end));
    cursor = end;
  }

  // Trailing unmatched text
  if (cursor < code.length) {
    result += chalk.hex(PALETTE.blue)(code.slice(cursor));
  }

  return result;
}

/**
 * Check if a proposed span [start, end) overlaps with any existing span.
 */
function overlaps(
  spans: Array<[number, number, string]>,
  start: number,
  end: number,
): boolean {
  for (const [s, e] of spans) {
    if (start < e && end > s) return true;
  }
  return false;
}
