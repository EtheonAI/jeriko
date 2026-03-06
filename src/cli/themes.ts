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
  | "synthwave"
  | "nord"
  | "dracula"
  | "catppuccin"
  | "gruvbox"
  | "solarized"
  | "rose-pine"
  | "forest"
  | "ocean"
  | "minimal";

// ---------------------------------------------------------------------------
// Theme definitions
// ---------------------------------------------------------------------------

export const THEMES: Record<ThemePreset, Theme> = {
  jeriko: {
    name: "jeriko",
    displayName: "Jeriko (Default)",
    type: "dark",
    colors: {
      brand:    "#e8a468",
      brandDim: "#b07840",
      text:     "#e4e4e7",
      muted:    "#9ca3af",
      dim:      "#4b5563",
      faint:    "#374151",
      tool:     "#7aa2f7",
      success:  "#73daca",
      error:    "#f7768e",
      warning:  "#e0af68",
      info:     "#89ddff",
      purple:   "#bb9af7",
      teal:     "#2dd4bf",
      orange:   "#fb923c",
      pink:     "#f472b6",
      diffAdd:  "#73daca",
      diffRm:   "#f7768e",
      diffCtx:  "#4b5563",
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

  synthwave: {
    name: "synthwave",
    displayName: "Synthwave '84",
    type: "dark",
    colors: {
      brand:    "#ff006a",
      brandDim: "#cc0054",
      text:     "#f8f8f2",
      muted:    "#8a7ca8",
      dim:      "#5a4f6a",
      faint:    "#3b2d4f",
      tool:     "#00d9ff",
      success:  "#a6e22e",
      error:    "#ff3838",
      warning:  "#ffb86c",
      info:     "#66d9ef",
      purple:   "#e070e0",
      teal:     "#72f1b8",
      orange:   "#ff8b39",
      pink:     "#ff79c6",
      diffAdd:  "#a6e22e",
      diffRm:   "#ff3838",
      diffCtx:  "#5a4f6a",
    },
  },

  nord: {
    name: "nord",
    displayName: "Nord Frost",
    type: "dark",
    colors: {
      brand:    "#88c0d0",
      brandDim: "#6a9aad",
      text:     "#eceff4",
      muted:    "#4c566a",
      dim:      "#3b4252",
      faint:    "#2e3440",
      tool:     "#8fbcbb",
      success:  "#a3be8c",
      error:    "#bf616a",
      warning:  "#ebcb8b",
      info:     "#5e81ac",
      purple:   "#b48ead",
      teal:     "#8fbcbb",
      orange:   "#d08770",
      pink:     "#b48ead",
      diffAdd:  "#a3be8c",
      diffRm:   "#bf616a",
      diffCtx:  "#3b4252",
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

  catppuccin: {
    name: "catppuccin",
    displayName: "Catppuccin Mocha",
    type: "dark",
    colors: {
      brand:    "#cba6f7",
      brandDim: "#a68ad4",
      text:     "#cdd6f4",
      muted:    "#6c7086",
      dim:      "#45475a",
      faint:    "#313244",
      tool:     "#89dceb",
      success:  "#a6e3a1",
      error:    "#f38ba8",
      warning:  "#f9e2af",
      info:     "#74c7ec",
      purple:   "#cba6f7",
      teal:     "#94e2d5",
      orange:   "#fab387",
      pink:     "#f5c2e7",
      diffAdd:  "#a6e3a1",
      diffRm:   "#f38ba8",
      diffCtx:  "#45475a",
    },
  },

  gruvbox: {
    name: "gruvbox",
    displayName: "Gruvbox Dark",
    type: "dark",
    colors: {
      brand:    "#fe8019",
      brandDim: "#d65d0e",
      text:     "#ebdbb2",
      muted:    "#928374",
      dim:      "#504945",
      faint:    "#3c3836",
      tool:     "#83a598",
      success:  "#b8bb26",
      error:    "#fb4934",
      warning:  "#fabd2f",
      info:     "#83a598",
      purple:   "#d3869b",
      teal:     "#8ec07c",
      orange:   "#fe8019",
      pink:     "#d3869b",
      diffAdd:  "#b8bb26",
      diffRm:   "#fb4934",
      diffCtx:  "#504945",
    },
  },

  solarized: {
    name: "solarized",
    displayName: "Solarized Dark",
    type: "dark",
    colors: {
      brand:    "#268bd2",
      brandDim: "#1e6fa8",
      text:     "#839496",
      muted:    "#586e75",
      dim:      "#073642",
      faint:    "#002b36",
      tool:     "#2aa198",
      success:  "#859900",
      error:    "#dc322f",
      warning:  "#b58900",
      info:     "#268bd2",
      purple:   "#6c71c4",
      teal:     "#2aa198",
      orange:   "#cb4b16",
      pink:     "#d33682",
      diffAdd:  "#859900",
      diffRm:   "#dc322f",
      diffCtx:  "#073642",
    },
  },

  "rose-pine": {
    name: "rose-pine",
    displayName: "Rose Pine",
    type: "dark",
    colors: {
      brand:    "#c4a7e7",
      brandDim: "#9e82c0",
      text:     "#e0def4",
      muted:    "#6e6a86",
      dim:      "#403d52",
      faint:    "#26233a",
      tool:     "#9ccfd8",
      success:  "#31748f",
      error:    "#eb6f92",
      warning:  "#f6c177",
      info:     "#9ccfd8",
      purple:   "#c4a7e7",
      teal:     "#9ccfd8",
      orange:   "#ebbcba",
      pink:     "#eb6f92",
      diffAdd:  "#31748f",
      diffRm:   "#eb6f92",
      diffCtx:  "#403d52",
    },
  },

  forest: {
    name: "forest",
    displayName: "Forest Night",
    type: "dark",
    colors: {
      brand:    "#a7c080",
      brandDim: "#8aa066",
      text:     "#d3c6aa",
      muted:    "#859289",
      dim:      "#4f5b58",
      faint:    "#374145",
      tool:     "#83c092",
      success:  "#a7c080",
      error:    "#e67e80",
      warning:  "#dbbc7f",
      info:     "#7fbbb3",
      purple:   "#d699b6",
      teal:     "#83c092",
      orange:   "#e69875",
      pink:     "#d699b6",
      diffAdd:  "#a7c080",
      diffRm:   "#e67e80",
      diffCtx:  "#4f5b58",
    },
  },

  ocean: {
    name: "ocean",
    displayName: "Deep Ocean",
    type: "dark",
    colors: {
      brand:    "#26c6da",
      brandDim: "#1e9aab",
      text:     "#b3e5fc",
      muted:    "#78909c",
      dim:      "#37474f",
      faint:    "#263238",
      tool:     "#4fc3f7",
      success:  "#66bb6a",
      error:    "#ef5350",
      warning:  "#ffa726",
      info:     "#29b6f6",
      purple:   "#ab47bc",
      teal:     "#26a69a",
      orange:   "#ff7043",
      pink:     "#ec407a",
      diffAdd:  "#66bb6a",
      diffRm:   "#ef5350",
      diffCtx:  "#37474f",
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
