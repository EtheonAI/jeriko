/**
 * CLI config paths — one place that knows where each subsystem persists.
 *
 * The main config file (`config.json`) is owned by the shared config layer;
 * we reuse its directory so users have exactly one `~/.config/jeriko/`
 * tree. Every subsystem gets a sibling file:
 *
 *   ~/.config/jeriko/config.json       (shared — model, channels, etc.)
 *   ~/.config/jeriko/keybindings.json  (Subsystem 3)
 *   ~/.config/jeriko/permissions.json  (Subsystem 7)
 *   ~/.config/jeriko/theme.json        (Subsystem 2 — this boot layer)
 *
 * Theme persistence is intentionally its own small file rather than a key
 * inside `config.json`: the shared config is schema-controlled by the
 * daemon, the theme is a CLI-only preference, and separation keeps test
 * isolation simple.
 */

import { join } from "node:path";
import { getConfigDir } from "../../shared/config.js";

export const THEME_CONFIG_FILE       = "theme.json";
export const KEYBINDINGS_CONFIG_FILE = "keybindings.json";
export const PERMISSIONS_CONFIG_FILE = "permissions.json";

/** Absolute path to the theme preference file. */
export function themeConfigPath(): string {
  return join(getConfigDir(), THEME_CONFIG_FILE);
}

/** Absolute path to the keybindings override file. */
export function keybindingsConfigPath(): string {
  return join(getConfigDir(), KEYBINDINGS_CONFIG_FILE);
}

/** Absolute path to the persistent permissions file. */
export function permissionsConfigPath(): string {
  return join(getConfigDir(), PERMISSIONS_CONFIG_FILE);
}
