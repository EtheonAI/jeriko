/**
 * UI Subsystem — semantic token resolution.
 *
 * Maps Tone / Intent / Status / Size to concrete values from the active theme.
 * Primitives call these helpers; they never index into ThemeColors directly
 * so that the mapping is centralized, auditable, and themable.
 *
 * Invariants:
 *   - No hardcoded hex strings outside the theme registry.
 *   - One source of truth per concept. Adding a new tone means extending
 *     the Tone union AND this file — the type system enforces both.
 */

import type { ThemeColors } from "../themes/index.js";
import type { Intent, Size, Status, Tone } from "./types.js";

// ---------------------------------------------------------------------------
// Tone → color
// ---------------------------------------------------------------------------

/**
 * Resolve a tone token against a palette.
 * Exhaustive switch — compiler enforces coverage for every Tone.
 */
export function resolveTone(tone: Tone, colors: ThemeColors): string {
  switch (tone) {
    case "brand":    return colors.brand;
    case "brandDim": return colors.brandDim;
    case "text":     return colors.text;
    case "muted":    return colors.muted;
    case "dim":      return colors.dim;
    case "faint":    return colors.faint;
    case "tool":     return colors.tool;
    case "success":  return colors.success;
    case "error":    return colors.error;
    case "warning":  return colors.warning;
    case "info":     return colors.info;
    case "purple":   return colors.purple;
    case "teal":     return colors.teal;
    case "orange":   return colors.orange;
    case "pink":     return colors.pink;
  }
}

// ---------------------------------------------------------------------------
// Intent → tone
// ---------------------------------------------------------------------------

/** Intent is a semantic alias that maps to a Tone. */
export function toneFromIntent(intent: Intent): Tone {
  switch (intent) {
    case "brand":   return "brand";
    case "success": return "success";
    case "error":   return "error";
    case "warning": return "warning";
    case "info":    return "info";
    case "muted":   return "muted";
  }
}

export function resolveIntent(intent: Intent, colors: ThemeColors): string {
  return resolveTone(toneFromIntent(intent), colors);
}

// ---------------------------------------------------------------------------
// Status → { icon, tone }
// ---------------------------------------------------------------------------

export interface StatusGlyph {
  readonly icon: string;
  readonly tone: Tone;
}

/** Map a status to its canonical glyph + color. Single source of truth. */
export function resolveStatus(status: Status): StatusGlyph {
  switch (status) {
    case "success": return { icon: "✓", tone: "success" };
    case "error":   return { icon: "✗", tone: "error" };
    case "warning": return { icon: "⚠", tone: "warning" };
    case "info":    return { icon: "ℹ", tone: "info" };
    case "pending": return { icon: "○", tone: "dim" };
    case "running": return { icon: "●", tone: "info" };
  }
}

// ---------------------------------------------------------------------------
// Size → cells
// ---------------------------------------------------------------------------

/** Convert a size token to a gap/padding in terminal cells. */
export function sizeToCells(size: Size): 1 | 2 | 3 {
  switch (size) {
    case "sm": return 1;
    case "md": return 2;
    case "lg": return 3;
  }
}
