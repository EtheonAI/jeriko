/**
 * TUI Prompt — Input component with colored left border, agent info, and autocomplete.
 *
 * Uses a textarea with SplitBorder left bar. Displays agent name and
 * model below the input when not streaming. Shows a spinner during streaming.
 * When the user types "/" at the start of input, an autocomplete popup appears
 * above the textarea with filtered slash command suggestions.
 *
 * IMPORTANT: @opentui/core's onContentChange fires with a ContentChangeEvent
 * (empty object), NOT a string — despite what @opentui/solid's type declares.
 * The actual text must be read from the TextareaRenderable ref's plainText
 * getter. See EditBufferRenderable.d.ts line 13 and Textarea.d.ts.
 */

import { createSignal, Show } from "solid-js";
import type { TextareaRenderable, KeyEvent } from "@opentui/core";
import { useTheme } from "../context/theme.js";
import { useAgent } from "../context/agent.js";
import { useCommand } from "../context/command.js";
import { SplitBorderChars } from "./border.js";
import { Spinner } from "./spinner.js";
import { Autocomplete } from "./autocomplete.js";
import {
  shouldShowAutocomplete,
  filterCommands,
  type AutocompleteItem,
  type AutocompleteState,
} from "../lib/autocomplete.js";

// ---------------------------------------------------------------------------
// Key bindings — Enter submits, Meta+Enter inserts newline
// ---------------------------------------------------------------------------

const PROMPT_KEY_BINDINGS = [
  { name: "return", action: "submit" },
  { name: "return", meta: true, action: "newline" },
  { name: "left", action: "move-left" },
  { name: "right", action: "move-right" },
  { name: "up", action: "move-up" },
  { name: "down", action: "move-down" },
  { name: "backspace", action: "backspace" },
  { name: "delete", action: "delete" },
  { name: "home", action: "buffer-home" },
  { name: "end", action: "buffer-end" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PromptProps {
  /** Called when the user submits a message */
  onSubmit: (text: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Whether the prompt should be focused (default: true) */
  focused?: boolean;
}

export function Prompt(props: PromptProps) {
  const theme = useTheme();
  const agent = useAgent();
  const commands = useCommand();
  const [text, setText] = createSignal("");
  const [acSelectedIdx, setAcSelectedIdx] = createSignal(0);
  const [acDismissed, setAcDismissed] = createSignal(false);
  let inputRef: TextareaRenderable | undefined;

  // -----------------------------------------------------------------------
  // Autocomplete state (derived from text signal)
  // -----------------------------------------------------------------------

  const acItems = (): AutocompleteItem[] => {
    if (acDismissed()) return [];
    const input = text();
    if (!shouldShowAutocomplete(input)) return [];
    return filterCommands(input, commands.getCommands());
  };

  const acVisible = () => acItems().length > 0;

  const acState = (): AutocompleteState => ({
    items: acItems(),
    selectedIndex: acSelectedIdx(),
    visible: acVisible(),
  });

  // -----------------------------------------------------------------------
  // Content change — sync text signal, reset autocomplete selection
  // -----------------------------------------------------------------------

  /**
   * Sync the text signal from the textarea ref.
   *
   * @opentui/solid declares onContentChange as (value: string) => void,
   * but the runtime actually passes a ContentChangeEvent (empty object)
   * through the core's EditBufferRenderable setter. The ref's plainText
   * getter is the only reliable source of the current input text.
   */
  const handleContentChange = () => {
    if (inputRef) setText(inputRef.plainText);
    setAcSelectedIdx(0);
    setAcDismissed(false);
  };

  // -----------------------------------------------------------------------
  // Key interception — intercept keys when autocomplete is visible
  // -----------------------------------------------------------------------

  const handleKeyDown = (event: KeyEvent) => {
    if (!acVisible()) return;

    const items = acItems();

    if (event.name === "up") {
      event.preventDefault();
      setAcSelectedIdx((i) => (i > 0 ? i - 1 : items.length - 1));
    } else if (event.name === "down") {
      event.preventDefault();
      setAcSelectedIdx((i) => (i < items.length - 1 ? i + 1 : 0));
    } else if (event.name === "tab" || event.name === "return") {
      // Accept the selected autocomplete item
      const idx = acSelectedIdx();
      const selected = items[idx];
      if (selected && inputRef) {
        event.preventDefault();
        // Replace input with the selected command + trailing space
        inputRef.clear();
        const insertion = selected.name + " ";
        // Use insertText if available (EditBufferRenderable API)
        if (typeof (inputRef as any).insertText === "function") {
          (inputRef as any).insertText(insertion);
        }
        setText(insertion);
        setAcDismissed(true);
      }
    } else if (event.name === "escape") {
      event.preventDefault();
      setAcDismissed(true);
    }
  };

  // -----------------------------------------------------------------------
  // Submit — submit text to parent handler
  // -----------------------------------------------------------------------

  /**
   * Submit the current input to the parent handler.
   * Guards: ref must exist, text must be non-empty, must not be streaming.
   */
  const handleSubmit = () => {
    if (!inputRef) return;
    const value = inputRef.plainText.trim();
    if (!value || agent.isStreaming()) return;

    props.onSubmit(value);
    inputRef.clear();
    setText("");
  };

  const borderColor = () =>
    agent.isStreaming() ? theme().borderActive : theme().primary;

  // Focus is managed by the `focused` prop on <textarea>, which
  // @opentui/solid maps to node.focus()/node.blur() reactively.
  // When streaming starts, <Show> unmounts the textarea; when streaming
  // ends, <Show> remounts it and the `focused` prop re-applies focus.

  return (
    <box flexDirection="column">
      {/* Autocomplete popup — rendered above the prompt input */}
      <Autocomplete state={acState()} />

      <box
        border={["left"] as any}
        borderColor={borderColor()}
        customBorderChars={SplitBorderChars}
      >
        <box
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={theme().backgroundElement}
          flexGrow={1}
        >
          <Show
            when={!agent.isStreaming()}
            fallback={
              <box paddingY={0}>
                <Spinner
                  color={theme().secondary}
                  label="Thinking..."
                  labelColor={theme().textMuted}
                />
              </box>
            }
          >
            <textarea
              ref={(r: TextareaRenderable) => { inputRef = r; }}
              focused={props.focused ?? true}
              placeholder={props.placeholder ?? "Send a message..."}
              textColor={theme().text}
              focusedTextColor={theme().text}
              minHeight={1}
              maxHeight={6}
              keyBindings={PROMPT_KEY_BINDINGS as unknown as any[]}
              onContentChange={handleContentChange}
              onSubmit={handleSubmit}
              onKeyDown={handleKeyDown}
            />
          </Show>
        </box>
      </box>

      {/* Agent info line below prompt */}
      <box paddingLeft={2}>
        <text fg={theme().textMuted}>
          <span style={{ fg: theme().border }}>▣ </span>
          <span style={{ fg: theme().textMuted }}>
            {agent.modelName()}
          </span>
        </text>
      </box>
    </box>
  );
}
