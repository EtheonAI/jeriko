/**
 * UI Subsystem — Dialog primitive.
 *
 * A modal-style Pane with a narrower default width and an always-present
 * keyboard-hint footer. Used for permission prompts, confirmations, and
 * any interaction that blocks the main REPL.
 *
 * Dialog does not trap focus (Ink has no modal focus primitive); correct
 * focus routing is the caller's responsibility via the keybinding subsystem.
 */

import React from "react";
import { Box } from "ink";
import type { Intent } from "../types.js";
import { toneFromIntent } from "../tokens.js";
import { Pane } from "./Pane.js";
import { KeyboardHint } from "./KeyboardHint.js";
import type { KeyHint } from "../types.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DialogProps {
  readonly intent?: Intent;
  readonly title: string;
  readonly hints?: readonly KeyHint[];
  readonly width?: number | string;
  readonly children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DIALOG_WIDTH = 72;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Dialog: React.FC<DialogProps> = ({
  intent = "brand",
  title,
  hints,
  width = DEFAULT_DIALOG_WIDTH,
  children,
}) => {
  const tone = toneFromIntent(intent);
  return (
    <Box marginY={1}>
      <Pane
        tone={tone}
        border="round"
        padding="md"
        title={title}
        width={width}
        footer={hints && hints.length > 0 ? <KeyboardHint hints={hints} /> : undefined}
      >
        {children}
      </Pane>
    </Box>
  );
};
