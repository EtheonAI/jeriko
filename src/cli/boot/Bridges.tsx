/**
 * Bridge components — populate controller refs from inside the provider
 * tree so slash-command handlers can reach them imperatively.
 *
 * Each bridge is a render-null component that calls the relevant React
 * hook(s) and keeps a MutableRefObject in sync. They live at the same
 * level as the providers they observe, so their hook order is stable.
 */

import React, { useEffect, useState } from "react";
import { listThemes, useTheme } from "../themes/index.js";
import type { ThemeController, HelpController } from "./controllers.js";

// ---------------------------------------------------------------------------
// Theme bridge
// ---------------------------------------------------------------------------

export interface ThemeControllerBridgeProps {
  readonly controllerRef: React.MutableRefObject<ThemeController>;
}

export const ThemeControllerBridge: React.FC<ThemeControllerBridgeProps> = ({ controllerRef }) => {
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    controllerRef.current = {
      current: theme,
      set: setTheme,
      list: listThemes,
    };
  }, [theme, setTheme, controllerRef]);
  return null;
};

// ---------------------------------------------------------------------------
// Help bridge
// ---------------------------------------------------------------------------

export interface HelpControllerBridgeProps {
  readonly controllerRef: React.MutableRefObject<HelpController>;
  /** Signals visibility to the render tree so the overlay can render conditionally. */
  readonly onVisibilityChange?: (visible: boolean) => void;
}

export const HelpControllerBridge: React.FC<HelpControllerBridgeProps> = ({ controllerRef, onVisibilityChange }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    controllerRef.current = {
      visible,
      show:   () => setVisible(true),
      hide:   () => setVisible(false),
      toggle: () => setVisible((v) => !v),
    };
    if (onVisibilityChange !== undefined) onVisibilityChange(visible);
  }, [visible, controllerRef, onVisibilityChange]);

  return null;
};
