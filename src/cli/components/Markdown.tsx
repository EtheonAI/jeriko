/**
 * Markdown — Ink component that renders markdown-formatted text.
 *
 * Wraps the pure `renderMarkdown` function from the rendering subsystem as
 * a React component for use in message rendering. Theme-reactive through
 * the cache keyed by (themeId, text-hash) — a theme switch transparently
 * produces new ANSI output on the next render.
 *
 * Usage:
 *   <Markdown text="**Hello** _world_" />
 */

import React from "react";
import { Text, Box } from "ink";
import { renderMarkdown } from "../rendering/index.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MarkdownProps {
  /** Raw markdown text to render. */
  text: string;
}

export const Markdown: React.FC<MarkdownProps> = ({ text }) => {
  if (!text) return null;

  const rendered = renderMarkdown(text);
  return (
    <Box overflowX="hidden">
      <Text>{rendered}</Text>
    </Box>
  );
};
