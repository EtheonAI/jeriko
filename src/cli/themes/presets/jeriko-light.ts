/**
 * Theme preset — Jeriko Light.
 *
 * Light companion of the jeriko theme. Brand hue shifts darker for contrast
 * against a light background (indigo-700 instead of indigo-400); hierarchy
 * is inverted (slate-900 for text, slate-300 for faint chrome).
 */

import type { Theme } from "../types.js";

export const jerikoLight: Theme = {
  id: "jeriko-light",
  displayName: "Jeriko Light",
  kind: "light",
  colors: {
    brand:    "#5B3FE0",
    brandDim: "#A78BFA",
    text:     "#0f172a",
    muted:    "#475569",
    dim:      "#94a3b8",
    faint:    "#cbd5e1",
    tool:     "#6D5BE0",
    success:  "#16a34a",
    error:    "#dc2626",
    warning:  "#d97706",
    info:     "#4F46E5",
    purple:   "#7c3aed",
    teal:     "#0d9488",
    orange:   "#ea580c",
    pink:     "#db2777",
    diffAdd:  "#16a34a",
    diffRm:   "#dc2626",
    diffCtx:  "#94a3b8",
  },
};
