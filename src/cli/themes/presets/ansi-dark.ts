/**
 * Theme preset — ANSI Dark.
 *
 * Compatibility theme for 16-color terminals (or users who run chalk.level<3).
 * Colors are hex approximations of the standard ANSI 16 palette — each value
 * maps cleanly to an ANSI code after chalk downsampling.
 *
 * Reference values: https://en.wikipedia.org/wiki/ANSI_escape_code#3-bit_and_4-bit
 */

import type { Theme } from "../types.js";

export const ansiDark: Theme = {
  id: "ansi-dark",
  displayName: "ANSI Dark (16-color safe)",
  kind: "dark",
  colors: {
    brand:    "#5555ff", // bright blue
    brandDim: "#0000aa", // blue
    text:     "#aaaaaa", // white (ANSI 7)
    muted:    "#aaaaaa",
    dim:      "#555555", // bright black
    faint:    "#555555",
    tool:     "#55ffff", // bright cyan
    success:  "#55ff55", // bright green
    error:    "#ff5555", // bright red
    warning:  "#ffff55", // bright yellow
    info:     "#5555ff",
    purple:   "#ff55ff", // bright magenta
    teal:     "#00aaaa", // cyan
    orange:   "#aa5500", // yellow (non-bright)
    pink:     "#aa00aa", // magenta
    diffAdd:  "#55ff55",
    diffRm:   "#ff5555",
    diffCtx:  "#555555",
  },
};
