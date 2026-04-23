/**
 * CLI palette + chalk formatters.
 *
 * Responsibilities after the Theme v2 refactor (see `./themes/`):
 *
 *   1. PALETTE — module-scoped mutable color map that non-React code
 *      (format.ts, channels, any plain-chalk consumer) reads from.
 *   2. t.*     — semantic chalk formatters, rebuilt whenever PALETTE changes.
 *   3. ICONS / BOX / layout helpers — pure presentation utilities with no
 *      theming concerns.
 *
 * Theme DATA (color values, preset definitions, registry, React provider,
 * auto-detection) lives in `./themes/`. This file is the narrow bridge
 * between that data and the legacy chalk-based render path. Subsystem 5
 * will retire the bridge by migrating all chalk consumers to useTheme().
 */

import chalk, { type ChalkInstance } from "chalk";
import type { Theme, ThemeColors, ThemeId, ThemePreset } from "./themes/index.js";
import {
  DEFAULT_THEME_ID,
  resolveTheme,
} from "./themes/index.js";

// ---------------------------------------------------------------------------
// Palette — mutable singleton, tracks active theme
// ---------------------------------------------------------------------------

/**
 * PaletteKeys extends ThemeColors with legacy aliases (`blue`, `green`, etc.)
 * that existing format.ts call sites rely on. The aliases are defined as
 * getters below so they always reflect the current `tool`/`success`/... value.
 *
 * `MutableThemeColors` strips the `readonly` modifiers from ThemeColors:
 * themes themselves are immutable, but the palette is explicitly mutable —
 * that's its entire purpose — so the palette type must reflect that.
 */
type MutableThemeColors = {
  -readonly [K in keyof ThemeColors]: ThemeColors[K];
};

type PaletteKeys = MutableThemeColors & {
  blue: string;
  green: string;
  red: string;
  yellow: string;
  cyan: string;
  [key: string]: string;
};

/** Seed PALETTE from the registry's default theme. */
export const PALETTE: PaletteKeys = {
  ...resolveTheme(DEFAULT_THEME_ID).colors,
} as PaletteKeys;

/** Backward-compat aliases for legacy call sites (`PALETTE.blue` → tool, etc.). */
Object.defineProperties(PALETTE, {
  blue:   { get: () => PALETTE.tool,    enumerable: true },
  green:  { get: () => PALETTE.success, enumerable: true },
  red:    { get: () => PALETTE.error,   enumerable: true },
  yellow: { get: () => PALETTE.warning, enumerable: true },
  cyan:   { get: () => PALETTE.info,    enumerable: true },
});

// ---------------------------------------------------------------------------
// Active theme state
// ---------------------------------------------------------------------------

/** Current active theme id — the single writer is setActiveTheme(). */
let activeThemeId: ThemeId = DEFAULT_THEME_ID;

/**
 * Switch the active theme. Accepts either a resolved Theme object (fast path,
 * used by the ThemeProvider / palette-bridge) or a ThemeId string (convenience
 * for CLI handlers). Unknown ids fall back to the registry default — never
 * throws.
 */
export function setActiveTheme(theme: Theme | ThemeId): void {
  const resolved: Theme = typeof theme === "string" ? resolveTheme(theme) : theme;
  activeThemeId = resolved.id as ThemeId;
  const colors = resolved.colors;
  for (const key of Object.keys(colors) as Array<keyof ThemeColors>) {
    PALETTE[key] = colors[key];
  }
  rebuildChalkFormatters();
}

/** Current active theme id. */
export function getActiveTheme(): ThemeId {
  return activeThemeId;
}

// ---------------------------------------------------------------------------
// Semantic chalk formatters
// ---------------------------------------------------------------------------

interface ThemeFormatters {
  brand:     ChalkInstance;
  brandDim:  ChalkInstance;
  brandBold: ChalkInstance;
  blue:      ChalkInstance;
  green:     ChalkInstance;
  red:       ChalkInstance;
  yellow:    ChalkInstance;
  cyan:      ChalkInstance;
  purple:    ChalkInstance;
  teal:      ChalkInstance;
  orange:    ChalkInstance;
  pink:      ChalkInstance;
  success:   ChalkInstance;
  error:     ChalkInstance;
  warning:   ChalkInstance;
  info:      ChalkInstance;
  diffAdd:   ChalkInstance;
  diffRm:    ChalkInstance;
  diffCtx:   ChalkInstance;
  text:      ChalkInstance;
  muted:     ChalkInstance;
  dim:       ChalkInstance;
  faint:     ChalkInstance;
  bold:      ChalkInstance;
  header:    ChalkInstance;
  underline: ChalkInstance;
}

