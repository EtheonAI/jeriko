/**
 * Palette bridge — the one place that couples `themes/` to the legacy
 * PALETTE + chalk formatters in `src/cli/theme.ts`.
 *
 * Why it exists: PALETTE is a module-scoped mutable singleton read by
 * non-React code (format.ts, channel renderers, any plain-chalk site).
 * ThemeProvider owns React state; this bridge is how a state change
 * crosses into the legacy chalk world.
 *
 * Subsystem 5 eliminates PALETTE entirely by routing all chalk consumers
 * through the theme context; at that point this file is deleted and
 * ThemeProvider no longer touches module state outside its tree.
 */

import { setActiveTheme } from "../theme.js";
import type { Theme } from "./types.js";

/** Apply a resolved theme — mutates PALETTE and rebuilds chalk formatters. */
export function applyTheme(theme: Theme): void {
  // setActiveTheme now accepts a Theme directly (no string lookup), so
  // runtime-registered themes round-trip cleanly through this bridge.
  setActiveTheme(theme);
}
