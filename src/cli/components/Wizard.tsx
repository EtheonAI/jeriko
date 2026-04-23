/**
 * Wizard — generic multi-step interactive flow component.
 *
 * The single engine for every interactive flow in the CLI (onboarding,
 * /model add, /channel add, /connector add). A flow is defined declaratively
 * (see src/cli/flows/) and lowered into a WizardConfig that this component
 * renders.
 *
 * Step kinds:
 *   - select:       numbered list with arrow-key navigation
 *   - multi-select: checkbox list with Space toggle and "a" select-all
 *   - text:         inline text entry with placeholder + validation
 *   - password:     fully-masked text entry with validation
 *
 * Dynamic / conditional steps:
 *   A step in `config.steps` can be either a static WizardStep object or a
 *   function `(previous: readonly string[]) => WizardStep | null`. A null
 *   return skips the step — the engine advances automatically and fills the
 *   skipped position with an empty-string placeholder in `results` so later
 *   steps can rely on stable indexing.
 *
 * Theming:
 *   Colors resolve via `useTheme()` (Subsystem 2) so a theme switch instantly
 *   restyles the wizard. No hardcoded hex anywhere.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Text, Box, useInput } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import type {
  WizardConfig,
  WizardStep,
  WizardStepResolver,
} from "../types.js";

// ---------------------------------------------------------------------------
// Step resolution
// ---------------------------------------------------------------------------

/** Apply a resolver with the given prior answers, producing a step or null. */
function resolveStep(
  resolver: WizardStepResolver | undefined,
  previous: readonly string[],
): WizardStep | null {
  if (resolver === undefined) return null;
  if (typeof resolver === "function") return resolver(previous);
  return resolver;
}

// ---------------------------------------------------------------------------
// Glyphs — small set, centralized so tests and the component agree
// ---------------------------------------------------------------------------

