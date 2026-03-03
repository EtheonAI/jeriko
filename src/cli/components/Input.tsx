/**
 * Input — Advanced text input with multi-line, history, and autocomplete.
 *
 * Features:
 *   - Multi-line: Shift+Enter inserts newline, Enter submits on last line
 *   - History: Up/down arrow navigates input history (on first/last line)
 *   - Autocomplete: Arrow-navigated popup for slash commands
 *   - Paste detection: Pasted newlines become continuation lines (not submit)
 *   - Emacs keybindings: Ctrl+A/E/U/W/K
 *
 * Prompt:
 *   > first line
 *   ... continuation
 *   ... continuation
 *
 * Always listens for Ctrl+C regardless of phase (interrupt/abort).
 */

import React, { useState, useRef, useCallback } from "react";
import { Text, Box, useInput } from "ink";
import { PALETTE } from "../theme.js";
import { slashCompleter, SLASH_COMMANDS } from "../commands.js";
import {
  shouldShowAutocomplete,
  filterCommands,
  navigateSelection,
  type AutocompleteItem,
  type AutocompleteState,
} from "../lib/autocomplete.js";
import { InputHistory } from "../lib/history.js";
import { Autocomplete } from "./Autocomplete.js";
import type { Phase } from "../types.js";

// ---------------------------------------------------------------------------
// Adapted command map for autocomplete
// ---------------------------------------------------------------------------

const COMMANDS_FOR_AUTOCOMPLETE: ReadonlyMap<string, { description: string }> = new Map(
  Array.from(SLASH_COMMANDS.entries()).map(([name, desc]) => [name, { description: desc }]),
);

// ---------------------------------------------------------------------------
// Shared history instance (persists across re-renders)
// ---------------------------------------------------------------------------

