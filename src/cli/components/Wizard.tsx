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

  const ruleWidth = 52;
  const rule = "─".repeat(ruleWidth);

  return (
    <Box flexDirection="column">
      <Text color={PALETTE.faint}>{rule}</Text>

      {/* Title */}
      <Box marginBottom={1}>
        <Text color={PALETTE.brand} bold>{"  "}{config.title}</Text>
      </Box>

      {/* Step message */}
      <Text color={PALETTE.text}>{"  "}{step.message}</Text>
      <Text>{""}</Text>

      {/* Step content */}
      {step.type === "select" && (
        <SelectView
          options={step.options}
          selectedIndex={selectedIndex}
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
        <Text color={PALETTE.error}>{"  "}{error}</Text>
      )}

      {/* Hint line */}
      <Text>{""}</Text>
      {step.type === "select" ? (
        <Text color={PALETTE.dim}>
          {"  "}{"↑↓ navigate · Enter select · Esc "}
          {isFirstStep ? "cancel" : "back"}
        </Text>
      ) : (
        <Text color={PALETTE.dim}>
          {"  "}{"Enter to confirm · Esc "}
          {isFirstStep ? "cancel" : "back"}
        </Text>
      )}

      <Text color={PALETTE.faint}>{rule}</Text>
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
