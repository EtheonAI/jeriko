/**
 * UI Subsystem — shared type contracts.
 *
 * Every primitive in `src/cli/ui/` consumes these types.
 * No ad-hoc string unions in component props; if it's a concept, it lives here.
 *
 * Design rules:
 *   - Tone maps 1:1 to a theme color token. Never hardcoded hex.
 *   - Intent is a smaller semantic subset (status-ish primitives use it).
 *   - Size/BorderStyle are closed literal unions (no arbitrary strings).
 *   - MotionMode governs every animated primitive.
 */

// ---------------------------------------------------------------------------
// Tone — semantic color role, resolved via ThemeColors
// ---------------------------------------------------------------------------

/** Every visible color in the UI resolves through one of these tokens. */
export type Tone =
  | "brand"
  | "brandDim"
  | "text"
  | "muted"
  | "dim"
  | "faint"
  | "tool"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "purple"
  | "teal"
  | "orange"
  | "pink";

/**
 * Intent — reduced semantic palette for status-like elements.
 * Prefer over Tone when the primitive conveys meaning (pass/fail/caution).
 */
export type Intent = "brand" | "success" | "error" | "warning" | "info" | "muted";

// ---------------------------------------------------------------------------
// Sizing and borders
// ---------------------------------------------------------------------------

/** Sizing scale. Primitives map this to padding/gap/margin in cells. */
export type Size = "sm" | "md" | "lg";

/**
 * Border style — maps 1:1 onto Ink's borderStyle prop.
 * Ink accepts: single | double | round | bold | classic (plus a few composites).
 * We expose the five that read well in every terminal.
 */
export type BorderStyle = "single" | "double" | "round" | "bold" | "classic";

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

/** Main-axis alignment (flexbox mapping). */
export type MainAxis = "start" | "center" | "end" | "space-between" | "space-around";

/** Cross-axis alignment (flexbox mapping). */
export type CrossAxis = "start" | "center" | "end" | "stretch";

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * Motion policy:
 *   - "full":    all animations play
 *   - "reduced": animations replaced with static indicators (e.g., spinner → ●)
 *   - "none":    no spinners, no shimmer, no pulses — frozen frames only
 */
export type MotionMode = "full" | "reduced" | "none";

/** Motion preferences consumed via MotionProvider + useMotion(). */
export interface MotionPreferences {
  readonly mode: MotionMode;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Status the StatusIcon primitive can express. */
export type Status = "success" | "error" | "warning" | "info" | "pending" | "running";

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

/** A single keyboard hint label (used by KeyboardHint). */
export interface KeyHint {
  /** Display label for the key, e.g. "Enter", "Ctrl+C", "↑↓". */
  readonly keys: string;
  /** Action name, e.g. "Submit", "Cancel". */
  readonly action: string;
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

/** Position of a node in a rendered tree; controls connector glyph. */
export type TreePosition = "middle" | "last";