const GLYPHS = {
  pointer:     "❯", // ❯
  checked:     "◼", // ◼
  unchecked:   "◻", // ◻
  maskBullet:  "●", // ●
} as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WizardProps {
  readonly config: WizardConfig;
  readonly onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Wizard: React.FC<WizardProps> = ({ config, onCancel }) => {
  const { colors } = useTheme();

  const [stepIndex, setStepIndex] = useState(0);
  const [results, setResults] = useState<readonly string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [checkedSet, setCheckedSet] = useState<Set<string>>(new Set());
  const [textBuffer, setTextBuffer] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Guard: deactivate input handling during the first render cycle.
  // The Enter key that submitted the slash command can leak into useInput
  // before the wizard visually renders. Ink's isActive option on useInput
  // properly disconnects the stdin listener until the effect fires.
  const [inputActive, setInputActive] = useState(false);
  useEffect(() => { setInputActive(true); }, []);

  // Resolve the current step (may be null when a resolver opted to skip).
  const step: WizardStep | null = useMemo(
    () => resolveStep(config.steps[stepIndex], results),
    [config.steps, stepIndex, results],
  );

  // Auto-advance past skipped (null) steps by pushing an empty placeholder.
  // Running this in an effect (not during render) keeps state updates
  // predictable and avoids re-entrancy issues with the resolver.
  useEffect(() => {
    if (step !== null) return;
    if (stepIndex >= config.steps.length) return;
    const nextResults = [...results, ""];
    if (stepIndex === config.steps.length - 1) {
      void Promise.resolve(config.onComplete(nextResults));
      return;
    }
    setResults(nextResults);
    setStepIndex((i) => i + 1);
    setSelectedIndex(0);
    setCheckedSet(new Set());
    setTextBuffer("");
    setError(null);
  }, [step, stepIndex, results, config.steps.length, config]);

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === config.steps.length - 1;

  // Advance to next step or complete with the supplied answer.
  const advance = (value: string): void => {
    const newResults = [...results, value];
    if (isLastStep) {
      void Promise.resolve(config.onComplete(newResults));
    } else {
      setResults(newResults);
      setStepIndex((i) => i + 1);
      setSelectedIndex(0);
      setCheckedSet(new Set());
      setTextBuffer("");
      setError(null);
    }
  };

  // Go back one step (or cancel on first step).
  const goBack = (): void => {
    if (isFirstStep) {
      onCancel();
    } else {
      setResults(results.slice(0, -1));
      setStepIndex((i) => i - 1);
      setSelectedIndex(0);
      setCheckedSet(new Set());
      setTextBuffer("");
      setError(null);
    }
  };

  useInput(
    (input, key) => {
      if (step === null) return;

      if (key.escape) { goBack(); return; }

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
        if (input === " ") {
          const opt = opts[selectedIndex];
          if (opt) {
            setCheckedSet((prev) => {
              const next = new Set(prev);
              if (next.has(opt.value)) {
                next.delete(opt.value);
              } else {
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
        if (key.return) {
          const min = step.min ?? 0;
          if (checkedSet.size < min) {
            setError(`Select at least ${min} item${min !== 1 ? "s" : ""}`);
            return;
          }
          setError(null);
          const value = Array.from(checkedSet).join(",");
          advance(value);
          return;
        }
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

      if (step.type === "text" || step.type === "password") {
        if (key.return) {
          const trimmed = textBuffer.trim();
          if (step.validate) {
            const err = step.validate(trimmed);
            if (err) { setError(err); return; }
          }
          if (!trimmed) { setError("Value cannot be empty"); return; }
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
    { isActive: inputActive },
  );

  // ── Render ────────────────────────────────────────────────────────

  if (step === null) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.dim}
      paddingX={1}
      paddingY={1}
    >
      {/* Title + step indicator */}
      <Box marginBottom={1}>
        <Text color={colors.brand} bold>{config.title}</Text>
        {config.steps.length > 1 && (
          <Text color={colors.dim}>{"  "}Step {stepIndex + 1}/{config.steps.length}</Text>
        )}
      </Box>

      {/* Step message */}
      <Text color={colors.text}>{step.message}</Text>
      <Text>{""}</Text>

      {/* Step content */}
      {step.type === "select" && (
        <SelectView options={step.options} selectedIndex={selectedIndex} />
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
        <TextInputView buffer={textBuffer} masked={true} />
      )}

      {/* Error */}
      {error && <Text color={colors.error}>{error}</Text>}

      {/* Hint line */}
      <Text>{""}</Text>
      {step.type === "select" && (
        <Text color={colors.dim}>
          {"↑↓ navigate · Enter select · Esc "}
          {isFirstStep ? "cancel" : "back"}
        </Text>
      )}
      {step.type === "multi-select" && (
        <Text color={colors.dim}>
          {"↑↓ navigate · Space toggle · a all · Enter confirm · Esc "}
          {isFirstStep ? "cancel" : "back"}
        </Text>
      )}
      {(step.type === "text" || step.type === "password") && (
        <Text color={colors.dim}>
          {"Enter to confirm · Esc "}
          {isFirstStep ? "cancel" : "back"}
        </Text>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Select list view
// ---------------------------------------------------------------------------

const SelectView: React.FC<{
  options: ReadonlyArray<{ value: string; label: string; hint?: string }>;
  selectedIndex: number;
}> = ({ options, selectedIndex }) => {
  const { colors } = useTheme();
  return (
    <Box flexDirection="column">
      {options.map((opt, i) => {
        const isSelected = i === selectedIndex;
        const num = `${i + 1}`.padStart(2);
        const marker = isSelected ? ` ${GLYPHS.pointer} ` : "   ";
        return (
          <Text key={opt.value}>
            <Text color={colors.dim}>{`  ${num}`}</Text>
            <Text color={isSelected ? colors.brand : colors.dim}>{marker}</Text>
            <Text color={isSelected ? colors.brand : colors.text} bold={isSelected}>
              {opt.label}
            </Text>
            {opt.hint && <Text color={colors.dim}>{"  "}{opt.hint}</Text>}
          </Text>
        );
      })}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Multi-select list view
// ---------------------------------------------------------------------------

const MultiSelectView: React.FC<{
  options: ReadonlyArray<{ value: string; label: string; hint?: string }>;
  selectedIndex: number;
  checkedSet: Set<string>;
}> = ({ options, selectedIndex, checkedSet }) => {
  const { colors } = useTheme();
  return (
    <Box flexDirection="column">
      {options.map((opt, i) => {
        const isFocused = i === selectedIndex;
        const isChecked = checkedSet.has(opt.value);
        const num = `${i + 1}`.padStart(2);
        const checkbox = isChecked ? GLYPHS.checked : GLYPHS.unchecked;
        const checkColor = isChecked ? colors.brand : colors.dim;
        return (
          <Text key={opt.value}>
            <Text color={colors.dim}>{`  ${num}`}</Text>
            <Text color={isFocused ? colors.brand : colors.dim}>
              {isFocused ? ` ${GLYPHS.pointer} ` : "   "}
            </Text>
            <Text color={checkColor}>{checkbox} </Text>
            <Text color={isFocused ? colors.brand : colors.text} bold={isFocused}>
              {opt.label}
            </Text>
            {opt.hint && <Text color={colors.dim}>{"  "}{opt.hint}</Text>}
          </Text>
        );
      })}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Text input view
// ---------------------------------------------------------------------------

const TextInputView: React.FC<{
  buffer: string;
  placeholder?: string;
  masked: boolean;
}> = ({ buffer, placeholder, masked }) => {
  const { colors } = useTheme();
  const display = masked ? GLYPHS.maskBullet.repeat(buffer.length) : buffer;
  const showPlaceholder = buffer.length === 0 && placeholder !== undefined && placeholder !== "";
  return (
    <Box>
      <Text color={colors.brand} bold>{`  ${GLYPHS.pointer} `}</Text>
      {showPlaceholder ? (
        <>
          <Text color={colors.faint}>{placeholder}</Text>
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
