/**
 * CLI Theme — Color palette and semantic chalk wrappers.
 *
 * Design system for Jeriko's terminal UI. Professional dark-terminal
 * aesthetic with high-contrast hierarchy.
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
 * Three-tier text hierarchy:
 *   text    → primary content (messages, labels)
 *   muted   → secondary info (metadata, timestamps)
 *   dim     → tertiary chrome (borders, separators)
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

  // Semantic aliases (used throughout components)
  success:   chalk.hex(PALETTE.green),
  error:     chalk.hex(PALETTE.red),
  warning:   chalk.hex(PALETTE.yellow),
  info:      chalk.hex(PALETTE.cyan),

  // Text hierarchy
  text:      chalk.hex(PALETTE.text),
  muted:     chalk.hex(PALETTE.muted),
  dim:       chalk.hex(PALETTE.dim),
  faint:     chalk.hex(PALETTE.faint),

  // Emphasis
  bold:      chalk.bold,
  header:    chalk.hex(PALETTE.text).bold,
} as const;

// Legacy aliases — kept for backward compat with format.ts consumers
export { t as theme };
