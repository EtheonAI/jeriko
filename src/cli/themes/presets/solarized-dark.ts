/**
 * Theme preset — Solarized Dark.
 *
 * Ethan Schoonover's Solarized palette, dark variant. Uses the canonical
 * base0x / accent colors exactly as defined in the original spec. Brand
 * role filled by Solarized blue.
 *
 * Reference: https://ethanschoonover.com/solarized/
 */

import type { Theme } from "../types.js";

export const solarizedDark: Theme = {
  id: "solarized-dark",
  displayName: "Solarized Dark",
  kind: "dark",
  colors: {
    brand:    "#268bd2", // blue
    brandDim: "#073642", // base02
    text:     "#93a1a1", // base1
    muted:    "#839496", // base0
    dim:      "#586e75", // base01
    faint:    "#073642", // base02
    tool:     "#2aa198", // cyan
    success:  "#859900", // green
    error:    "#dc322f", // red
    warning:  "#b58900", // yellow
    info:     "#268bd2", // blue
    purple:   "#6c71c4", // violet
    teal:     "#2aa198", // cyan
    orange:   "#cb4b16", // orange
    pink:     "#d33682", // magenta
    diffAdd:  "#859900",
    diffRm:   "#dc322f",
    diffCtx:  "#586e75",
  },
};
