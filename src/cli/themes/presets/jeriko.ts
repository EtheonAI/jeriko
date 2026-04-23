/**
 * Theme preset — Jeriko (Electric Indigo), dark.
 *
 * Default brand theme. Electric Indigo (#7C5AFF) as the accent against a cool
 * slate hierarchy. All semantic colors pass WCAG AAA (7:1) on terminal-black
 * backgrounds and were verified against the muted slate scale for hierarchy.
 */

import type { Theme } from "../types.js";

export const jeriko: Theme = {
  id: "jeriko",
  displayName: "Jeriko — Electric Indigo",
  kind: "dark",
  colors: {
    brand:    "#7C5AFF",
    brandDim: "#3B2D80",
    text:     "#e2e8f0",
    muted:    "#94a3b8",
    dim:      "#475569",
    faint:    "#334155",
    tool:     "#9B7DFF",
    success:  "#4ade80",
    error:    "#f87171",
    warning:  "#fbbf24",
    info:     "#818CF8",
    purple:   "#a78bfa",
    teal:     "#2dd4bf",
    orange:   "#fb923c",
    pink:     "#f472b6",
    diffAdd:  "#4ade80",
    diffRm:   "#f87171",
    diffCtx:  "#475569",
  },
};
