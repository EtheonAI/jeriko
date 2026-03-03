/**
 * CLI Theme — Color palette, semantic chalk wrappers, and visual helpers.
 *
 * Design system for Jeriko's terminal UI. Professional dark-terminal
 * aesthetic with high-contrast hierarchy and rich semantic tokens.
 *
 * Palette philosophy:
 *   - Brand: Warm amber (#e8a468) — distinctive but not loud
 *   - Primary text: Near-white (#e4e4e7) — high readability
 *   - Tool/code: Blue (#7aa2f7) — technical actions
 *   - Success/error/warning: Clear semantic colors
 *   - Muted layers: Three gray tiers for visual depth
 *
 * Chalk automatically respects NO_COLOR, FORCE_COLOR, and TERM=dumb.
 */

import chalk from "chalk";

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

/**
 * Centralized color constants for all CLI output.
 *
 * Four-tier text hierarchy:
 *   text    → primary content (messages, labels)
 *   muted   → secondary info (metadata, timestamps)
 *   dim     → tertiary chrome (borders, separators)
 *   faint   → barely visible (background accents)
 */
export const PALETTE = {
  // Brand
  brand:     "#e8a468",    // warm amber — headers, prompt marker, branding
  brandDim:  "#b07840",    // dimmed brand — inactive accents

  // Semantic
  blue:      "#7aa2f7",    // tool calls, code, links, assistant markers
  green:     "#73daca",    // success, connected, complete
  red:       "#f7768e",    // errors, disconnected, failed
  yellow:    "#e0af68",    // warnings, caution
  cyan:      "#89ddff",    // info, hints, spinners
  purple:    "#bb9af7",    // sub-agents, parallel tasks

  // Extended semantic
  teal:      "#2dd4bf",    // skills, interactive markers
  orange:    "#fb923c",    // cost warnings, budget alerts
  pink:      "#f472b6",    // highlights, special emphasis

  // Diff colors
  diffAdd:   "#73daca",    // added lines (matches green)
  diffRm:    "#f7768e",    // removed lines (matches red)
  diffCtx:   "#4b5563",    // context lines (matches dim)

  // Text hierarchy
  text:      "#e4e4e7",    // primary content
  muted:     "#9ca3af",    // secondary metadata
  dim:       "#4b5563",    // tertiary chrome, borders, separators
  faint:     "#374151",    // barely visible, background accents
} as const;

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
export const t = {
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
  success:   chalk.hex(PALETTE.green),
  error:     chalk.hex(PALETTE.red),
  warning:   chalk.hex(PALETTE.yellow),
  info:      chalk.hex(PALETTE.cyan),

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
} as const;

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

  // Section markers
  sparkle:    "✻",
  diamond:    "◆",
  arrow:      "▸",
  arrowDown:  "▾",
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
  half:       "▌",

  // Category icons (for help display)
  session:    "◈",
  model:      "◉",
  channel:    "◎",
  provider:   "◇",
  manage:     "◆",
  billing:    "◈",
  system:     "◉",
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
