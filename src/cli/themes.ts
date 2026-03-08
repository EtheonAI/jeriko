/**
 * Themes — Color theme definition for the CLI.
 *
 * Single "jeriko" theme — Dark Blue palette.
 *
 * Design rationale:
 *   - Dark blue (#1e3a5f) as brand: deep, authoritative, professional
 *   - Steel blue (#4a8cc7) as accent: lighter complement for interactive elements
 *   - Cool-toned slate hierarchy: cohesive temperature across all grays
 *   - All semantic colors maintain WCAG AAA (7:1+) on dark backgrounds
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
      // Brand — dark blue / steel blue
      brand:    "#5b9bd5",     // steel blue: readable on dark, professional
      brandDim: "#1e3a5f",     // deep navy: headers, subtle accents

      // Text hierarchy — cool slate
      text:     "#e2e8f0",     // slate-200: bright, easy to read
      muted:    "#94a3b8",     // slate-400: secondary text
      dim:      "#475569",     // slate-600: borders, separators
      faint:    "#334155",     // slate-700: very subtle chrome

      // Semantic — tool calls
      tool:     "#5b9bd5",     // matches brand for consistency

      // Status — universal colors
      success:  "#4ade80",     // green-400: universally understood
      error:    "#f87171",     // red-400: high-urgency
      warning:  "#fbbf24",     // amber-400: caution
      info:     "#7dd3fc",     // sky-300: light blue, complements brand

      // Accent palette
      purple:   "#a78bfa",     // violet-400: sub-agents
      teal:     "#2dd4bf",     // teal-400
      orange:   "#fb923c",     // orange-400
      pink:     "#f472b6",     // pink-400

      // Diff
      diffAdd:  "#4ade80",     // matches success
      diffRm:   "#f87171",     // matches error
      diffCtx:  "#475569",     // matches dim
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
