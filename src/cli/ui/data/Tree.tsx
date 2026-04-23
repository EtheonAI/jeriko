/**
 * UI Subsystem — Tree primitives.
 *
 * <TreeNode> renders a tree-style row with the correct connector glyph based
 * on position. <TreeChild> renders the "child" indent for the node's body
 * (so a long second line lines up under the first).
 *
 * Rendering is glyph-based, not box-drawing, to match the existing SubAgent
 * output style:
 *
 *   ⏺ Orchestrating
 *   ├─ running: search_files
 *   │  └─ Searching for auth patterns…
 *   └─ done: read_file
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import type { Tone, TreePosition } from "../types.js";
import { resolveTone } from "../tokens.js";

// ---------------------------------------------------------------------------
// Glyphs — centralized so SubAgent (and anyone else) stops hardcoding them.
// ---------------------------------------------------------------------------

export const TREE_GLYPHS = {
  middle: "├─",
  last:   "└─",
  branch: "│ ",
  space:  "  ",
} as const;

// ---------------------------------------------------------------------------
// TreeNode
// ---------------------------------------------------------------------------

export interface TreeNodeProps {
  readonly position: TreePosition;
  readonly tone?: Tone;
  /** How many levels of indent precede this node. */
  readonly depth?: number;
  readonly children: React.ReactNode;
}

export const TreeNode: React.FC<TreeNodeProps> = ({
  position,
  tone = "dim",
  depth = 0,
  children,
}) => {
  const { colors } = useTheme();
  const color = resolveTone(tone, colors);
  const glyph = position === "last" ? TREE_GLYPHS.last : TREE_GLYPHS.middle;
  const prefix = TREE_GLYPHS.space.repeat(depth);
  return (
    <Box flexDirection="row">
      <Text color={color}>{`${prefix}${glyph} `}</Text>
      <Box flexGrow={1}>{children}</Box>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// TreeChild — rendered under a node's body (e.g. streaming preview)
// ---------------------------------------------------------------------------

export interface TreeChildProps {
  /** The parent node's position — determines if we draw a branch or a space. */
  readonly parentPosition: TreePosition;
  readonly tone?: Tone;
  readonly depth?: number;
  readonly children: React.ReactNode;
}

export const TreeChild: React.FC<TreeChildProps> = ({
  parentPosition,
  tone = "dim",
  depth = 0,
  children,
}) => {
  const { colors } = useTheme();
  const color = resolveTone(tone, colors);
  const parentGlyph = parentPosition === "last" ? TREE_GLYPHS.space : TREE_GLYPHS.branch;
  const prefix = TREE_GLYPHS.space.repeat(depth);
  return (
    <Box flexDirection="row">
      <Text color={color}>{`${prefix}${parentGlyph} `}</Text>
      <Box flexGrow={1}>{children}</Box>
    </Box>
  );
};
