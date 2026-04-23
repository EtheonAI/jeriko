/**
 * Unified CLI boot-time config loader.
 *
 * Reads theme + keybindings + permissions files in parallel. Every
 * subsystem's own loader already has a diagnostic-rich, non-throwing
 * contract; this module just orchestrates them and flattens the
 * diagnostics into one surface for the banner / log line.
 *
 * Returns a single `CLIBootConfig` the provider wiring consumes directly.
 */

import type { BindingSpec } from "../keybindings/index.js";
import { DEFAULT_BINDINGS, loadKeybindings } from "../keybindings/index.js";
import type { PermissionRule } from "../permission/index.js";
import { loadPermissions } from "../permission/index.js";
import type { ThemeId } from "../themes/index.js";
import type { ThemeDiagnostic } from "./theme-config.js";
import { loadThemeConfig } from "./theme-config.js";
import {
  keybindingsConfigPath,
  permissionsConfigPath,
  themeConfigPath,
} from "./paths.js";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * Aggregated diagnostic record — one entry per subsystem that surfaced
 * issues during load. Callers can surface these to the user or log them.
 */
export interface BootDiagnostics {
  readonly theme: readonly ThemeDiagnostic[];
  readonly keybindings: readonly import("../keybindings/index.js").ConfigDiagnostic[];
  readonly permissions: readonly import("../permission/index.js").ConfigDiagnostic[];
}

export interface CLIBootConfig {
  readonly themeId: ThemeId | null;
  readonly keybindingSpecs: readonly BindingSpec[];
  readonly permissionRules: readonly PermissionRule[];
  readonly diagnostics: BootDiagnostics;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export interface LoadCLIBootConfigOptions {
  /** Override path accessors — tests inject fixture paths. */
  readonly themePath?: string;
  readonly keybindingsPath?: string;
  readonly permissionsPath?: string;
}

/**
 * Load every CLI config file in parallel. Each subsystem loader returns
 * its best-effort data plus its own diagnostics — this never throws and
 * never blocks on a single slow read.
 */
export async function loadCLIBootConfig(
  opts: LoadCLIBootConfigOptions = {},
): Promise<CLIBootConfig> {
  const themePath = opts.themePath ?? themeConfigPath();
  const keybindingsPath = opts.keybindingsPath ?? keybindingsConfigPath();
  const permissionsPath = opts.permissionsPath ?? permissionsConfigPath();

  const [themeResult, keybindingsResult, permissionsResult] = await Promise.all([
    loadThemeConfig(themePath),
    loadKeybindings(keybindingsPath),
    loadPermissions(permissionsPath),
  ]);

  return {
    themeId:          themeResult.themeId,
    keybindingSpecs:  keybindingsResult.bindings.length > 0 ? keybindingsResult.bindings : DEFAULT_BINDINGS,
    permissionRules:  permissionsResult.rules,
    diagnostics: {
      theme:        themeResult.diagnostics,
      keybindings:  keybindingsResult.diagnostics,
      permissions:  permissionsResult.diagnostics,
    },
  };
}

// ---------------------------------------------------------------------------
// Filter — narrows diagnostics to actionable ones for user-facing output
// ---------------------------------------------------------------------------

/**
 * Diagnostics that represent a user-correctable misconfiguration. Missing
 * files are the common default case (user never wrote config); we don't
 * surface those. Everything else is worth showing.
 */
export function actionableDiagnostics(
  diagnostics: BootDiagnostics,
): Array<{ subsystem: "theme" | "keybindings" | "permissions"; entry: unknown }> {
  const out: Array<{ subsystem: "theme" | "keybindings" | "permissions"; entry: unknown }> = [];
  for (const d of diagnostics.theme)       if (d.kind !== "missing-file") out.push({ subsystem: "theme",       entry: d });
  for (const d of diagnostics.keybindings) if (d.kind !== "missing-file") out.push({ subsystem: "keybindings", entry: d });
  for (const d of diagnostics.permissions) if (d.kind !== "missing-file") out.push({ subsystem: "permissions", entry: d });
  return out;
}
