// Layer 0 — Injection prevention. Zero internal imports.

/**
 * Escape a string for safe embedding inside an AppleScript string literal.
 *
 * AppleScript string literals are delimited by double quotes. Inside them
 * backslashes and double quotes must be escaped:
 *   \  →  \\
 *   "  →  \"
 *
 * @example
 *   const name = escapeAppleScript('He said "hello"');
 *   const script = `display dialog "${name}"`;
 */
export function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

/**
 * Escape a string for safe use as a single POSIX shell argument.
 *
 * Wraps the value in single quotes and escapes any embedded single quotes
 * using the `'\''` idiom (end quote, escaped literal quote, restart quote).
 *
 * @example
 *   const arg = escapeShellArg("hello 'world' && rm -rf /");
 *   // Returns: 'hello '\''world'\'' && rm -rf /'
 *   exec(`echo ${arg}`); // safe
 */
export function escapeShellArg(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Escape special characters for use in a double-quoted shell string.
 * Escapes: $ ` " \ and !
 *
 * Use this when you must interpolate inside double quotes (e.g. for
 * variable expansion). Prefer `escapeShellArg` (single quotes) when possible.
 */
export function escapeDoubleQuoted(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/!/g, "\\!");
}

/**
 * Strip ANSI escape sequences from a string.
 * Useful for sanitizing terminal output before logging or display.
 */
export function stripAnsi(str: string): string {
  // Matches all known ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
