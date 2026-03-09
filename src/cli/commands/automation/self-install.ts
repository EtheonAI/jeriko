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
 *   4. Install agent system prompt (AGENT.md → ~/.config/jeriko/agent.md)
 *   5. Install shell completions
 *   6. Add to PATH
 *   7. Install templates (if found)
 *   8. Verify installation
 *   9. Stop stale daemon
 *  10. Print success
 */

import {
  installVersioned,
  setupDirectories,
  setupAgentPrompt,
  setupCompletions,
  setupPath,
  setupTemplates,
  setupUserId,
  verifyInstallation,
  info,
  success,
  VERSION_TARGET_RE,
} from "./install-utils.js";
import { execSync } from "node:child_process";
import { isDaemonRunning, readPid, cleanupPidFile } from "../../lib/daemon.js";

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
 * Stop any running daemon so it restarts fresh on next `jeriko` invocation.
 *
 * Reuses PID/socket management from `src/cli/lib/daemon.ts` to avoid
 * reimplementing daemon lifecycle logic. Without this, a daemon started
 * with an empty/corrupt agent.md retains its boot-time (empty) system
 * prompt indefinitely — subsequent CLI connections via IPC inherit the
 * stale prompt.
 */
function stopStaleDaemon(): void {
  if (!isDaemonRunning()) return;

  const pid = readPid();
  if (!pid) return;

  try {
    process.kill(pid, "SIGTERM");
    info("Stopped existing daemon (will restart fresh on next launch)");
  } catch {
    // Process already gone
  }

  cleanupPidFile();
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

  // 2.5. User identity (must run after directories, before agent prompt)
  setupUserId();

  // 3. Agent system prompt
  setupAgentPrompt();

  // 4. Shell completions
  setupCompletions();

  // 5. PATH integration
  setupPath();

  // 6. Templates
  setupTemplates();

  // 7. Verify
  verifyInstallation();

  // 8. Stop any running daemon so it restarts fresh with the new binary
  // and agent prompt. A stale daemon retains its boot-time system prompt —
  // if agent.md was empty/missing at that boot, the agent has no identity.
  stopStaleDaemon();

  // Done — daemon is NOT started here. It starts automatically when the user
  // runs `jeriko` — createBackend() calls ensureDaemon() which auto-starts
  // and waits for the socket. Starting here would create a daemon with no
  // config that can't serve requests until the wizard finishes.
  console.log();
  success("Installation complete!");
  console.log();
  console.log("  Get started:");
  console.log("    \x1b[1mjeriko --help\x1b[0m          Show all commands");
  console.log("    \x1b[1mjeriko init\x1b[0m            Run setup wizard (API keys)");
  console.log("    \x1b[1mjeriko\x1b[0m                 Start interactive chat");
  console.log();
}
