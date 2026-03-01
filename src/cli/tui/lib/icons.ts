/**
 * TUI Tool Icons — Maps tool names to display icons and labels.
 *
 * Used by the ToolCall component to show recognizable glyphs
 * next to tool invocations in the message stream.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolIcon {
  /** Single-character glyph displayed in the tool header */
  icon: string;
  /** Human-readable label for the tool */
  label: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ICONS: Record<string, ToolIcon> = {
  bash:     { icon: "$",  label: "bash" },
  exec:     { icon: "$",  label: "exec" },
  read:     { icon: "→",  label: "read" },
  write:    { icon: "←",  label: "write" },
  edit:     { icon: "←",  label: "edit" },
  list:     { icon: "→",  label: "list" },
  search:   { icon: "✱",  label: "search" },
  grep:     { icon: "✱",  label: "search" },
  web:      { icon: "%",  label: "web" },
  browse:   { icon: "◈",  label: "browse" },
  delegate: { icon: "»",  label: "delegate" },
  parallel: { icon: "‖",  label: "parallel" },
};

const DEFAULT_ICON: ToolIcon = { icon: "•", label: "tool" };

/**
 * Look up the icon for a tool by name.
 * Falls back to a generic bullet icon for unknown tools.
 */
export function getToolIcon(toolName: string): ToolIcon {
  return ICONS[toolName] ?? DEFAULT_ICON;
}

/**
 * Get all registered tool icon entries.
 * Useful for tests and documentation.
 */
export function getAllToolIcons(): ReadonlyMap<string, ToolIcon> {
  return new Map(Object.entries(ICONS));
}
