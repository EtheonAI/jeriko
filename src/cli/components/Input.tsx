/**
 * Input — Advanced text input with multi-line, history, and autocomplete.
 *
 * Features:
 *   - Multi-line: Ctrl+J inserts newline, pasted newlines create continuation lines
 *   - History: Up/down arrow navigates input history (on first/last line)
 *   - History persistence: Saved to ~/.jeriko/data/cli_history.json across sessions
 *   - Autocomplete: Arrow-navigated popup for slash commands
 *   - Paste detection: Pasted newlines become continuation lines (not submit)
 *   - Emacs keybindings: Ctrl+A/E/U/W/K/J
 *   - Always visible: Input area stays rendered in all phases (disabled when busy)
 *
 * Prompt:
 *   ❯ first line
 *     continuation
 *     continuation
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
import { useBracketedPaste } from "../hooks/useBracketedPaste.js";
import type { Phase } from "../types.js";

// ---------------------------------------------------------------------------
// Adapted command map for autocomplete
// ---------------------------------------------------------------------------

const COMMANDS_FOR_AUTOCOMPLETE: ReadonlyMap<string, { description: string }> = new Map(
  Array.from(SLASH_COMMANDS.entries()).map(([name, desc]) => [name, { description: desc }]),
);

// ---------------------------------------------------------------------------
// Shared history instance (persists across re-renders and sessions)
// ---------------------------------------------------------------------------

const inputHistory = new InputHistory();
inputHistory.load();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Maximum characters accepted from a single paste event. */
const MAX_PASTE_CHARS = 50_000;

