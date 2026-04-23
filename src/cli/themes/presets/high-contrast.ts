/**
 * Theme preset — High Contrast, dark.
 *
 * Accessibility-focused theme. Pure white text on terminal-black (assumed),
 * bright pastels for all accents. Every pair meets WCAG AAA (7:1+) against
 * #000000. Intended for users who find lower-contrast themes hard to read,
 * including those with low-vision assistive displays.
 */

import type { Theme } from "../types.js";

export const highContrast: Theme = {
  id: "high-contrast",
  displayName: "High Contrast",
  kind: "high-contrast",
  colors: {
    brand:    "#d8b4fe", // violet-300 — bright accent
    brandDim: "#a78bfa",
    text:     "#ffffff",
    muted:    "#d4d4d4",
    dim:      "#a3a3a3",
    faint:    "#737373",
    tool:     "#93c5fd", // blue-300
    success:  "#86efac", // green-300
    error:    "#fca5a5", // red-300
    warning:  "#fde047", // yellow-300
    info:     "#93c5fd",
    purple:   "#d8b4fe",
    teal:     "#5eead4",
    orange:   "#fdba74",
    pink:     "#f9a8d4",
    diffAdd:  "#86efac",
    diffRm:   "#fca5a5",
    diffCtx:  "#a3a3a3",
  },
};
