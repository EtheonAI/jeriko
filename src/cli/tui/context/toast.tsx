/**
 * TUI ToastProvider — Manages a queue of transient notifications.
 *
 * Toasts auto-dismiss after a configurable duration.
 * Components use `useToast()` to push notifications and the ToastContainer
 * component renders them.
 */

import {
  createContext,
  useContext,
  createSignal,
  type ParentProps,
} from "solid-js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = "info" | "success" | "error" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

export interface ToastOptions {
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  toasts: () => ToastItem[];
  push: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DURATION_MS = 3000;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue>();

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used within a <ToastProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider(props: ParentProps) {
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);

  const push = (message: string, options?: ToastOptions): string => {
    const id = randomUUID();
    const item: ToastItem = {
      id,
      message,
      variant: options?.variant ?? "info",
      durationMs: options?.durationMs ?? DEFAULT_DURATION_MS,
    };
    setToasts((prev) => [...prev, item]);
    return id;
  };

  const dismiss = (id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {props.children}
    </ToastContext.Provider>
  );
}
