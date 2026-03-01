/**
 * TUI Spinner — Animated braille spinner for loading states.
 *
 * Uses SolidJS signals for reactive frame updates. Automatically
 * starts and stops the interval based on component lifecycle.
 */

import { createSignal, onMount, onCleanup } from "solid-js";

// ---------------------------------------------------------------------------
// Spinner frames
// ---------------------------------------------------------------------------

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const DEFAULT_INTERVAL_MS = 80;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SpinnerProps {
  /** Foreground color for the spinner glyph */
  color?: string;
  /** Animation interval in ms (default: 80) */
  intervalMs?: number;
  /** Optional label shown after the spinner */
  label?: string;
  /** Color for the label text */
  labelColor?: string;
}

export function Spinner(props: SpinnerProps) {
  const [frame, setFrame] = createSignal(0);

  let timer: ReturnType<typeof setInterval>;

  onMount(() => {
    timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % BRAILLE_FRAMES.length);
    }, props.intervalMs ?? DEFAULT_INTERVAL_MS);
  });

  onCleanup(() => {
    clearInterval(timer);
  });

  return (
    <text>
      <span style={{ fg: props.color ?? "#808080" }}>
        {BRAILLE_FRAMES[frame()]!}
      </span>
      {props.label ? (
        <span style={{ fg: props.labelColor ?? "#808080" }}>
          {" "}{props.label}
        </span>
      ) : null}
    </text>
  );
}
