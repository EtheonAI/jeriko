/**
 * TUI Tips — Random usage tips shown on the home screen.
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import { useTheme } from "../context/theme.js";

// ---------------------------------------------------------------------------
// Tip pool
// ---------------------------------------------------------------------------

const TIPS = [
  "Type a message to start a conversation with your AI agent",
  "Use /new to start a fresh session",
  "Use /sessions to list recent conversations",
  "Use /resume <slug> to pick up a previous session",
  "Use /model <name> to switch models mid-conversation",
  "Press Escape to interrupt a streaming response",
  "All 50+ CLI commands still work: jeriko sys, jeriko exec, etc.",
  "The daemon auto-connects when running — or uses in-process mode",
  "Use Ctrl+N to quickly start a new session",
] as const;

function pickRandomTip(): string {
  return TIPS[Math.floor(Math.random() * TIPS.length)]!;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TipsProps {
  /** Interval between tip rotations in ms (default: 8000) */
  rotateMs?: number;
}

export function Tips(props: TipsProps) {
  const theme = useTheme();
  const [tip, setTip] = createSignal(pickRandomTip());

  let timer: ReturnType<typeof setInterval>;

  onMount(() => {
    timer = setInterval(() => {
      setTip(pickRandomTip());
    }, props.rotateMs ?? 8000);
  });

  onCleanup(() => {
    clearInterval(timer);
  });

  return (
    <text fg={theme().textMuted}>
      <span style={{ fg: theme().border }}>tip: </span>
      <span style={{ fg: theme().textMuted }}>{tip()}</span>
    </text>
  );
}
