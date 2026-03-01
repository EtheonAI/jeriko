/**
 * TUI Toast — Notification component with auto-dismiss.
 *
 * Renders at absolute position (top-right) with variant-colored borders.
 * Managed by the ToastProvider context.
 */

import { For, Show, createEffect, onCleanup } from "solid-js";
import { useTheme } from "../context/theme.js";
import { useToast, type ToastItem } from "../context/toast.js";
import { ContainedSplitBorder } from "./border.js";

// ---------------------------------------------------------------------------
// Single toast
// ---------------------------------------------------------------------------

interface ToastEntryProps {
  toast: ToastItem;
}

function ToastEntry(props: ToastEntryProps) {
  const theme = useTheme();
  const { dismiss } = useToast();

  const variantColor = (): string => {
    const t = theme();
    switch (props.toast.variant) {
      case "success": return t.success;
      case "error":   return t.error;
      case "warning": return t.warning;
      case "info":
      default:        return t.info;
    }
  };

  createEffect(() => {
    if (props.toast.durationMs <= 0) return;

    const timer = setTimeout(() => {
      dismiss(props.toast.id);
    }, props.toast.durationMs);

    onCleanup(() => clearTimeout(timer));
  });

  return (
    <box
      border={["left", "right"] as any}
      customBorderChars={ContainedSplitBorder.customBorderChars}
      borderColor={variantColor()}
      backgroundColor={theme().backgroundPanel}
      paddingX={2}
      paddingY={0}
      maxWidth={60}
    >
      <text fg={theme().text} content={props.toast.message} />
    </box>
  );
}

// ---------------------------------------------------------------------------
// Toast container (overlays all toasts)
// ---------------------------------------------------------------------------

export function ToastContainer() {
  const { toasts } = useToast();

  return (
    <Show when={toasts().length > 0}>
      <box
        position="absolute"
        top={1}
        right={2}
        flexDirection="column"
        gap={1}
        zIndex={1000}
      >
        <For each={toasts()}>
          {(toast) => <ToastEntry toast={toast} />}
        </For>
      </box>
    </Show>
  );
}