export const t = {} as ThemeFormatters;

/** Rebuild all chalk formatters from current PALETTE values. */
function rebuildChalkFormatters(): void {
  Object.assign(t, {
    brand:     chalk.hex(PALETTE.brand),
    brandDim:  chalk.hex(PALETTE.brandDim),
    brandBold: chalk.hex(PALETTE.brand).bold,

    blue:      chalk.hex(PALETTE.blue),
    green:     chalk.hex(PALETTE.green),
    red:       chalk.hex(PALETTE.red),
    yellow:    chalk.hex(PALETTE.yellow),
    cyan:      chalk.hex(PALETTE.cyan),
    purple:    chalk.hex(PALETTE.purple),

    teal:      chalk.hex(PALETTE.teal),
    orange:    chalk.hex(PALETTE.orange),
    pink:      chalk.hex(PALETTE.pink),

    success:   chalk.hex(PALETTE.success),
    error:     chalk.hex(PALETTE.error),
    warning:   chalk.hex(PALETTE.warning),
    info:      chalk.hex(PALETTE.info),

    diffAdd:   chalk.hex(PALETTE.diffAdd),
    diffRm:    chalk.hex(PALETTE.diffRm),
    diffCtx:   chalk.hex(PALETTE.diffCtx),

    text:      chalk.hex(PALETTE.text),
    muted:     chalk.hex(PALETTE.muted),
    dim:       chalk.hex(PALETTE.dim),
    faint:     chalk.hex(PALETTE.faint),

    bold:      chalk.bold,
    header:    chalk.hex(PALETTE.text).bold,
    underline: chalk.underline,
  });
}

// Initialize formatters with the default theme.
rebuildChalkFormatters();

// ---------------------------------------------------------------------------
// Unicode symbols — theme-independent
// ---------------------------------------------------------------------------

export const ICONS = {
  success:    "✓",
  error:      "✗",
  warning:    "⚠",
  info:       "ℹ",
  pending:    "○",
  active:     "●",
  inactive:   "○",
  dot:        "·",
  arrow:      "▸",
  chevron:    "›",
  tool:       "⏺",
  result:     "⎿",
  cursor:     "▊",
  treeItem:   "├─",
  treeLast:   "└─",
  treeBranch: "│",
  filled:     "█",
  empty:      "░",
} as const;

export const BOX = {
  tl: "╭", tr: "╮", bl: "╰", br: "╯",
  h: "─", v: "│",
  ltl: "┌", ltr: "┐", lbl: "└", lbr: "┘",
  lh: "─", lv: "│",
} as const;

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

export function sectionHeader(title: string, width: number = 52): string {
  return `  ${t.brandBold(title)}\n${t.dim("  " + BOX.h.repeat(width))}`;
}

export function subSection(label: string): string {
  return `  ${t.muted(`── ${label} ──`)}`;
}

export function treeItem(isLast: boolean, content: string): string {
  const connector = isLast ? ICONS.treeLast : ICONS.treeItem;
  return `  ${t.dim(connector)} ${content}`;
}

export function statusDot(state: "active" | "inactive" | "error" | "warning"): string {
  switch (state) {
    case "active":   return t.green(ICONS.active);
    case "inactive": return t.dim(ICONS.inactive);
    case "error":    return t.error(ICONS.error);
    case "warning":  return t.yellow(ICONS.active);
  }
}

export function kvPair(label: string, value: string, labelWidth: number = 12): string {
  return `  ${t.dim(label.padEnd(labelWidth))}${value}`;
}

export function hint(prefix: string, command: string, suffix: string): string {
  return `  ${t.dim(prefix)} ${t.muted(command)} ${t.dim(suffix)}`;
}

export function badge(
  label: string,
  style: "brand" | "success" | "warning" | "error" | "muted",
): string {
  const colorFn = {
    brand:   t.brand,
    success: t.green,
    warning: t.yellow,
    error:   t.red,
    muted:   t.dim,
  }[style];
  return colorFn(label);
}

// Legacy alias.
export { t as theme };

// Re-export the legacy name `ThemePreset` so any remaining string-typed
// consumers keep compiling. The canonical name is `ThemeId`.
export type { ThemePreset };
