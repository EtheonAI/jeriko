/**
 * Boot subsystem — public barrel for the integration layer.
 */

// --- Config paths + loaders -------------------------------------------------
export {
  KEYBINDINGS_CONFIG_FILE,
  PERMISSIONS_CONFIG_FILE,
  THEME_CONFIG_FILE,
  keybindingsConfigPath,
  permissionsConfigPath,
  themeConfigPath,
} from "./paths.js";

export type { ThemeConfig, ThemeConfigIO, ThemeDiagnostic, LoadThemeResult, SaveThemeResult } from "./theme-config.js";
export { loadThemeConfig, saveThemeConfig, themeConfigSchema } from "./theme-config.js";

export type { BootDiagnostics, CLIBootConfig, LoadCLIBootConfigOptions } from "./load-config.js";
export { actionableDiagnostics, loadCLIBootConfig } from "./load-config.js";

// --- Controllers ------------------------------------------------------------
export type { HelpController, ThemeController } from "./controllers.js";
export { NULL_HELP_CONTROLLER, NULL_THEME_CONTROLLER } from "./controllers.js";

// --- Bridge components ------------------------------------------------------
export {
  HelpControllerBridge,
  ThemeControllerBridge,
} from "./Bridges.js";
export type {
  HelpControllerBridgeProps,
  ThemeControllerBridgeProps,
} from "./Bridges.js";
