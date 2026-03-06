/**
 * CLI Theme — Color palette, semantic chalk wrappers, and visual helpers.
 *
 * Design system for Jeriko's terminal UI. Supports multiple themes
 * via ThemeContext (see hooks/useTheme.ts). This module provides:
 *
 *   1. PALETTE — Mutable color map (updates when theme changes)
 *   2. t.*     — Chalk formatters that use current PALETTE values
 *   3. ICONS   — Unicode symbols (theme-independent)
 *   4. Helpers — sectionHeader, treeItem, kvPair, etc.
 *
 * Components in Ink use `useTheme().colors` directly for <Text color={}>.
 * Non-React code (format.ts, channels) uses `t.*` chalk wrappers.
 *
 * Chalk automatically respects NO_COLOR, FORCE_COLOR, and TERM=dumb.
 */

import chalk, { type ChalkInstance } from "chalk";
import type { ThemeColors, ThemePreset } from "./themes.js";
import { THEMES, DEFAULT_THEME } from "./themes.js";

// ---------------------------------------------------------------------------
// Color palette — mutable, tracks active theme
// ---------------------------------------------------------------------------

/**
 * Active color palette. Updates when `setActiveTheme()` is called.
 * Use in Ink components via `useTheme().colors` instead of importing directly.
 * Use via `t.*` chalk wrappers in non-React code (format.ts, channels).
 */
type PaletteKeys = ThemeColors & {
  blue: string;
  green: string;
  red: string;
  yellow: string;
  cyan: string;
  [key: string]: string;
};

export const PALETTE: PaletteKeys = { ...THEMES[DEFAULT_THEME].colors } as PaletteKeys;

/** Backward-compat aliases for format.ts consumers that use `PALETTE.blue` etc. */
Object.defineProperties(PALETTE, {
  blue:   { get: () => PALETTE.tool,    enumerable: true },
  green:  { get: () => PALETTE.success, enumerable: true },
  red:    { get: () => PALETTE.error,   enumerable: true },
  yellow: { get: () => PALETTE.warning, enumerable: true },
  cyan:   { get: () => PALETTE.info,    enumerable: true },
});

/** Current active theme name. */
let activeTheme: ThemePreset = DEFAULT_THEME;

/** Switch the active theme — updates PALETTE and rebuilds chalk formatters. */
export function setActiveTheme(theme: ThemePreset): void {
  const resolved = THEMES[theme] ?? THEMES[DEFAULT_THEME];
  activeTheme = resolved.name;
  const colors = resolved.colors;
  for (const key of Object.keys(colors) as Array<keyof ThemeColors>) {
    PALETTE[key] = colors[key];
  }
  rebuildChalkFormatters();
}

/** Get the current active theme name. */
export function getActiveTheme(): ThemePreset {
  return activeTheme;
}

// ---------------------------------------------------------------------------
// Semantic chalk functions
// ---------------------------------------------------------------------------

/**
 * Pre-configured chalk formatters for semantic use across the CLI.
 *
 * Usage:
 *   import { t } from "./theme.js";
 *   console.log(t.brand("Jeriko"));
 *   console.log(t.error("Something went wrong"));
 *   console.log(t.muted("1.2k tokens"));
 */
interface ThemeFormatters {
  brand: ChalkInstance;
  brandDim: ChalkInstance;
  brandBold: ChalkInstance;
  blue: ChalkInstance;
  green: ChalkInstance;
  red: ChalkInstance;
  yellow: ChalkInstance;
  cyan: ChalkInstance;
  purple: ChalkInstance;
  teal: ChalkInstance;
  orange: ChalkInstance;
  pink: ChalkInstance;
  success: ChalkInstance;
  error: ChalkInstance;
  warning: ChalkInstance;
  info: ChalkInstance;
  diffAdd: ChalkInstance;
  diffRm: ChalkInstance;
  diffCtx: ChalkInstance;
  text: ChalkInstance;
  muted: ChalkInstance;
  dim: ChalkInstance;
  faint: ChalkInstance;
  bold: ChalkInstance;
  header: ChalkInstance;
  underline: ChalkInstance;
}

export const t = {} as ThemeFormatters;

