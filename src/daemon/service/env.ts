// Daemon — Environment snapshot for daemon.env.
// Captures relevant API keys and tokens into a file that the OS service
// wrapper script sources before launching the daemon.

import * as fs from "node:fs";
import * as path from "node:path";
import { getLogger } from "../../shared/logger.js";
import { getDataDir } from "../../shared/config.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Keys that should be captured into daemon.env. */
const CAPTURED_KEYS: readonly string[] = [
  // LLM providers
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",

  // Jeriko
  "NODE_AUTH_SECRET",
  "JERIKO_PORT",
  "JERIKO_MODEL",
  "JERIKO_LOG_LEVEL",

  // Channels
  "TELEGRAM_BOT_TOKEN",
  "JERIKO_TELEGRAM_TOKEN",
  "JERIKO_ADMIN_IDS",

  // Connectors
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_SECRET",
  "GITHUB_TOKEN",
  "GITHUB_WEBHOOK_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",

  // Cloud services
  "VERCEL_TOKEN",
  "GOOGLE_APPLICATION_CREDENTIALS",
] as const;

/** Result of an env snapshot operation. */
export interface EnvSnapshotResult {
  /** Path to the written file. */
  filePath: string;
  /** Number of env vars captured. */
  capturedCount: number;
  /** Names of captured variables (values are NOT included for security). */
  capturedKeys: string[];
  /** Keys that were present in the environment but skipped (not in CAPTURED_KEYS). */
  skippedCount: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Snapshot the current environment's relevant variables to `daemon.env`.
 *
 * The file is written to `~/.local/share/jeriko/daemon.env` in a format
 * that can be sourced by a shell script:
 *
 * ```bash
 * source ~/.local/share/jeriko/daemon.env
 * exec jeriko serve
 * ```
 *
 * File permissions are set to 0600 (owner-only read/write) since it
 * contains API keys and secrets.
 */
export function snapshotEnv(outputPath?: string): EnvSnapshotResult {
  const filePath = outputPath ?? path.join(getDataDir(), "daemon.env");
  const dir = path.dirname(filePath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines: string[] = [
    "# Jeriko daemon environment — auto-generated, do not edit.",
    `# Generated: ${new Date().toISOString()}`,
    "#",
    "# This file is sourced by the service wrapper script before",
    "# launching the Jeriko daemon. It captures API keys and tokens",
    "# from the user's shell environment at install time.",
    "",
  ];

  const capturedKeys: string[] = [];

  for (const key of CAPTURED_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      // Shell-safe quoting: wrap in single quotes, escape embedded single quotes
      const escaped = value.replace(/'/g, "'\\''");
      lines.push(`export ${key}='${escaped}'`);
      capturedKeys.push(key);
    }
  }

  // Add PATH so the daemon can find external tools
  if (process.env.PATH) {
    const escaped = process.env.PATH.replace(/'/g, "'\\''");
    lines.push(`export PATH='${escaped}'`);
  }

  // Add HOME
  if (process.env.HOME) {
    lines.push(`export HOME='${process.env.HOME}'`);
  }

  lines.push(""); // trailing newline

  // Write file
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

  // Set restrictive permissions (owner-only)
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort — may fail on some platforms
    log.warn(`Could not set permissions on ${filePath}`);
  }

  log.info(`Environment snapshot written: ${filePath} (${capturedKeys.length} vars)`);

  return {
    filePath,
    capturedCount: capturedKeys.length,
    capturedKeys,
    skippedCount: CAPTURED_KEYS.length - capturedKeys.length,
  };
}

/**
 * Read the daemon.env file and return its contents as key-value pairs.
 * Returns null if the file does not exist.
 */
export function readEnvSnapshot(filePath?: string): Record<string, string> | null {
  const envPath = filePath ?? path.join(getDataDir(), "daemon.env");

  if (!fs.existsSync(envPath)) return null;

  const content = fs.readFileSync(envPath, "utf-8");
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Match: export KEY='VALUE' or export KEY="VALUE" or export KEY=VALUE
    const match = trimmed.match(/^export\s+([A-Z_][A-Z0-9_]*)=(?:'([^']*(?:\\.[^']*)*)'|"([^"]*(?:\\.[^"]*)*)"|(.*))$/);
    if (match) {
      const key = match[1];
      if (key) {
        const value = match[2] ?? match[3] ?? match[4] ?? "";
        result[key] = value.replace(/'\\''/g, "'"); // un-escape single quotes
      }
    }
  }

  return result;
}

/**
 * Delete the daemon.env file.
 */
export function removeEnvSnapshot(filePath?: string): void {
  const envPath = filePath ?? path.join(getDataDir(), "daemon.env");
  try {
    if (fs.existsSync(envPath)) {
      fs.unlinkSync(envPath);
      log.info(`Environment snapshot removed: ${envPath}`);
    }
  } catch (err) {
    log.warn(`Could not remove env snapshot: ${err}`);
  }
}
