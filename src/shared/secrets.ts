// Layer 0 — Persistent secret storage.
//
// Stores API keys in ~/.config/jeriko/.env so they survive daemon restarts.
// Loaded into process.env at daemon boot (kernel step 1).
// Written by channel /auth command and CLI init.
//
// File format: standard .env (KEY=value, one per line, # comments).
// File permissions: 0o600 (owner-only read/write).

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./config.js";

const SECRETS_FILE = join(getConfigDir(), ".env");

/** Legacy dotenv config file from v1 — loaded as fallback. */
const LEGACY_CONFIG_FILE = join(getConfigDir(), "config");

/**
 * Load secrets from dotenv files into process.env.
 *
 * Load order (first match wins — earlier sources take precedence):
 *   1. Real env vars (process.env from shell)
 *   2. ~/.config/jeriko/.env       (primary secrets file, v2)
 *   3. ~/.config/jeriko/config     (legacy dotenv file, v1 migration)
 *
 * Only sets vars that are NOT already set. Called once at daemon boot.
 */
export function loadSecrets(): void {
  loadDotenvFile(SECRETS_FILE);
  loadDotenvFile(LEGACY_CONFIG_FILE);
}

/**
 * Parse a dotenv-format file and set unset vars in process.env.
 */
function loadDotenvFile(filePath: string): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Only set if not already defined — env vars and earlier files take precedence
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/**
 * Save a secret to ~/.config/jeriko/.env and set it in the current process.
 *
 * If the key already exists in the file, its value is replaced.
 * File is created with 0o600 permissions if it doesn't exist.
 */
export function saveSecret(key: string, value: string): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Read existing lines
  let lines: string[] = [];
  if (existsSync(SECRETS_FILE)) {
    lines = readFileSync(SECRETS_FILE, "utf-8").split("\n");
  }

  // Replace existing or append
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim().startsWith(`${key}=`)) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }
  if (!found) {
    // Remove trailing empty lines before appending
    while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") {
      lines.pop();
    }
    lines.push(`${key}=${value}`);
  }

  // Write back with secure permissions
  const content = lines.join("\n") + "\n";
  writeFileSync(SECRETS_FILE, content, { mode: 0o600 });

  // Ensure permissions even if file existed with different perms
  try {
    chmodSync(SECRETS_FILE, 0o600);
  } catch {
    // Best effort — may fail on some filesystems
  }

  // Set in current process immediately
  process.env[key] = value;
}

/**
 * Delete a secret from ~/.config/jeriko/.env and unset it in process.env.
 */
export function deleteSecret(key: string): void {
  if (existsSync(SECRETS_FILE)) {
    const lines = readFileSync(SECRETS_FILE, "utf-8")
      .split("\n")
      .filter((l) => !l.trim().startsWith(`${key}=`));
    writeFileSync(SECRETS_FILE, lines.join("\n") + "\n", { mode: 0o600 });
  }
  delete process.env[key];
}
