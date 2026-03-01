/**
 * TUI Borders — Reusable border definitions for the split-border visual style.
 *
 * The signature "┃" left border with "╹" bottom cap is used throughout
 * the interface for messages, prompts, and panels.
 */

// ---------------------------------------------------------------------------
// Border character sets
// ---------------------------------------------------------------------------

/** Empty border — no visible characters, used as a base for partial overrides. */
export const EmptyBorderChars = {
  topLeft:     "",
  bottomLeft:  "",
  vertical:    "",
  topRight:    "",
  bottomRight: "",
  horizontal:  " ",
  bottomT:     "",
  topT:        "",
  cross:       "",
  leftT:       "",
  rightT:      "",
} as const;

/** Split border — thick vertical bar with bottom cap. */
export const SplitBorderChars = {
  ...EmptyBorderChars,
  vertical:   "┃",
  bottomLeft: "╹",
} as const;

/** Thin split border — for subtler separators. */
export const ThinSplitBorderChars = {
  ...EmptyBorderChars,
  vertical: "│",
} as const;

// ---------------------------------------------------------------------------
// Border config presets (for box props)
// ---------------------------------------------------------------------------

/** Left-only split border — the primary visual pattern. */
export const SplitBorder = {
  border: ["left" as const],
  customBorderChars: SplitBorderChars,
} as const;

/** Left + right split border — for contained panels like toasts. */
export const ContainedSplitBorder = {
  border: ["left" as const, "right" as const],
  customBorderChars: SplitBorderChars,
} as const;

/** Thin left border — for less prominent elements. */
export const ThinBorder = {
  border: ["left" as const],
  customBorderChars: ThinSplitBorderChars,
} as const;
