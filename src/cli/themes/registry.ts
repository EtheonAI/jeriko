/**
 * Theme registry — single source of truth for all themes.
 *
 * Built-in themes are registered at module load via static imports — no I/O,
 * no async init. Consumers (CLI picker, ThemeProvider, auto-detect) look up
 * themes through the registry, not by directly importing preset modules.
 *
 * Extensibility: `registerTheme()` allows runtime additions (e.g., loading
 * from `~/.config/jeriko/themes/*.json` in a future subsystem). Duplicate
 * ids are rejected — themes are immutable once registered.
 */

import type { BuiltinThemeId, Theme, ThemeDescriptor, ThemeId, ThemeKind } from "./types.js";
import { toDescriptor } from "./types.js";
import { jeriko }         from "./presets/jeriko.js";
import { jerikoLight }    from "./presets/jeriko-light.js";
import { nocturne }       from "./presets/nocturne.js";
import { solarizedDark }  from "./presets/solarized-dark.js";
import { highContrast }   from "./presets/high-contrast.js";
import { ansiDark }       from "./presets/ansi-dark.js";

// ---------------------------------------------------------------------------
// Built-in registration
// ---------------------------------------------------------------------------

/**
 * Built-in themes, typed as Record<BuiltinThemeId, Theme> so the compiler
 * verifies that every id in the BuiltinThemeId union has a corresponding
 * preset file. Adding a preset is a two-line change: extend the union,
 * add the entry here.
 */
const BUILTINS: Record<BuiltinThemeId, Theme> = {
  "jeriko":         jeriko,
  "jeriko-light":   jerikoLight,
  "nocturne":       nocturne,
  "solarized-dark": solarizedDark,
  "high-contrast":  highContrast,
  "ansi-dark":      ansiDark,
};

/**
 * Runtime registry. Seeded from BUILTINS; registerTheme() adds to it.
 * Using a Map (not Record) so insertion order defines listing order.
 */
const registry: Map<ThemeId, Theme> = new Map();
for (const id of Object.keys(BUILTINS) as BuiltinThemeId[]) {
  registry.set(id, BUILTINS[id]);
}

// ---------------------------------------------------------------------------
// Default selection
// ---------------------------------------------------------------------------

/**
 * Fallback theme id when no preference exists and auto-detection is
 * inconclusive. Choice: jeriko (dark, brand).
 */
export const DEFAULT_THEME_ID: BuiltinThemeId = "jeriko";

/** Back-compat alias for code that imports `DEFAULT_THEME`. */
export const DEFAULT_THEME: BuiltinThemeId = DEFAULT_THEME_ID;

// ---------------------------------------------------------------------------
// Public API — typed lookups, listing, extensibility
// ---------------------------------------------------------------------------

/** Look up a theme by id. Returns undefined if unknown. */
export function getTheme(id: ThemeId): Theme | undefined {
  return registry.get(id);
}

/**
 * Look up a theme by id with fallback to the default. Never returns
 * undefined — use this at render sites that cannot handle a miss.
 */
export function resolveTheme(id: ThemeId | undefined): Theme {
  if (id !== undefined) {
    const found = registry.get(id);
    if (found !== undefined) return found;
  }
  // The default is registered at module load, so this is total.
  return registry.get(DEFAULT_THEME_ID) ?? jeriko;
}

/** List all registered themes in registration order. */
export function listThemes(): Theme[] {
  return [...registry.values()];
}

/** Lightweight descriptors — suitable for pickers that don't render colors. */
export function listThemeDescriptors(): ThemeDescriptor[] {
  return [...registry.values()].map(toDescriptor);
}

/** List themes that match a given kind (e.g. "dark" for dark-mode terminals). */
export function listThemesByKind(kind: ThemeKind): Theme[] {
  return [...registry.values()].filter((theme) => theme.kind === kind);
}

// ---------------------------------------------------------------------------
// Runtime registration
// ---------------------------------------------------------------------------

export class DuplicateThemeError extends Error {
  public readonly themeId: ThemeId;
  constructor(themeId: ThemeId) {
    super(`Theme with id "${themeId}" is already registered`);
    this.name = "DuplicateThemeError";
    this.themeId = themeId;
  }
}

/**
 * Register a runtime theme. Rejects duplicate ids — themes are immutable.
 * Returns an unregister handle so tests and plugin unload paths can clean up.
 */
export function registerTheme(theme: Theme): () => void {
  if (registry.has(theme.id)) throw new DuplicateThemeError(theme.id);
  registry.set(theme.id, theme);
  return () => {
    // Only remove if still the same reference — prevents accidentally
    // removing a replacement theme registered with the same id.
    if (registry.get(theme.id) === theme) registry.delete(theme.id);
  };
}

// ---------------------------------------------------------------------------
// Back-compat — the original THEMES export
// ---------------------------------------------------------------------------

/**
 * Legacy export. Code that imported `THEMES` from the old themes.ts gets a
 * typed Record over built-in ids. Runtime-registered themes are not visible
 * here — callers that need those must use `getTheme()` / `listThemes()`.
 */
export const THEMES: Readonly<Record<BuiltinThemeId, Theme>> = BUILTINS;
