/**
 * Keybinding Subsystem — help overlay.
 *
 * Renders every registered binding grouped by scope, using only Subsystem 1
 * primitives (Dialog, ListItem, Divider). No ad-hoc colors, no hardcoded
 * layout — everything flows through the design system so a theme switch
 * instantly restyles the overlay.
 *
 * The overlay is render-only: it does not own a scope or a dismiss handler.
 * Callers wrap it in their own dialog-state flow and register the dismiss
 * binding via useKeybinding("help.dismiss", ...).
 */

import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { Binding, BindingScope } from "./types.js";
import { BINDING_SCOPES } from "./types.js";
import { formatChord } from "./matcher.js";
import { Dialog } from "../ui/chrome/Dialog.js";
import { Column } from "../ui/layout/Column.js";
import { Divider } from "../ui/layout/Divider.js";

// ---------------------------------------------------------------------------
// Scope labels — used in the help overlay only
// ---------------------------------------------------------------------------

const SCOPE_LABELS: Readonly<Record<BindingScope, string>> = {
  global:   "Global",
  input:    "Input",
  messages: "Messages",
  wizard:   "Wizard",
  dialog:   "Dialog",
  help:     "Help",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface KeybindingHelpProps {
  readonly bindings: readonly Binding[];
  readonly width?: number | string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const KeybindingHelp: React.FC<KeybindingHelpProps> = ({
  bindings,
  width,
}) => {
  const grouped = useMemo(() => groupByScope(bindings), [bindings]);

  return (
    <Dialog
      intent="brand"
      title="Keybindings"
      width={width}
      hints={[{ keys: "Esc", action: "Close" }]}
    >
      <Column gap="sm">
        {BINDING_SCOPES.map((scope, idx) => {
          const entries = grouped.get(scope);
          if (entries === undefined || entries.length === 0) return null;
          return (
            <Box key={scope} flexDirection="column">
              {idx > 0 && <Divider tone="faint" />}
              <Text bold>{SCOPE_LABELS[scope]}</Text>
              <Box flexDirection="column" marginTop={1}>
                {entries.map((b) => (
                  <HelpRow key={b.id} binding={b} />
                ))}
              </Box>
            </Box>
          );
        })}
      </Column>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByScope(bindings: readonly Binding[]): Map<BindingScope, Binding[]> {
  const grouped = new Map<BindingScope, Binding[]>();
  for (const scope of BINDING_SCOPES) grouped.set(scope, []);
  for (const b of bindings) {
    const list = grouped.get(b.scope);
    if (list !== undefined) list.push(b);
  }
  // Stable sort by id within each group so help output is deterministic.
  for (const list of grouped.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return grouped;
}

// ---------------------------------------------------------------------------
// HelpRow — one binding line, chord left-aligned to a shared column width
// ---------------------------------------------------------------------------

const CHORD_COLUMN_WIDTH = 18;

interface HelpRowProps {
  readonly binding: Binding;
}

const HelpRow: React.FC<HelpRowProps> = ({ binding }) => {
  const chordText = formatChord(binding.chord).padEnd(CHORD_COLUMN_WIDTH);
  return (
    <Box flexDirection="row" gap={1}>
      <Text>{chordText}</Text>
      <Box flexGrow={1}>
        <Text>{binding.description}</Text>
      </Box>
    </Box>
  );
};