/** Rebuild all chalk formatters from current PALETTE values. */
function rebuildChalkFormatters(): void {
  Object.assign(t, {
    // Brand
    brand:     chalk.hex(PALETTE.brand),
    brandDim:  chalk.hex(PALETTE.brandDim),
    brandBold: chalk.hex(PALETTE.brand).bold,

    // Semantic
    blue:      chalk.hex(PALETTE.blue),
    green:     chalk.hex(PALETTE.green),
    red:       chalk.hex(PALETTE.red),
    yellow:    chalk.hex(PALETTE.yellow),
    cyan:      chalk.hex(PALETTE.cyan),
    purple:    chalk.hex(PALETTE.purple),

    // Extended semantic
    teal:      chalk.hex(PALETTE.teal),
    orange:    chalk.hex(PALETTE.orange),
    pink:      chalk.hex(PALETTE.pink),

    // Semantic aliases (used throughout components)
    success:   chalk.hex(PALETTE.success),
    error:     chalk.hex(PALETTE.error),
    warning:   chalk.hex(PALETTE.warning),
    info:      chalk.hex(PALETTE.info),

    // Diff formatters
    diffAdd:   chalk.hex(PALETTE.diffAdd),
    diffRm:    chalk.hex(PALETTE.diffRm),
    diffCtx:   chalk.hex(PALETTE.diffCtx),

    // Text hierarchy
    text:      chalk.hex(PALETTE.text),
    muted:     chalk.hex(PALETTE.muted),
    dim:       chalk.hex(PALETTE.dim),
    faint:     chalk.hex(PALETTE.faint),

    // Emphasis
    bold:      chalk.bold,
    header:    chalk.hex(PALETTE.text).bold,
    underline: chalk.underline,
  });
}

// Initialize formatters with default theme
rebuildChalkFormatters();

// ---------------------------------------------------------------------------
// Unicode symbols — consistent icons for all CLI output
// ---------------------------------------------------------------------------

/**
 * Standardized symbols used across all formatters and components.
 * Single source of truth — prevents inconsistent icon usage.
 */
export const ICONS = {
  // Status
  success:    "✓",
  error:      "✗",
  warning:    "⚠",
  info:       "ℹ",
  pending:    "○",

  // Dots (status indicators)
  active:     "●",
  inactive:   "○",
  dot:        "·",

  // Navigation
  arrow:      "▸",
  chevron:    "›",

  // Tool/action markers
  tool:       "⏺",
  result:     "⎿",
  cursor:     "▊",

  // List connectors (tree-style)
  treeItem:   "├─",
  treeLast:   "└─",
  treeBranch: "│",

  // Progress
  filled:     "█",
  empty:      "░",
} as const;

// ---------------------------------------------------------------------------
// Box drawing characters
// ---------------------------------------------------------------------------

export const BOX = {
  tl: "╭", tr: "╮", bl: "╰", br: "╯",
  h: "─", v: "│",
  // Light variants
  ltl: "┌", ltr: "┐", lbl: "└", lbr: "┘",
  lh: "─", lv: "│",
} as const;

// ---------------------------------------------------------------------------
// Visual helper functions
// ---------------------------------------------------------------------------

/**
 * Format a section header with a divider line.
 *
 * @example sectionHeader("Commands") → "  Commands\n  ────────────"
 */
export function sectionHeader(title: string, width: number = 52): string {
  return `  ${t.brandBold(title)}\n${t.dim("  " + BOX.h.repeat(width))}`;
}

/**
 * Format a sub-section label (lighter than sectionHeader).
 *
 * @example subSection("── Built-in ──")
 */
export function subSection(label: string): string {
  return `  ${t.muted(`── ${label} ──`)}`;
}

/**
 * Format a tree item with appropriate connector.
 *
 * @param isLast Whether this is the last item in the tree
 * @param content The content to display after the connector
 */
export function treeItem(isLast: boolean, content: string): string {
  const connector = isLast ? ICONS.treeLast : ICONS.treeItem;
  return `  ${t.dim(connector)} ${content}`;
}

/**
 * Format a status dot based on state.
 * Active/warning use filled dot, error uses ✗, inactive uses empty dot.
 */
export function statusDot(state: "active" | "inactive" | "error" | "warning"): string {
  switch (state) {
    case "active":  return t.green(ICONS.active);
    case "inactive": return t.dim(ICONS.inactive);
    case "error":   return t.error(ICONS.error);
    case "warning": return t.yellow(ICONS.active);
  }
}

/**
 * Format a key-value pair with aligned label.
 * Used for detail views (/session, /status, /config).
 *
 * @example kvPair("Model", "claude-sonnet-4") → "  Model       claude-sonnet-4"
 */
export function kvPair(label: string, value: string, labelWidth: number = 12): string {
  return `  ${t.dim(label.padEnd(labelWidth))}${value}`;
}

/**
 * Format a hint line at the bottom of a display.
 *
 * @example hint("Use", "/resume <slug>", "to switch sessions.")
 */
export function hint(prefix: string, command: string, suffix: string): string {
  return `  ${t.dim(prefix)} ${t.muted(command)} ${t.dim(suffix)}`;
}

/**
 * Format a tier/status badge.
 *
 * @example badge("PRO", "brand") → styled "PRO"
 */
export function badge(label: string, style: "brand" | "success" | "warning" | "error" | "muted"): string {
  const colorFn = {
    brand:   t.brand,
    success: t.green,
    warning: t.yellow,
    error:   t.red,
    muted:   t.dim,
  }[style];
  return colorFn(label);
}

// Legacy aliases — kept for backward compat with format.ts consumers
export { t as theme };
