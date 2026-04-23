/**
 * Integration controllers — refs the slash-command handlers write to.
 *
 * Slash command handlers are pure async functions that run outside React;
 * they cannot call `useTheme()` or `useState` directly. A "controller ref"
 * is the standard workaround: a React component inside the provider tree
 * populates a `MutableRefObject` with imperative accessors
 * (`setTheme`, `showHelp`, ...), and handlers read `ref.current` to act.
 *
 * This file owns only the TYPES. The bridge components that populate the
 * refs live next to the providers they consume (Bridges.tsx).
 */

import type { Theme, ThemeId } from "../themes/index.js";

// ---------------------------------------------------------------------------
// Theme controller
// ---------------------------------------------------------------------------

/**
 * Imperative theme surface for handlers. Populated by `ThemeControllerBridge`;
 * never `null` at runtime (the bridge initialises it before the first
 * handler can fire).
 */
export interface ThemeController {
  /** Current active theme id. */
  readonly current: ThemeId;
  /** Switch the active theme. Unknown ids fall back to the registry default. */
  readonly set: (id: ThemeId) => void;
  /** Every registered theme (built-ins + runtime). */
  readonly list: () => readonly Theme[];
}

/**
 * Default controller used when the tree hasn't mounted yet. `set` is a
 * no-op so handlers written defensively never throw before the bridge
 * populates the real controller.
 */
export const NULL_THEME_CONTROLLER: ThemeController = {
  current: "jeriko",
  set: () => {},
  list: () => [],
};

// ---------------------------------------------------------------------------
// Help controller — toggles the keybinding-help overlay
// ---------------------------------------------------------------------------

export interface HelpController {
  readonly visible: boolean;
  readonly show: () => void;
  readonly hide: () => void;
  readonly toggle: () => void;
}

export const NULL_HELP_CONTROLLER: HelpController = {
  visible: false,
  show: () => {},
  hide: () => {},
  toggle: () => {},
};
