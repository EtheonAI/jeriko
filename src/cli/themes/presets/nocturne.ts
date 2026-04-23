/**
 * Theme preset — Nocturne, dark.
 *
 * Neutral dark theme without brand violet. For users who prefer the classic
 * blue-on-slate IDE palette over Jeriko's Electric Indigo signature.
 * Brand role is filled by a cool blue (#60a5fa, blue-400).
 */

import type { Theme } from "../types.js";

export const nocturne: Theme = {
  id: "nocturne",
  displayName: "Nocturne",
  kind: "dark",
  colors: {
    brand:    "#60a5fa",
    brandDim: "#1e3a8a",
    text:     "#e5e7eb",
    muted:    "#9ca3af",
    dim:      "#4b5563",
    faint:    "#374151",
    tool:     "#93c5fd",
    success:  "#4ade80",
    error:    "#f87171",
    warning:  "#fbbf24",
    info:     "#818cf8",
    purple:   "#c084fc",
    teal:     "#2dd4bf",
    orange:   "#fb923c",
    pink:     "#f472b6",
    diffAdd:  "#4ade80",
    diffRm:   "#f87171",
    diffCtx:  "#4b5563",
  },
};