/** Maximum lines allowed in the input buffer. */
const MAX_INPUT_LINES = 500;

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
  const isInteractive = phase === "wizard" || phase === "setup";

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

  // ----- Bracketed paste mode -----
  // Enables \x1b[?2004h so the terminal wraps pasted text in CSI markers.
  // cleanInput() strips any marker fragments that Ink's useInput doesn't
  // natively consume (e.g. [200~, [201 artifacts on Konsole/Linux).
  const { cleanInput } = useBracketedPaste(isIdle);

  /** Insert pasted text at cursor, handling multi-line with size limits. */
  const handlePaste = useCallback((text: string) => {
    if (!text) return;

    // Truncate oversized pastes to prevent memory issues
    let sanitized = text;
    let truncated = false;

    if (sanitized.length > MAX_PASTE_CHARS) {
      sanitized = sanitized.slice(0, MAX_PASTE_CHARS);
      truncated = true;
    }

    const parts = sanitized.split("\n");

    if (parts.length > MAX_INPUT_LINES) {
      parts.length = MAX_INPUT_LINES;
      truncated = true;
    }

    if (truncated) {
      // Visual feedback is handled by the parent — we just truncate here.
      // The user will see the input is shorter than expected.
    }
    const newLines = [...lines];
    const currentLine = newLines[cursorLine] ?? "";
    const before = currentLine.slice(0, cursorCol);
    const after = currentLine.slice(cursorCol);

    newLines[cursorLine] = before + parts[0];

    for (let i = 1; i < parts.length - 1; i++) {
      newLines.splice(cursorLine + i, 0, parts[i]!);
    }

    const lastPart = parts[parts.length - 1] ?? "";
    if (parts.length > 1) {
      newLines.splice(cursorLine + parts.length - 1, 0, lastPart + after);
    }

    setLines(newLines);
    setCursorLine(cursorLine + parts.length - 1);
    setCursorCol(lastPart.length);
    setAutocomplete({ items: [], selectedIndex: -1, visible: false });
  }, [lines, cursorLine, cursorCol]);

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
      // During interactive phases (wizard, setup), their own components handle
      // all key input — Input should not interfere.
      if (isInteractive) return;

      // Ctrl+C and Escape always work — abort or interrupt regardless of phase.
      // During active phases (thinking, streaming, tool-executing, sub-executing)
      // both keys abort the current operation. When idle, Ctrl+C exits the app
      // and Escape dismisses autocomplete or clears the input line.
      if (key.ctrl && input === "c") {
        onInterrupt();
        return;
      }
      // Ctrl+D — standard Unix EOF (exit when input is empty)
      if (key.ctrl && input === "d") {
        if (isIdle && lines.every((l) => l.length === 0)) {
          onInterrupt();
        }
        return;
      }
      if (key.escape) {
        if (!isIdle) {
          onInterrupt();
          return;
        }
        if (autocomplete.visible) {
          setAutocomplete({ items: [], selectedIndex: -1, visible: false });
          return;
        }
        // Clear input line if non-empty
        if (lines.some((l) => l.length > 0)) {
          setLines([""]);
          setCursorLine(0);
          setCursorCol(0);
          return;
        }
        return;
      }

      // Only accept input when idle
      if (!isIdle) return;

      // ── Enter → execute autocomplete selection or submit ──────
      if (key.return) {
        if (autocomplete.visible && autocomplete.selectedIndex >= 0) {
          const selected = autocomplete.items[autocomplete.selectedIndex];
          if (selected) {
            // Execute the command immediately
            const command = selected.name.trim();
            inputHistory.push(command);
            inputHistory.save();
            onSubmit(command);
            resetInput();
            setHistoryIdx(inputHistory.length);
          }
          return;
        }

        const fullText = getFullText().trim();
        if (!fullText) return;

        // Submit
        inputHistory.push(fullText);
        inputHistory.save();
        onSubmit(fullText);
        resetInput();
        setHistoryIdx(inputHistory.length);
        return;
      }

      // ── Tab → fill autocomplete into input (for adding args) ───
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

          let restored: string[];
          if (newIdx === inputHistory.length) {
            // Restore draft
            restored = draftRef.current.split("\n");
            if (restored.length === 0) restored = [""];
          } else {
            restored = inputHistory.get(newIdx).split("\n");
          }
          setLines(restored);
          setCursorLine(restored.length - 1);
          setCursorCol((restored[restored.length - 1] ?? "").length);
          updateAutocomplete(restored);
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
      if (key.ctrl && input === "j") {
        // Insert newline at cursor position (Ctrl+J = standard Unix newline)
        const newLines = [...lines];
        const line = newLines[cursorLine] ?? "";
        const before = line.slice(0, cursorCol);
        const after = line.slice(cursorCol);
        newLines[cursorLine] = before;
        newLines.splice(cursorLine + 1, 0, after);
        setLines(newLines);
        setCursorLine(cursorLine + 1);
        setCursorCol(0);
        setAutocomplete({ items: [], selectedIndex: -1, visible: false });
        return;
      }

      // ── Regular character input / paste detection ─────────────
      if (input && !key.ctrl && !key.meta) {
        // Strip any bracketed paste escape sequence artifacts that Ink's
        // useInput didn't consume (e.g. [200~, [201 on Konsole/Linux).
        const cleaned = cleanInput(input);
        if (!cleaned) return;

        // Multi-character input without modifier keys is a paste event.
        // The terminal sends all pasted characters as a single chunk.
        if (cleaned.length > 1 && cleaned.includes("\n")) {
          handlePaste(cleaned);
          return;
        }
        const newLines = [...lines];
        const line = newLines[cursorLine] ?? "";
        newLines[cursorLine] = line.slice(0, cursorCol) + cleaned + line.slice(cursorCol);
        setLines(newLines);
        setCursorCol((c) => c + cleaned.length);
        updateAutocomplete(newLines);
      }
    },
    { isActive: true },
  );

  // Always render — input stays visible in all phases

  // When not idle, show a disabled/dimmed input
  if (!isIdle) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={PALETTE.faint}
        paddingX={1}
      >
        <Text>
          <Text color={PALETTE.dim}>{"\u276F "}</Text>
          <Text color={PALETTE.dim}>
            {lines[0] || " "}
          </Text>
        </Text>
      </Box>
    );
  }

  // Render input lines with cursor
  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={PALETTE.dim}
        paddingX={1}
      >
        {lines.map((line, lineIdx) => {
          const isCurrentLine = lineIdx === cursorLine;
          const prompt = lineIdx === 0 ? "\u276F " : "  ";
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
      </Box>

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
