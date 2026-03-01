/**
 * `jeriko install [stable|latest|VERSION]` — Self-install the current binary.
 *
 * Called by web installers after downloading the binary:
 *   ./downloaded-binary install latest
 *
 * Steps:
 *   1. Copy self to ~/.local/share/jeriko/versions/{VERSION}/jeriko
 *   2. Symlink ~/.local/bin/jeriko → versioned path
 *   3. Create data directories
 *   4. Install shell completions
 *   5. Add to PATH
 *   6. Install templates (if found)
 *   7. Verify installation
 *   8. Print success
 */

import {
  installVersioned,
  setupDirectories,
  setupCompletions,
  setupPath,
  setupTemplates,
  verifyInstallation,
  info,
  success,
  warn,
  VERSION_TARGET_RE,
} from "./install-utils.js";
import { execSync } from "node:child_process";

/**
 * Detect the version of the currently running binary.
 *
 * Tries, in order:
 *   1. The explicit target argument (if it's a semver)
 *   2. `jeriko --version` output from this binary
 *   3. Falls back to "unknown"
 */
function resolveVersion(target: string): string {
  // If the target is a concrete semver, use it
  if (/^[0-9]+\.[0-9]+\.[0-9]+(-[^\s]+)?$/.test(target)) {
    return target;
  }

  // Try reading our own version
  try {
    const output = execSync(`"${process.execPath}" --version`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    // Expect "jeriko X.Y.Z" — extract version
    const match = output.match(/(\d+\.\d+\.\d+(-[^\s]+)?)/);
    if (match?.[1]) return match[1];
  } catch { /* ignore */ }

  return "unknown";
}

/**
 * Run the self-install flow. Called from plugin/install.ts when a
 * version target is detected instead of a plugin name.
 */
export async function runSelfInstall(target: string): Promise<void> {
  console.log();
  console.log("\x1b[1m  Jeriko Self-Install\x1b[0m");
  console.log();

  const version = resolveVersion(target);
  info(`Target: ${target}, Version: ${version}`);

  // 1. Versioned binary storage + symlink
  installVersioned(version);

  // 2. Data directories
  setupDirectories();

  // 3. Shell completions
  setupCompletions();

  // 4. PATH integration
  setupPath();

  // 5. Templates
  setupTemplates();

  // 6. Verify
  verifyInstallation();

  // Done
  console.log();
  success("Installation complete!");
  console.log();
  console.log("  Get started:");
  console.log("    \x1b[1mjeriko --help\x1b[0m          Show all commands");
  console.log("    \x1b[1mjeriko init\x1b[0m            Run setup wizard (API keys)");
  console.log("    \x1b[1mjeriko\x1b[0m                 Start interactive chat");
  console.log("    \x1b[1mjeriko server start\x1b[0m    Start the daemon");
  console.log();
}
