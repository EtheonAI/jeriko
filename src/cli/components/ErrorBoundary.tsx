/**
 * ErrorBoundary — catches unhandled React component errors.
 *
 * Split into two parts:
 *   - `ErrorBoundary`   (class, required by React for error catching)
 *   - `ErrorFallback`   (functional, reads the theme context for styling)
 *
 * The class holds no display logic — its only job is error capture +
 * stderr logging. Rendering the fallback is delegated to a functional
 * component so theme-reactive styling composes via useTheme() without
 * dragging Context.Consumer into the class render method.
 */

import React from "react";
import { Text, Box } from "ink";
import { useTheme } from "../hooks/useTheme.js";

// ---------------------------------------------------------------------------
// Fallback — functional, theme-reactive
// ---------------------------------------------------------------------------

interface ErrorFallbackProps {
  readonly error: Error;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error }) => {
  const { colors } = useTheme();
  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={colors.error} bold>
        A rendering error occurred:
      </Text>
      <Text color={colors.dim}>{error.message}</Text>
      <Text color={colors.dim}>
        The CLI may be in an inconsistent state. Press Ctrl+C to exit.
      </Text>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Boundary — class (required by React for render-error capture)
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  readonly children: React.ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // stderr so it doesn't pollute Ink output.
    process.stderr.write(
      `[ErrorBoundary] ${error.message}\n${info.componentStack ?? ""}\n`,
    );
  }

  override render(): React.ReactNode {
    if (this.state.error !== null) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
