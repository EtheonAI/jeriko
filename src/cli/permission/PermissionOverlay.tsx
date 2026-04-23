/**
 * Permission Subsystem — overlay that pulls the queue head and resolves it.
 *
 * Responsibilities:
 *   1. Read the current queue via usePermissionQueue().
 *   2. If head exists, render <PermissionDialog> for it.
 *   3. Register keybindings (y / Shift+Y / a / n / d / Esc) in the
 *      "dialog" scope via Subsystem 3 so the user's keystrokes route to
 *      the correct decision.
 *   4. Push a "dialog" scope onto the keybinding store while a request
 *      is pending so higher-scope bindings (e.g. REPL input submit on
 *      Enter) don't compete.
 *
 * Keybinding ids are registered in defaults.ts; this overlay only calls
 * useKeybinding with those ids, so user re-chording in
 * ~/.config/jeriko/keybindings.json applies automatically.
 */

import React from "react";
import {
  usePermissionQueue,
  usePermissionStore,
} from "./provider.js";
import { PermissionDialog } from "./PermissionDialog.js";
import type { PermissionRequest, PermissionDecision } from "./types.js";
import {
  useKeybinding,
  useKeybindingScope,
} from "../keybindings/index.js";

// ---------------------------------------------------------------------------
// Dispatch — one place maps keybinding id → PermissionDecision
// ---------------------------------------------------------------------------

const DECISION_BY_ID: Readonly<Record<string, PermissionDecision>> = {
  "permission.allow-once":    "allow-once",
  "permission.allow-session": "allow-session",
  "permission.allow-always":  "allow-always",
  "permission.deny-once":     "deny-once",
  "permission.deny-always":   "deny-always",
  // Esc is bound to deny-once via the same id — safer default than cancel-only.
  "permission.cancel":        "deny-once",
};

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

export const PermissionOverlay: React.FC = () => {
  const queue = usePermissionQueue();
  const store = usePermissionStore();
  const head: PermissionRequest | undefined = queue[0];

  // While a request is pending, push the `dialog` scope onto the keybinding
  // stack. On unmount (queue empty or component unmounts), the scope pops
  // automatically.
  useKeybindingScope(head !== undefined ? "dialog" : "global");

  // Register each decision binding. The handler captures the current head
  // via closure — when queue advances, the closure reads the *new* head on
  // next render. useRef is unnecessary because React re-renders on snapshot
  // change (useSyncExternalStore) before the next key event can arrive.
  const makeHandler = (id: string) => (): boolean => {
    if (head === undefined) return false; // pass-through — no request to resolve.
    const decision = DECISION_BY_ID[id];
    if (decision === undefined) return false;
    store.resolve(head.id, decision);
    return true;
  };

  useKeybinding("permission.allow-once",    makeHandler("permission.allow-once"),    { enabled: head !== undefined });
  useKeybinding("permission.allow-session", makeHandler("permission.allow-session"), { enabled: head !== undefined });
  useKeybinding("permission.allow-always",  makeHandler("permission.allow-always"),  { enabled: head !== undefined });
  useKeybinding("permission.deny-once",     makeHandler("permission.deny-once"),     { enabled: head !== undefined });
  useKeybinding("permission.deny-always",   makeHandler("permission.deny-always"),   { enabled: head !== undefined });
  useKeybinding("permission.cancel",        makeHandler("permission.cancel"),        { enabled: head !== undefined });

  if (head === undefined) return null;
  return <PermissionDialog request={head} />;
};
