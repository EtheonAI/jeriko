/**
 * Themes — Color theme definition for the CLI.
 *
 * Single "jeriko" theme — clean dark palette with semantic color roles.
 *
 * Color roles:
 *   brand     — Primary brand accent (prompt, headers, highlights)
 *   text      — Primary content text
 *   muted     — Secondary metadata, descriptions
 *   dim       — Tertiary chrome, borders, separators
 *   tool      — Tool calls, code, technical elements
 *   success   — Connected, complete, passed
 *   error     — Failed, disconnected, errors
 *   warning   — Caution, approaching limits
 *   info      — Hints, spinners, informational
 *   purple    — Sub-agents, parallel tasks
 *   diffAdd   — Added lines in diffs
 *   diffRm    — Removed lines in diffs
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThemeColors {
  brand: string;
  brandDim: string;
  text: string;
  muted: string;
  dim: string;
  faint: string;
  tool: string;
  success: string;
  error: string;
  warning: string;
  info: string;
  purple: string;
  teal: string;
  orange: string;
  pink: string;
  diffAdd: string;
  diffRm: string;
  diffCtx: string;
}

export interface Theme {
  name: ThemePreset;
  displayName: string;
  type: "dark" | "light";
  colors: ThemeColors;
}

export type ThemePreset = "jeriko";

// ---------------------------------------------------------------------------
// Theme definition
// ---------------------------------------------------------------------------

export const THEMES: Record<ThemePreset, Theme> = {
  jeriko: {
    name: "jeriko",
    displayName: "Jeriko",
    type: "dark",
    colors: {
      brand:    "#c084fc",
      brandDim: "#9333ea",
      text:     "#f4f4f5",
      muted:    "#a1a1aa",
      dim:      "#52525b",
      faint:    "#3f3f46",
      tool:     "#c084fc",
      success:  "#4ade80",
      error:    "#f87171",
      warning:  "#fbbf24",
      info:     "#c084fc",
      purple:   "#a78bfa",
      teal:     "#2dd4bf",
      orange:   "#fb923c",
      pink:     "#f472b6",
      diffAdd:  "#4ade80",
      diffRm:   "#f87171",
      diffCtx:  "#52525b",
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Defaults and helpers
// ---------------------------------------------------------------------------

export const DEFAULT_THEME: ThemePreset = "jeriko";

/** Get the theme (only one — always returns jeriko). */
export function getTheme(_name?: string): Theme {
  return THEMES.jeriko;
}

/** Get all theme names for selection UI. */
export function listThemes(): Theme[] {
  return Object.values(THEMES);
}
