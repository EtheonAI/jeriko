/**
 * Markdown — Ink component that renders markdown-formatted text.
 *
 * Wraps the pure lib/markdown.ts renderMarkdown function
 * as a React component for use in message rendering.
 *
 * Usage:
 *   <Markdown text="**Hello** _world_" />
 */

import React from "react";
import { Text, Box } from "ink";
import { renderMarkdown } from "../lib/markdown.js";

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
