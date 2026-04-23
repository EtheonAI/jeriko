/**
 * Keybinding Subsystem — default bindings.
 *
 * One declarative array listing every key the CLI currently responds to.
 * Each entry:
 *   - has a stable `id` (consumers look up bindings by id across versions)
 *   - a human-readable description (used by /keybindings help overlay)
 *   - a chord parsed at module load from a string spec
 *   - a scope
 *
 * Adding a new binding:
 *   1. Append an entry here with a unique id.
 *   2. In Subsystem 5, wire the corresponding handler via useKeybinding().
 *
 * User overrides via `~/.config/jeriko/keybindings.json` match by id and
 * replace only the chord; description and scope remain the source-of-truth
 * here.
 */

import type { BindingSpec } from "./types.js";
import { parseChord } from "./matcher.js";

interface DefaultSpec {
  readonly id: string;
  readonly description: string;
  readonly chord: string;   // spec string — parsed at module load
  readonly scope: BindingSpec["scope"];
}

/**
 * Raw spec list. Using a factory-less literal so the file reads top-down as
 * documentation: anyone skimming it gets the full surface in one glance.
 */
const RAW_DEFAULTS: readonly DefaultSpec[] = [
  // ── Global ────────────────────────────────────────────────────────────
  { id: "global.interrupt",  description: "Interrupt current operation",                 chord: "ctrl+c",   scope: "global" },
  { id: "global.eof",        description: "Send EOF / exit when the input is empty",     chord: "ctrl+d",   scope: "global" },
  { id: "global.help",       description: "Open the keybinding help overlay",            chord: "ctrl+h",   scope: "global" },

  // ── Input: submission + escape ────────────────────────────────────────
  { id: "input.submit",      description: "Submit the current prompt",                   chord: "return",   scope: "input" },
  { id: "input.escape",      description: "Dismiss autocomplete or clear the input",     chord: "escape",   scope: "input" },
  { id: "input.newline",     description: "Insert a newline (multi-line input)",         chord: "ctrl+j",   scope: "input" },

  // ── Input: history navigation ─────────────────────────────────────────
  { id: "input.history.prev", description: "Previous entry in command history",          chord: "up",       scope: "input" },
  { id: "input.history.next", description: "Next entry in command history",              chord: "down",     scope: "input" },

  // ── Input: cursor movement ────────────────────────────────────────────
  { id: "input.cursor.left",      description: "Move cursor left one character",         chord: "left",     scope: "input" },
  { id: "input.cursor.right",     description: "Move cursor right one character",        chord: "right",    scope: "input" },
  { id: "input.cursor.line-start", description: "Move cursor to start of line",          chord: "ctrl+a",   scope: "input" },
  { id: "input.cursor.line-end",   description: "Move cursor to end of line",            chord: "ctrl+e",   scope: "input" },

  // ── Input: editing ────────────────────────────────────────────────────
  { id: "input.edit.backspace",         description: "Delete character before cursor",   chord: "backspace", scope: "input" },
  { id: "input.edit.kill-to-end",       description: "Kill text from cursor to end",     chord: "ctrl+k",    scope: "input" },
  { id: "input.edit.kill-to-start",     description: "Kill text from cursor to start",   chord: "ctrl+u",    scope: "input" },
  { id: "input.edit.delete-word-back",  description: "Delete the preceding word",        chord: "ctrl+w",    scope: "input" },

  // ── Input: autocomplete ───────────────────────────────────────────────
  { id: "input.autocomplete.accept",  description: "Accept the selected completion",     chord: "tab",      scope: "input" },

  // ── Wizard navigation ─────────────────────────────────────────────────
  { id: "wizard.next",          description: "Advance to the next wizard step",          chord: "return",   scope: "wizard" },
  { id: "wizard.back",          description: "Go back (or cancel) the wizard",           chord: "escape",   scope: "wizard" },
  { id: "wizard.select.prev",   description: "Move selection up",                        chord: "up",       scope: "wizard" },
  { id: "wizard.select.next",   description: "Move selection down",                      chord: "down",     scope: "wizard" },
  { id: "wizard.multi.toggle",  description: "Toggle an option in a multi-select step",  chord: "space",    scope: "wizard" },

  // ── Help overlay ──────────────────────────────────────────────────────
  { id: "help.dismiss",         description: "Close the keybinding help overlay",        chord: "escape",   scope: "help" },

  // ── Permission dialog ─────────────────────────────────────────────────
  { id: "permission.allow-once",    description: "Allow this request once",              chord: "y",        scope: "dialog" },
  { id: "permission.allow-session", description: "Allow for the rest of this session",   chord: "shift+y",  scope: "dialog" },
  { id: "permission.allow-always",  description: "Allow always (persist to config)",     chord: "a",        scope: "dialog" },
  { id: "permission.deny-once",     description: "Deny this request once",               chord: "n",        scope: "dialog" },
  { id: "permission.deny-always",   description: "Deny always (persist to config)",      chord: "d",        scope: "dialog" },
  { id: "permission.cancel",        description: "Cancel the permission dialog (denies)", chord: "escape",  scope: "dialog" },
];

// ---------------------------------------------------------------------------
// Resolved defaults — chords parsed exactly once at module load
// ---------------------------------------------------------------------------

/**
 * The canonical default BindingSpec list. Consumers read this; they do not
 * re-parse RAW_DEFAULTS. If any spec string is malformed, the module fails
 * to load — a compile-time-equivalent guarantee that defaults are valid.
 */
export const DEFAULT_BINDINGS: readonly BindingSpec[] = RAW_DEFAULTS.map((raw) => ({
  id:          raw.id,
  description: raw.description,
  chord:       parseChord(raw.chord),
  scope:       raw.scope,
}));

/** O(1) lookup by id. */
export const DEFAULT_BINDINGS_BY_ID: ReadonlyMap<string, BindingSpec> = new Map(
  DEFAULT_BINDINGS.map((spec) => [spec.id, spec]),
);