const inputHistory = new InputHistory();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InputProps {
  phase: Phase;
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Input: React.FC<InputProps> = ({ phase, onSubmit, onInterrupt }) => {
  // Buffer is an array of lines for multi-line support
  const [lines, setLines] = useState<string[]>([""]);
  const [cursorLine, setCursorLine] = useState(0);
  const [cursorCol, setCursorCol] = useState(0);

  // History navigation
  const [historyIdx, setHistoryIdx] = useState(inputHistory.length);
  const draftRef = useRef("");

  // Autocomplete state
  const [autocomplete, setAutocomplete] = useState<AutocompleteState>({
    items: [],
    selectedIndex: -1,
    visible: false,
  });

  const isIdle = phase === "idle";

  // ----- Helpers -----

  /** Get the full text content from all lines. */
  const getFullText = useCallback(() => lines.join("\n"), [lines]);

  /** Check if we're on the first line. */
  const isFirstLine = cursorLine === 0;

  /** Check if we're on the last line. */
  const isLastLine = cursorLine === lines.length - 1;

  /** Reset input state completely. */
  const resetInput = useCallback(() => {
    setLines([""]);
    setCursorLine(0);
    setCursorCol(0);
    setHistoryIdx(inputHistory.length);
    draftRef.current = "";
    setAutocomplete({ items: [], selectedIndex: -1, visible: false });
  }, []);

  /** Update autocomplete suggestions based on current input. */
  const updateAutocomplete = useCallback((currentLines: string[]) => {
    // Only show autocomplete for single-line input starting with /
    if (currentLines.length > 1 || !shouldShowAutocomplete(currentLines[0] ?? "")) {
      setAutocomplete({ items: [], selectedIndex: -1, visible: false });
      return;
    }

    const items = filterCommands(currentLines[0] ?? "", COMMANDS_FOR_AUTOCOMPLETE);
    if (items.length > 0) {
      setAutocomplete({ items, selectedIndex: 0, visible: true });
    } else {
      setAutocomplete({ items: [], selectedIndex: -1, visible: false });
    }
  }, []);

  // ----- Input handler -----

  useInput(
    (input, key) => {
      // Ctrl+C always works — abort or interrupt regardless of phase
      if (key.ctrl && input === "c") {
        onInterrupt();
        return;
      }

      // Only accept input when idle
      if (!isIdle) return;

      // ── Escape → dismiss autocomplete ─────────────────────────
      if (key.escape) {
        if (autocomplete.visible) {
          setAutocomplete({ items: [], selectedIndex: -1, visible: false });
        }
        return;
      }

      // ── Enter → accept autocomplete selection or submit ──────
      if (key.return) {
        // If autocomplete is visible with a selection, accept it into the
        // input buffer (don't submit yet — user may want to add arguments).
        if (autocomplete.visible && autocomplete.selectedIndex >= 0) {
          const selected = autocomplete.items[autocomplete.selectedIndex];
          if (selected) {
            const completed = selected.name + " ";
            setLines([completed]);
            setCursorLine(0);
            setCursorCol(completed.length);
            setAutocomplete({ items: [], selectedIndex: -1, visible: false });
          }
          return;
        }

        const fullText = getFullText().trim();
        if (!fullText) return;

        // Submit
        inputHistory.push(fullText);
        onSubmit(fullText);
        resetInput();
        setHistoryIdx(inputHistory.length);
        return;
      }

      // ── Tab → accept autocomplete or complete slash command ────
      if (key.tab) {
        if (autocomplete.visible && autocomplete.selectedIndex >= 0) {
          const selected = autocomplete.items[autocomplete.selectedIndex];
          if (selected) {
            const completed = selected.name + " ";
            setLines([completed]);
            setCursorLine(0);
            setCursorCol(completed.length);
            setAutocomplete({ items: [], selectedIndex: -1, visible: false });
          }
        } else if (lines.length === 1 && lines[0]!.startsWith("/")) {
          const [completions] = slashCompleter(lines[0]!);
          if (completions.length === 1) {
            const completed = completions[0]! + " ";
            setLines([completed]);
            setCursorCol(completed.length);
            setAutocomplete({ items: [], selectedIndex: -1, visible: false });
          }
        }
        return;
      }

      // ── Arrow Up ──────────────────────────────────────────────
      if (key.upArrow) {
        // If autocomplete is visible, navigate selection
        if (autocomplete.visible) {
          const newIdx = navigateSelection(autocomplete, "up");
          setAutocomplete({ ...autocomplete, selectedIndex: newIdx });
          return;
        }
        // If on first line, navigate history
        if (isFirstLine) {
          if (inputHistory.isEmpty) return;

          // Save current input as draft on first up-press
          if (historyIdx === inputHistory.length) {
            draftRef.current = getFullText();
          }

          const newIdx = inputHistory.prev(historyIdx);
          setHistoryIdx(newIdx);
          const entry = inputHistory.get(newIdx);
          const newLines = entry.split("\n");
          setLines(newLines);
          setCursorLine(0);
          setCursorCol(newLines[0]!.length);
          updateAutocomplete(newLines);
          return;
        }
        // Multi-line: move cursor up
        setCursorLine((l) => l - 1);
        setCursorCol((c) => Math.min(c, (lines[cursorLine - 1] ?? "").length));
        return;
      }

      // ── Arrow Down ────────────────────────────────────────────
      if (key.downArrow) {
        // If autocomplete is visible, navigate selection
        if (autocomplete.visible) {
          const newIdx = navigateSelection(autocomplete, "down");
          setAutocomplete({ ...autocomplete, selectedIndex: newIdx });
          return;
        }
        // If on last line, navigate history forward
        if (isLastLine) {
          if (historyIdx >= inputHistory.length) return;

          const newIdx = inputHistory.next(historyIdx);
          setHistoryIdx(newIdx);

          if (newIdx === inputHistory.length) {
            // Restore draft
            const newLines = draftRef.current.split("\n");
            setLines(newLines.length > 0 ? newLines : [""]);
            setCursorLine(newLines.length - 1);
            setCursorCol((newLines[newLines.length - 1] ?? "").length);
          } else {
            const entry = inputHistory.get(newIdx);
            const newLines = entry.split("\n");
            setLines(newLines);
            setCursorLine(newLines.length - 1);
            setCursorCol((newLines[newLines.length - 1] ?? "").length);
          }
          updateAutocomplete(lines);
          return;
        }
        // Multi-line: move cursor down
        setCursorLine((l) => l + 1);
        setCursorCol((c) => Math.min(c, (lines[cursorLine + 1] ?? "").length));
        return;
      }

      // ── Arrow Left ────────────────────────────────────────────
      if (key.leftArrow) {
        if (cursorCol > 0) {
          setCursorCol((c) => c - 1);
        } else if (cursorLine > 0) {
          // Wrap to end of previous line
          setCursorLine((l) => l - 1);
          setCursorCol((lines[cursorLine - 1] ?? "").length);
        }
        return;
      }

      // ── Arrow Right ───────────────────────────────────────────
      if (key.rightArrow) {
        const currentLineLen = (lines[cursorLine] ?? "").length;
        if (cursorCol < currentLineLen) {
          setCursorCol((c) => c + 1);
        } else if (cursorLine < lines.length - 1) {
          // Wrap to start of next line
          setCursorLine((l) => l + 1);
          setCursorCol(0);
        }
        return;
      }

      // ── Backspace ─────────────────────────────────────────────
      if (key.backspace || key.delete) {
        if (cursorCol > 0) {
          const newLines = [...lines];
          const line = newLines[cursorLine] ?? "";
          newLines[cursorLine] = line.slice(0, cursorCol - 1) + line.slice(cursorCol);
          setLines(newLines);
          setCursorCol((c) => c - 1);
          updateAutocomplete(newLines);
        } else if (cursorLine > 0) {
          // Merge with previous line
          const newLines = [...lines];
          const prevLine = newLines[cursorLine - 1] ?? "";
          const currentLine = newLines[cursorLine] ?? "";
          newLines[cursorLine - 1] = prevLine + currentLine;
          newLines.splice(cursorLine, 1);
          setLines(newLines);
          setCursorLine((l) => l - 1);
          setCursorCol(prevLine.length);
          updateAutocomplete(newLines);
        }
        return;
      }

      // ── Emacs keybindings ─────────────────────────────────────
      if (key.ctrl && input === "a") {
        setCursorCol(0);
        return;
      }
      if (key.ctrl && input === "e") {
        setCursorCol((lines[cursorLine] ?? "").length);
        return;
      }
      if (key.ctrl && input === "u") {
        // Clear from cursor to beginning of line
        const newLines = [...lines];
        const line = newLines[cursorLine] ?? "";
        newLines[cursorLine] = line.slice(cursorCol);
        setLines(newLines);
        setCursorCol(0);
        updateAutocomplete(newLines);
        return;
      }
      if (key.ctrl && input === "k") {
        // Clear from cursor to end of line
        const newLines = [...lines];
        const line = newLines[cursorLine] ?? "";
        newLines[cursorLine] = line.slice(0, cursorCol);
        setLines(newLines);
        updateAutocomplete(newLines);
        return;
      }
      if (key.ctrl && input === "w") {
        // Delete word backward
        const line = lines[cursorLine] ?? "";
        const before = line.slice(0, cursorCol);
        const after = line.slice(cursorCol);
        const trimmed = before.replace(/\S+\s*$/, "");
        const newLines = [...lines];
        newLines[cursorLine] = trimmed + after;
        setLines(newLines);
        setCursorCol(trimmed.length);
        updateAutocomplete(newLines);
        return;
      }

      // ── Regular character input ───────────────────────────────
      if (input && !key.ctrl && !key.meta) {
        // Paste detection: if input contains newlines, insert as multi-line
        if (input.includes("\n")) {
          const parts = input.split("\n");
          const newLines = [...lines];
          const currentLine = newLines[cursorLine] ?? "";
          const before = currentLine.slice(0, cursorCol);
          const after = currentLine.slice(cursorCol);

          // First part joins the current line
          newLines[cursorLine] = before + parts[0];

          // Middle parts become new lines
          for (let i = 1; i < parts.length - 1; i++) {
            newLines.splice(cursorLine + i, 0, parts[i]!);
          }

          // Last part gets the remainder of the original line
          const lastPart = parts[parts.length - 1] ?? "";
          if (parts.length > 1) {
            newLines.splice(cursorLine + parts.length - 1, 0, lastPart + after);
          }

          setLines(newLines);
          setCursorLine(cursorLine + parts.length - 1);
          setCursorCol(lastPart.length);
          updateAutocomplete(newLines);
        } else {
          const newLines = [...lines];
          const line = newLines[cursorLine] ?? "";
          newLines[cursorLine] = line.slice(0, cursorCol) + input + line.slice(cursorCol);
          setLines(newLines);
          setCursorCol((c) => c + input.length);
          updateAutocomplete(newLines);
        }
      }
    },
    { isActive: true },
  );

  // Don't render prompt during non-idle phases
  if (!isIdle) return null;

  // Render input lines with cursor
  return (
    <Box flexDirection="column">
      {lines.map((line, lineIdx) => {
        const isCurrentLine = lineIdx === cursorLine;
        const prompt = lineIdx === 0 ? "> " : "... ";
        const promptColor = lineIdx === 0 ? PALETTE.brand : PALETTE.dim;

        if (isCurrentLine) {
          const before = line.slice(0, cursorCol);
          const cursorChar = line[cursorCol] ?? " ";
          const after = line.slice(cursorCol + 1);

          return (
            <Text key={lineIdx}>
              <Text color={promptColor} bold={lineIdx === 0}>{prompt}</Text>
              <Text>{before}</Text>
              <Text inverse>{cursorChar}</Text>
              <Text>{after}</Text>
            </Text>
          );
        }

        return (
          <Text key={lineIdx}>
            <Text color={promptColor}>{prompt}</Text>
            <Text>{line}</Text>
          </Text>
        );
      })}

      {/* Autocomplete popup */}
      {autocomplete.visible && (
        <Autocomplete
          items={autocomplete.items}
          selectedIndex={autocomplete.selectedIndex}
        />
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export { inputHistory as _inputHistory };
