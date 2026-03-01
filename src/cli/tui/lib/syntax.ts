/**
 * TUI Syntax Style — Shared syntax highlighting configuration for
 * code blocks and markdown rendering.
 *
 * Uses @opentui/core's SyntaxStyle with the theme-aligned color palette.
 */

import { SyntaxStyle, RGBA } from "@opentui/core";

/**
 * Create a SyntaxStyle instance with Jeriko's dark theme colors.
 * Lazily instantiated since SyntaxStyle depends on native rendering context.
 */
let _syntaxStyle: SyntaxStyle | null = null;

export function getSyntaxStyle(): SyntaxStyle {
  if (!_syntaxStyle) {
    _syntaxStyle = SyntaxStyle.fromStyles({
      keyword:       { fg: RGBA.fromHex("#fab283"), bold: true },
      string:        { fg: RGBA.fromHex("#9ece6a") },
      comment:       { fg: RGBA.fromHex("#808080"), italic: true },
      number:        { fg: RGBA.fromHex("#9d7cd8") },
      function:      { fg: RGBA.fromHex("#5c9cf5") },
      variable:      { fg: RGBA.fromHex("#eeeeee") },
      operator:      { fg: RGBA.fromHex("#fab283") },
      punctuation:   { fg: RGBA.fromHex("#808080") },
      type:          { fg: RGBA.fromHex("#7dcfff") },
      constant:      { fg: RGBA.fromHex("#e0af68") },
      tag:           { fg: RGBA.fromHex("#f7768e") },
      attribute:     { fg: RGBA.fromHex("#fab283") },
      property:      { fg: RGBA.fromHex("#5c9cf5") },
    });
  }
  return _syntaxStyle;
}
