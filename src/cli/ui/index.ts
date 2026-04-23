/**
 * UI Subsystem — public API barrel.
 *
 * Consumers import from `"../ui/index.js"` (or `"../../ui/index.js"` from
 * components/). Deep imports into `ui/chrome/Pane.js` etc. are allowed but
 * discouraged — this barrel is the supported surface.
 *
 * Subsystem scope: primitives only. No app-level logic, no reducer coupling.
 * Higher-level composites (PermissionDialog, WelcomeScreen, etc.) live in
 * subsequent subsystems and consume these primitives.
 */

// --- Types ------------------------------------------------------------------
export type {
  Tone,
  Intent,
  Size,
  BorderStyle,
  MainAxis,
  CrossAxis,
  MotionMode,
  MotionPreferences,
  Status,
  KeyHint,
  TreePosition,
} from "./types.js";

// --- Token resolvers --------------------------------------------------------
export {
  resolveTone,
  resolveIntent,
  toneFromIntent,
  resolveStatus,
  sizeToCells,
} from "./tokens.js";
export type { StatusGlyph } from "./tokens.js";

// --- Motion -----------------------------------------------------------------
export {
  useAnimationClock,
  subscribe as subscribeAnimationClock,
  getTick as getAnimationTick,
} from "./motion/clock.js";
export { MotionProvider, useMotion, detectMotionMode } from "./motion/context.js";
export type { MotionProviderProps } from "./motion/context.js";

// --- Layout -----------------------------------------------------------------
export { Row } from "./layout/Row.js";
export type { RowProps } from "./layout/Row.js";
export { Column } from "./layout/Column.js";
export type { ColumnProps } from "./layout/Column.js";
export { Gap } from "./layout/Gap.js";
export type { GapProps } from "./layout/Gap.js";
export { Divider } from "./layout/Divider.js";
export type { DividerProps } from "./layout/Divider.js";

// --- Chrome -----------------------------------------------------------------
export { Pane } from "./chrome/Pane.js";
export type { PaneProps } from "./chrome/Pane.js";
export { Dialog } from "./chrome/Dialog.js";
export type { DialogProps } from "./chrome/Dialog.js";
export { Badge } from "./chrome/Badge.js";
export type { BadgeProps } from "./chrome/Badge.js";
export { StatusIcon } from "./chrome/StatusIcon.js";
export type { StatusIconProps } from "./chrome/StatusIcon.js";
export { KeyboardHint } from "./chrome/KeyboardHint.js";
export type { KeyboardHintProps } from "./chrome/KeyboardHint.js";

// --- Motion primitives ------------------------------------------------------
export { Spinner, PRESET_BY_PHASE } from "./motion-primitives/Spinner.js";
export type { SpinnerProps, SpinnerPhase, SpinnerPreset } from "./motion-primitives/Spinner.js";
export { Shimmer } from "./motion-primitives/Shimmer.js";
export type { ShimmerProps } from "./motion-primitives/Shimmer.js";
export { FlashingChar } from "./motion-primitives/FlashingChar.js";
export type { FlashingCharProps } from "./motion-primitives/FlashingChar.js";
export { ProgressBar } from "./motion-primitives/ProgressBar.js";
export type { ProgressBarProps } from "./motion-primitives/ProgressBar.js";

// --- Data -------------------------------------------------------------------
export { ListItem } from "./data/ListItem.js";
export type { ListItemProps } from "./data/ListItem.js";
export { TreeNode, TreeChild, TREE_GLYPHS } from "./data/Tree.js";
export type { TreeNodeProps, TreeChildProps } from "./data/Tree.js";
export { CodeBadge } from "./data/CodeBadge.js";
export type { CodeBadgeProps } from "./data/CodeBadge.js";
