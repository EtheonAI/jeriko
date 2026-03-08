/**
 * Wizard — Generic multi-step interactive flow component.
 *
 * Renders steps one at a time:
 *   - select: Numbered list with arrow-key navigation and `❯` marker
 *   - text: Inline text input with placeholder
 *   - password: Fully masked text input
 *
 * Controls:
 *   ↑↓       Navigate options (select step)
 *   Enter     Confirm selection / submit text
 *   Esc       Go back one step (or cancel on first step)
 *   Backspace Delete character (text/password)
 *
 * Example:
 *   ───────────────────────────────────
 *   Connect a channel
 *
 *     1  ❯ telegram     Telegram Bot
 *     2    whatsapp     WhatsApp Web
 *
 *   ↑↓ navigate · Enter select · Esc cancel
 *   ───────────────────────────────────
 */

import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { PALETTE } from "../theme.js";
import type { WizardConfig, WizardStep } from "../types.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WizardProps {
  config: WizardConfig;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Wizard: React.FC<WizardProps> = ({ config, onCancel }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [checkedSet, setCheckedSet] = useState<Set<string>>(new Set());
  const [textBuffer, setTextBuffer] = useState("");
  const [error, setError] = useState<string | null>(null);

  const step = config.steps[stepIndex];
  if (!step) return null;

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === config.steps.length - 1;

  // Advance to next step or complete
  const advance = (value: string) => {
    const newResults = [...results, value];
    if (isLastStep) {
      // onComplete may be async — void the promise to suppress unhandled rejections.
      // Error handling is centralized in launchWizard() wrappers.
      void Promise.resolve(config.onComplete(newResults));
    } else {
      setResults(newResults);
      setStepIndex(stepIndex + 1);
      setSelectedIndex(0);
      setCheckedSet(new Set());
      setTextBuffer("");
      setError(null);
    }
  };

  // Go back one step
  const goBack = () => {
    if (isFirstStep) {
      onCancel();
    } else {
      setResults(results.slice(0, -1));
      setStepIndex(stepIndex - 1);
      setSelectedIndex(0);
      setCheckedSet(new Set());
      setTextBuffer("");
      setError(null);
    }
  };

  useInput(
    (input, key) => {
      // Escape — go back or cancel
      if (key.escape) {
        goBack();
        return;
      }

      // ── Select step ─────────────────────────────────────────────
      if (step.type === "select") {
        const opts = step.options;
        if (key.upArrow) {
          setSelectedIndex((i) => (i > 0 ? i - 1 : opts.length - 1));
          return;
        }
        if (key.downArrow) {
          setSelectedIndex((i) => (i < opts.length - 1 ? i + 1 : 0));
          return;
        }
        if (key.return) {
          const selected = opts[selectedIndex];
          if (selected) advance(selected.value);
          return;
        }
        // Number keys for quick select (1-9)
        if (input >= "1" && input <= "9") {
          const idx = parseInt(input, 10) - 1;
          if (idx < opts.length) {
            setSelectedIndex(idx);
            advance(opts[idx]!.value);
          }
        }
        return;
      }

      // ── Multi-select step ───────────────────────────────────────
      if (step.type === "multi-select") {
        const opts = step.options;
        if (key.upArrow) {
          setSelectedIndex((i) => (i > 0 ? i - 1 : opts.length - 1));
          return;
        }
        if (key.downArrow) {
          setSelectedIndex((i) => (i < opts.length - 1 ? i + 1 : 0));
          return;
        }
        // Space toggles the current item
        if (input === " ") {
          const opt = opts[selectedIndex];
          if (opt) {
            setCheckedSet((prev) => {
              const next = new Set(prev);
              if (next.has(opt.value)) {
                next.delete(opt.value);
              } else {
                // Enforce max constraint
                if (step.max !== undefined && next.size >= step.max) {
                  setError(`Maximum ${step.max} selections allowed`);
                  return prev;
                }
                next.add(opt.value);
              }
              setError(null);
              return next;
            });
          }
          return;
        }
        // Enter confirms selection
        if (key.return) {
          const min = step.min ?? 0;
          if (checkedSet.size < min) {
            setError(`Select at least ${min} item${min !== 1 ? "s" : ""}`);
            return;
          }
          setError(null);
          // Encode multi-select as comma-separated values
          const value = Array.from(checkedSet).join(",");
          advance(value);
          return;
        }
        // "a" toggles all
        if (input === "a") {
          setCheckedSet((prev) => {
            if (prev.size === opts.length) return new Set();
            const max = step.max ?? opts.length;
            return new Set(opts.slice(0, max).map((o) => o.value));
          });
          setError(null);
          return;
        }
        return;
      }

      // ── Text / Password step ────────────────────────────────────
      if (step.type === "text" || step.type === "password") {
        if (key.return) {
          const trimmed = textBuffer.trim();
          if (step.validate) {
            const err = step.validate(trimmed);
            if (err) {
              setError(err);
              return;
            }
          }
          if (!trimmed) {
            setError("Value cannot be empty");
            return;
          }
          setError(null);
          advance(trimmed);
          return;
        }
        if (key.backspace || key.delete) {
          setTextBuffer((b) => b.slice(0, -1));
          setError(null);
          return;
        }
        if (key.ctrl && input === "u") {
          setTextBuffer("");
          setError(null);
          return;
        }
        if (input && !key.ctrl && !key.meta && !key.escape) {
          setTextBuffer((b) => b + input);
          setError(null);
        }
        return;
      }
    },
    { isActive: true },
  );

  // ── Render ────────────────────────────────────────────────────────

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={PALETTE.dim}
      paddingX={1}
      paddingY={1}
    >
      {/* Title + step indicator */}
      <Box marginBottom={1}>
        <Text color={PALETTE.brand} bold>{config.title}</Text>
        {config.steps.length > 1 && (
          <Text color={PALETTE.dim}>{"  "}Step {stepIndex + 1}/{config.steps.length}</Text>
        )}
      </Box>

      {/* Step message */}
      <Text color={PALETTE.text}>{step.message}</Text>
      <Text>{""}</Text>

      {/* Step content */}
      {step.type === "select" && (
        <SelectView
          options={step.options}
          selectedIndex={selectedIndex}
        />
      )}

      {step.type === "multi-select" && (
        <MultiSelectView
          options={step.options}
          selectedIndex={selectedIndex}
          checkedSet={checkedSet}
        />
      )}

      {step.type === "text" && (
        <TextInputView
          buffer={textBuffer}
          placeholder={step.placeholder}
          masked={false}
        />
      )}

      {step.type === "password" && (
        <TextInputView
          buffer={textBuffer}
          placeholder={undefined}
          masked={true}
        />
      )}

      {/* Error */}
      {error && (
        <Text color={PALETTE.error}>{error}</Text>
      )}

      {/* Hint line */}
      <Text>{""}</Text>
      {step.type === "select" && (
        <Text color={PALETTE.dim}>
          {"↑↓ navigate · Enter select · Esc "}
          {isFirstStep ? "cancel" : "back"}
        </Text>
      )}
      {step.type === "multi-select" && (
        <Text color={PALETTE.dim}>
          {"↑↓ navigate · Space toggle · a all · Enter confirm · Esc "}
          {isFirstStep ? "cancel" : "back"}
        </Text>
      )}
      {(step.type === "text" || step.type === "password") && (
        <Text color={PALETTE.dim}>
          {"Enter to confirm · Esc "}
          {isFirstStep ? "cancel" : "back"}
        </Text>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Select list view — numbered options with ❯ marker
// ---------------------------------------------------------------------------

const SelectView: React.FC<{
  options: Array<{ value: string; label: string; hint?: string }>;
  selectedIndex: number;
}> = ({ options, selectedIndex }) => {
  return (
    <Box flexDirection="column">
      {options.map((opt, i) => {
        const isSelected = i === selectedIndex;
        const num = `${i + 1}`.padStart(2);
        const marker = isSelected ? " \u276F " : "   ";

        return (
          <Text key={opt.value}>
            <Text color={PALETTE.dim}>{`  ${num}`}</Text>
            <Text color={isSelected ? PALETTE.brand : PALETTE.dim}>{marker}</Text>
            <Text color={isSelected ? PALETTE.brand : PALETTE.text} bold={isSelected}>
              {opt.label}
            </Text>
            {opt.hint && (
              <Text color={PALETTE.dim}>{"  "}{opt.hint}</Text>
            )}
          </Text>
        );
      })}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Multi-select list view — checkboxes with arrow-key navigation
// ---------------------------------------------------------------------------

const MultiSelectView: React.FC<{
  options: Array<{ value: string; label: string; hint?: string }>;
  selectedIndex: number;
  checkedSet: Set<string>;
}> = ({ options, selectedIndex, checkedSet }) => {
  return (
    <Box flexDirection="column">
      {options.map((opt, i) => {
        const isFocused = i === selectedIndex;
        const isChecked = checkedSet.has(opt.value);
        const num = `${i + 1}`.padStart(2);
        const checkbox = isChecked ? "◼" : "◻";
        const checkColor = isChecked ? PALETTE.brand : PALETTE.dim;

        return (
          <Text key={opt.value}>
            <Text color={PALETTE.dim}>{`  ${num}`}</Text>
            <Text color={isFocused ? PALETTE.brand : PALETTE.dim}>
              {isFocused ? " \u276F " : "   "}
            </Text>
            <Text color={checkColor}>{checkbox} </Text>
            <Text color={isFocused ? PALETTE.brand : PALETTE.text} bold={isFocused}>
              {opt.label}
            </Text>
            {opt.hint && (
              <Text color={PALETTE.dim}>{"  "}{opt.hint}</Text>
            )}
          </Text>
        );
      })}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Text input view — inline text entry with cursor
// ---------------------------------------------------------------------------

const TextInputView: React.FC<{
  buffer: string;
  placeholder?: string;
  masked: boolean;
}> = ({ buffer, placeholder, masked }) => {
  let display: string;
  if (masked) {
    display = "\u25CF".repeat(buffer.length);
  } else {
    display = buffer;
  }

  const showPlaceholder = !buffer && placeholder;

  return (
    <Box>
      <Text color={PALETTE.brand} bold>{"  \u276F "}</Text>
      {showPlaceholder ? (
        <>
          <Text color={PALETTE.faint}>{placeholder}</Text>
          <Text inverse>{" "}</Text>
        </>
      ) : (
        <>
          <Text>{display}</Text>
          <Text inverse>{" "}</Text>
        </>
      )}
    </Box>
  );
};
