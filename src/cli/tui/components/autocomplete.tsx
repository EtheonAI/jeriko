/**
 * TUI Autocomplete Popup — Renders filtered slash command suggestions above the prompt.
 *
 * Positioned absolutely above the prompt input. Each item shows name + description,
 * with the selected item highlighted. Themed using useTheme() colors.
 */

import { For, Show } from "solid-js";
import { useTheme } from "../context/theme.js";
import type { AutocompleteState } from "../lib/autocomplete.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AutocompleteProps {
  /** Current autocomplete state (items, selection, visibility) */
  state: AutocompleteState;
}

export function Autocomplete(props: AutocompleteProps) {
  const theme = useTheme();

  return (
    <Show when={props.state.visible && props.state.items.length > 0}>
      <box
        flexDirection="column"
        backgroundColor={theme().backgroundMenu}
        border={["left", "right", "top", "bottom"] as any}
        borderColor={theme().border}
        maxHeight={10}
        marginBottom={1}
      >
        <For each={props.state.items}>
          {(item, index) => {
            const isSelected = () => index() === props.state.selectedIndex;
            return (
              <box
                paddingX={1}
                backgroundColor={isSelected() ? theme().backgroundElement : undefined}
              >
                <text>
                  <span style={{ fg: isSelected() ? theme().primary : theme().secondary, bold: isSelected() }}>
                    {item.name}
                  </span>
                  <span style={{ fg: theme().textMuted }}>
                    {"  "}{item.description}
                  </span>
                </text>
              </box>
            );
          }}
        </For>
      </box>
    </Show>
  );
}
