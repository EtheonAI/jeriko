/**
 * Keybinding Subsystem — type contracts.
 *
 * Single source of truth for key events, chords, scopes, and bindings.
 * Every consumer (matcher, store, provider, help overlay) speaks these types
 * and nothing else. Ink's raw Key shape is normalized into a canonical
 * `KeyEvent` on the way in — downstream code never sees Ink-specific flags.
 *
 * Design rules:
 *   - No ad-hoc prop types. Every concept that crosses a module boundary
 *     lives here.
 *   - Every field on a public type is `readonly`. Runtime code uses factory
 *     helpers in matcher.ts to construct instances.
 *   - Scopes are a closed literal union. Adding a scope is a one-word edit.
 */

// ---------------------------------------------------------------------------
// Canonical key names
// ---------------------------------------------------------------------------

/**
 * Canonical key identifiers recognized by the matcher.
 *
 * Named keys are lower-case (`return`, `escape`, `up`, `down`, `left`,
 * `right`, `tab`, `backspace`, `delete`, `home`, `end`, `pageup`, `pagedown`,
 * `space`). Any other key is its literal character (already lower-case where
 * applicable: `"a"`, `"1"`, `","`).
 *
 * The set of known named keys lives here so parseChord and normalizeInkKey
 * share one vocabulary.
 */
export const NAMED_KEYS = [
  "return",
  "escape",
  "up",
  "down",
  "left",
  "right",
  "tab",
  "backspace",
  "delete",
  "home",
  "end",
  "pageup",
  "pagedown",
  "space",
] as const;

export type NamedKey = (typeof NAMED_KEYS)[number];

// ---------------------------------------------------------------------------
// KeyEvent — a single normalized keystroke
// ---------------------------------------------------------------------------

/**
 * A normalized key event. `key` is either a NamedKey or a single character.
 * Modifier booleans reflect user intent — `shift` is only set for explicit
 * shift combinations; a capital letter is its own key ("A" vs shift+"a" are
 * treated as the same event because terminals can't reliably distinguish
 * them, matching Ink's behaviour).
 */
export interface KeyEvent {
  readonly key: string;
  readonly ctrl: boolean;
  readonly meta: boolean;   // Alt/Option
  readonly shift: boolean;
}

// ---------------------------------------------------------------------------
// Chord — a sequence of 1+ KeyEvents
// ---------------------------------------------------------------------------

/** A chord is a non-empty sequence of KeyEvents (e.g. `[Ctrl+K, Ctrl+S]`). */
export type Chord = readonly KeyEvent[];

// ---------------------------------------------------------------------------
// BindingScope — where a binding is eligible to fire
// ---------------------------------------------------------------------------

/**
 * Closed set of scopes. Resolution walks from innermost to outermost; a
 * binding fires if its scope is anywhere in the active scope stack and its
 * chord matches.
 */
export const BINDING_SCOPES = [
  "global",   // always active
  "input",    // the prompt input is focused, idle
  "messages", // scrollback has focus (future)
  "wizard",   // a multi-step wizard is active
  "dialog",   // a modal dialog is open (future)
  "help",     // keybinding help overlay is open
] as const;

export type BindingScope = (typeof BINDING_SCOPES)[number];

// ---------------------------------------------------------------------------
// BindingSpec — declarative record of what a binding IS
// ---------------------------------------------------------------------------

/**
 * Everything about a binding that is data, not behaviour. Shipped in
 * defaults.ts and overrideable via user config. `id` is stable across
 * versions — consumers look up bindings by id, never by chord or description.
 */
export interface BindingSpec {
  readonly id: string;
  readonly description: string;
  readonly chord: Chord;
  readonly scope: BindingScope;
}

// ---------------------------------------------------------------------------
// Binding — spec + handler
// ---------------------------------------------------------------------------

/**
 * Return value of a handler.
 *   - void:  treated as handled (default behaviour, most callers want this).
 *   - true:  explicitly handled; dispatch stops here.
 *   - false: explicitly NOT handled; dispatch continues to look for another
 *            matching binding (e.g., a global fallback).
 */
export type HandlerResult = void | boolean;

export type BindingHandler = () => HandlerResult;

export interface Binding extends BindingSpec {
  readonly handler: BindingHandler;
}

// ---------------------------------------------------------------------------
// Store snapshot types — returned by hooks and help overlay
// ---------------------------------------------------------------------------

export interface StoreSnapshot {
  readonly activeScopes: readonly BindingScope[];
  readonly pendingChord: Chord | null;
  readonly bindings: readonly Binding[];
}
