/**
 * Themes — Color theme definitions for the CLI.
 *
 * 12 curated themes (dark + light) with semantic color roles.
 * Each theme maps semantic roles to hex colors, enabling
 * consistent styling across all components via ThemeContext.
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

export type ThemePreset =
  | "jeriko"
  | "tokyo-night"
  | "dracula"
  | "minimal";

// ---------------------------------------------------------------------------
// Theme definitions
// ---------------------------------------------------------------------------

export const THEMES: Record<ThemePreset, Theme> = {
  jeriko: {
    name: "jeriko",
    displayName: "Jeriko",
    type: "dark",
    colors: {
      brand:    "#38bdf8",
      brandDim: "#0284c7",
      text:     "#f4f4f5",
      muted:    "#a1a1aa",
      dim:      "#52525b",
      faint:    "#3f3f46",
      tool:     "#38bdf8",
      success:  "#4ade80",
      error:    "#f87171",
      warning:  "#fbbf24",
      info:     "#38bdf8",
      purple:   "#a78bfa",
      teal:     "#2dd4bf",
      orange:   "#fb923c",
      pink:     "#f472b6",
      diffAdd:  "#4ade80",
      diffRm:   "#f87171",
      diffCtx:  "#52525b",
    },
  },

  "tokyo-night": {
    name: "tokyo-night",
    displayName: "Tokyo Night",
    type: "dark",
    colors: {
      brand:    "#bb9af7",
      brandDim: "#7a6aaf",
      text:     "#c0caf5",
      muted:    "#565f89",
      dim:      "#3b4261",
      faint:    "#292e42",
      tool:     "#7dcfff",
      success:  "#9ece6a",
      error:    "#f7768e",
      warning:  "#e0af68",
      info:     "#2ac3de",
      purple:   "#bb9af7",
      teal:     "#73daca",
      orange:   "#ff9e64",
      pink:     "#f7768e",
      diffAdd:  "#9ece6a",
      diffRm:   "#f7768e",
      diffCtx:  "#3b4261",
    },
  },

  dracula: {
    name: "dracula",
    displayName: "Dracula",
    type: "dark",
    colors: {
      brand:    "#bd93f9",
      brandDim: "#9571d1",
      text:     "#f8f8f2",
      muted:    "#6272a4",
      dim:      "#44475a",
      faint:    "#383a59",
      tool:     "#8be9fd",
      success:  "#50fa7b",
      error:    "#ff5555",
      warning:  "#f1fa8c",
      info:     "#8be9fd",
      purple:   "#bd93f9",
      teal:     "#8be9fd",
      orange:   "#ffb86c",
      pink:     "#ff79c6",
      diffAdd:  "#50fa7b",
      diffRm:   "#ff5555",
      diffCtx:  "#44475a",
    },
  },

  minimal: {
    name: "minimal",
    displayName: "Minimal",
    type: "dark",
    colors: {
      brand:    "#ffffff",
      brandDim: "#b0b0b0",
      text:     "#e0e0e0",
      muted:    "#808080",
      dim:      "#505050",
      faint:    "#303030",
      tool:     "#a0a0ff",
      success:  "#80e080",
      error:    "#ff8080",
      warning:  "#e0c080",
      info:     "#80c0e0",
      purple:   "#c0a0e0",
      teal:     "#80c0c0",
      orange:   "#e0a080",
      pink:     "#e080c0",
      diffAdd:  "#80e080",
      diffRm:   "#ff8080",
      diffCtx:  "#505050",
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Defaults and helpers
// ---------------------------------------------------------------------------

export const DEFAULT_THEME: ThemePreset = "jeriko";

/** Get a theme by name, falling back to jeriko default. */
export function getTheme(name: string): Theme {
  return THEMES[name as ThemePreset] ?? THEMES.jeriko;
}

/** Get all theme names for selection UI. */
export function listThemes(): Theme[] {
  return Object.values(THEMES);
}
