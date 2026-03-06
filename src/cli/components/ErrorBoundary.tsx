/**
 * ErrorBoundary — Catches unhandled React component errors.
 *
 * Prevents the entire CLI from crashing when a component throws during
 * render. Shows a styled error message and allows the user to continue.
 *
 * React error boundaries must be class components — functional components
 * cannot catch render errors via hooks.
 */

import React from "react";
import { Text, Box } from "ink";
import { PALETTE } from "../theme.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to stderr so it doesn't pollute Ink output
    process.stderr.write(
      `[ErrorBoundary] ${error.message}\n${info.componentStack ?? ""}\n`,
    );
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <Box flexDirection="column" marginY={1}>
          <Text color={PALETTE.error} bold>
            A rendering error occurred:
          </Text>
          <Text color={PALETTE.dim}>{this.state.error.message}</Text>
          <Text color={PALETTE.dim}>
            The CLI may be in an inconsistent state. Press Ctrl+C to exit.
          </Text>
        </Box>
      );
    }

    return this.props.children;
  }
}
