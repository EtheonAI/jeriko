/**
 * Theme Subsystem — type contracts.
 *
 * A Theme is a named palette plus metadata (kind, display name). Built-in
 * themes are known at compile time via the `BuiltinThemeId` union; user code
 * can still pass arbitrary string ids through `ThemeId` without widening the
 * built-in surface.
 *
 * The shape of `ThemeColors` is the covenant: every primitive in the UI
 * Subsystem resolves colors through these keys, and every theme is required
 * to supply every key. The registry enforces this structurally.
 */

// ---------------------------------------------------------------------------
// ThemeKind
// ---------------------------------------------------------------------------

/**
 * Visual family of a theme. Drives OSC 11 auto-detection: a dark-mode
 * terminal bg will prefer a theme with kind "dark" or "high-contrast",
 * a light-mode terminal will prefer "light".
 */
export type ThemeKind = "dark" | "light" | "high-contrast";

// ---------------------------------------------------------------------------
// ThemeColors — the covenant between themes and primitives
// ---------------------------------------------------------------------------

export interface ThemeColors {
  /** Primary brand accent (prompt, headers, highlights). */
  readonly brand: string;
  /** Deep variant of brand — headers, subtle accents. */
  readonly brandDim: string;
  /** Primary content text. */
  readonly text: string;
  /** Secondary metadata, descriptions. */
  readonly muted: string;
  /** Tertiary chrome, borders, separators. */
  readonly dim: string;
  /** Very subtle chrome — below dim. */
  readonly faint: string;
  /** Tool calls, code, technical elements. */
  readonly tool: string;
  /** Connected, complete, passed. */
  readonly success: string;
  /** Failed, disconnected, errors. */
  readonly error: string;
  /** Caution, approaching limits. */
  readonly warning: string;
  /** Hints, spinners, informational. */
  readonly info: string;
  /** Sub-agents, parallel tasks. */
  readonly purple: string;
  /** Secondary accent. */
  readonly teal: string;
  /** Secondary accent. */
  readonly orange: string;
  /** Secondary accent. */
  readonly pink: string;
  /** Added lines in diffs. */
  readonly diffAdd: string;
  /** Removed lines in diffs. */
  readonly diffRm: string;
  /** Context lines in diffs. */
  readonly diffCtx: string;
}

// ---------------------------------------------------------------------------
// Theme identity
// ---------------------------------------------------------------------------

/**
 * Built-in theme ids. Extending this union is the one place the full list of
 * bundled themes is declared — adding a new preset file is a type error until
 * its id is added here.
 */
export type BuiltinThemeId =
  | "jeriko"
  | "jeriko-light"
  | "nocturne"
  | "solarized-dark"
  | "high-contrast"
  | "ansi-dark";

/**
 * Any theme id — built-in or user-registered. The `& {}` prevents TypeScript
 * from widening BuiltinThemeId to plain string while still accepting strings.
 */
export type ThemeId = BuiltinThemeId | (string & {});

/** Backward-compatible alias for existing consumers. */
export type ThemePreset = ThemeId;

// ---------------------------------------------------------------------------
// Theme + ThemeDescriptor
// ---------------------------------------------------------------------------

export interface Theme {
  readonly id: BuiltinThemeId | string;
  /** Display name shown in pickers ("Jeriko — Electric Indigo"). */
  readonly displayName: string;
  readonly kind: ThemeKind;
  readonly colors: ThemeColors;
}

/** Lightweight projection for listing UIs that don't need full colors. */
export interface ThemeDescriptor {
  readonly id: ThemeId;
  readonly displayName: string;
  readonly kind: ThemeKind;
}

/** Build a descriptor from a theme — single source of truth for the mapping. */
export function toDescriptor(theme: Theme): ThemeDescriptor {
  return { id: theme.id, displayName: theme.displayName, kind: theme.kind };
}
