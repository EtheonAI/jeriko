/**
 * Shared installation utilities — used by both `jeriko setup` and `jeriko install` (self-install).
 *
 * Extracts common logic: directories, shell completions, PATH integration,
 * template installation, and versioned binary storage.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync, cpSync, readdirSync, symlinkSync, unlinkSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HOME = homedir();
export const IS_WINDOWS = platform() === "win32";
export const DATA_DIR = join(HOME, ".jeriko");
export const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"), "jeriko");
export const INSTALL_DIR = join(HOME, ".local", "bin");
export const LIB_DIR = join(HOME, ".local", "lib", "jeriko");
export const TEMPLATES_INSTALL_DIR = join(LIB_DIR, "templates");
export const VERSIONS_DIR = join(HOME, ".local", "share", "jeriko", "versions");
export const BINARY_NAME = IS_WINDOWS ? "jeriko.exe" : "jeriko";

/** Version target pattern: stable, latest, or semver (with optional prerelease). */
export const VERSION_TARGET_RE = /^(stable|latest|[0-9]+\.[0-9]+\.[0-9]+(-[^\s]+)?)$/;

// ---------------------------------------------------------------------------
// Shell completions
// ---------------------------------------------------------------------------

const COMMANDS = [
  "sys", "exec", "proc", "net", "fs", "doc", "browse", "search", "screenshot",
  "email", "msg", "notify", "audio", "notes", "remind", "calendar", "contacts",
  "music", "clipboard", "window", "camera", "open", "location",
  "stripe", "github", "paypal", "vercel", "twilio", "x", "gdrive", "onedrive",
  "gmail", "outlook", "connectors",
  "code", "create", "dev", "parallel", "ask", "memory", "discover", "prompt",
  "skill", "share",
  "init", "server", "task", "job", "install", "trust", "uninstall", "setup", "update",
  "plan", "upgrade", "billing",
];

const BASH_COMPLETION = `
_jeriko() {
    local cur="\${COMP_WORDS[COMP_CWORD]}"
    local commands="${COMMANDS.join(" ")}"
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
}
complete -F _jeriko jeriko
`.trim();

const ZSH_COMPLETION = `#compdef jeriko
_jeriko() {
    local -a commands
    commands=(
        'sys:System information'
        'exec:Execute shell commands'
        'proc:Process management'
        'net:Network operations'
        'fs:Filesystem operations'
        'doc:Document read/convert/create'
        'browse:Open URLs and fetch content'
        'search:Web search'
        'screenshot:Screen capture'
        'email:Email via native mail apps'
        'msg:Send messages (iMessage, SMS)'
        'notify:System notifications'
        'audio:Audio playback and recording'
        'notes:Apple Notes'
        'remind:Reminders'
        'calendar:Calendar events'
        'contacts:Contacts'
        'music:Music playback'
        'clipboard:Clipboard read/write'
        'window:Window management'
        'camera:Camera capture'
        'open:Open files/URLs/apps'
        'location:Location services'
        'stripe:Stripe API'
        'github:GitHub API'
        'paypal:PayPal API'
        'vercel:Vercel API'
        'twilio:Twilio API'
        'x:X (Twitter) API'
        'gdrive:Google Drive API'
        'onedrive:OneDrive API'
        'gmail:Gmail API'
        'outlook:Outlook API'
        'connectors:Manage OAuth and API connectors'
        'code:Code analysis'
        'create:Project scaffolding'
        'dev:Development tools'
        'parallel:Parallel task execution'
        'ask:Ask the AI agent'
        'memory:Session memory'
        'discover:Auto-generate system prompt'
        'prompt:Manage custom prompts'
        'skill:Manage reusable agent skills'
        'share:Share agent sessions'
        'init:Setup wizard'
        'server:Daemon management'
        'task:Task management'
        'job:Scheduled jobs'
        'install:Install plugins or self-install'
        'trust:Trust a plugin'
        'uninstall:Remove plugins'
        'setup:Post-install shell integration'
        'update:Update to latest version'
        'plan:Show current billing plan and usage'
        'upgrade:Upgrade to Pro plan'
        'billing:Manage billing and subscription'
    )
    _describe 'command' commands
}
_jeriko "$@"
`.trim();

const FISH_COMPLETION = COMMANDS
  .map((c) => `complete -c jeriko -n '__fish_use_subcommand' -a '${c}'`)
  .join("\n");

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

export function info(msg: string): void {
  console.log(`\x1b[34m→\x1b[0m ${msg}`);
}

export function success(msg: string): void {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

export function warn(msg: string): void {
  console.log(`\x1b[33m!\x1b[0m ${msg}`);
}

function safeWrite(path: string, content: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Setup steps
// ---------------------------------------------------------------------------

export function setupDirectories(): void {
  info("Creating directories...");

  const dirs = [
    DATA_DIR,
    join(DATA_DIR, "data"),
    join(DATA_DIR, "data", "logs"),
    join(DATA_DIR, "data", "files"),
    join(DATA_DIR, "data", "tasks"),
    join(DATA_DIR, "data", "jobs"),
    CONFIG_DIR,
    join(DATA_DIR, "projects"),
    join(DATA_DIR, "memory"),
    join(DATA_DIR, "plugins"),
    join(DATA_DIR, "prompts"),
    join(DATA_DIR, "skills"),
    join(DATA_DIR, "downloads"),
    INSTALL_DIR,
    VERSIONS_DIR,
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  success("Directories created");
}

export function setupCompletions(): void {
  if (IS_WINDOWS) {
    info("Shell completions not supported on Windows (use PowerShell tab completion)");
    return;
  }

  info("Installing shell completions...");

  const shell = (process.env.SHELL ?? "").split("/").pop() ?? "";

  // Bash
  const bashDir = join(
    process.env.XDG_DATA_HOME ?? join(HOME, ".local", "share"),
    "bash-completion",
    "completions",
  );
  safeWrite(join(bashDir, "jeriko"), BASH_COMPLETION);

  // Zsh
  const zshDir = join(
    process.env.XDG_DATA_HOME ?? join(HOME, ".local", "share"),
    "zsh",
    "site-functions",
  );
  safeWrite(join(zshDir, "_jeriko"), ZSH_COMPLETION);

  // Fish
  const fishDir = join(HOME, ".config", "fish", "completions");
  if (existsSync(join(HOME, ".config", "fish"))) {
    safeWrite(join(fishDir, "jeriko.fish"), FISH_COMPLETION);
  }

  success(`Shell completions installed (${shell || "all shells"})`);
}

export function setupPath(): void {
  info("Checking PATH...");

  if (IS_WINDOWS) {
    setupPathWindows();
    return;
  }

  const pathDirs = (process.env.PATH ?? "").split(":");
  if (pathDirs.includes(INSTALL_DIR)) {
    success("PATH already includes ~/.local/bin");
    return;
  }

  const shell = (process.env.SHELL ?? "").split("/").pop() ?? "";
  let profile: string;
  let pathLine: string;

  switch (shell) {
    case "zsh":
      profile = join(HOME, ".zshrc");
      pathLine = `export PATH="$HOME/.local/bin:$PATH"`;
      break;
    case "bash":
      profile = existsSync(join(HOME, ".bash_profile"))
        ? join(HOME, ".bash_profile")
        : join(HOME, ".bashrc");
      pathLine = `export PATH="$HOME/.local/bin:$PATH"`;
      break;
    case "fish":
      profile = join(HOME, ".config", "fish", "config.fish");
      pathLine = `fish_add_path $HOME/.local/bin`;
      break;
    default:
      profile = join(HOME, ".profile");
      pathLine = `export PATH="$HOME/.local/bin:$PATH"`;
      break;
  }

  if (existsSync(profile)) {
    const content = readFileSync(profile, "utf-8");
    if (content.includes(".local/bin")) {
      success("PATH already configured in " + profile);
      return;
    }
  }

  const block = `\n# Jeriko CLI\n${pathLine}\n`;
  if (existsSync(profile)) {
    const existing = readFileSync(profile, "utf-8");
    writeFileSync(profile, existing + block, "utf-8");
  } else {
    writeFileSync(profile, block, "utf-8");
  }

  success(`PATH added to ${profile}`);
  warn(`Run: source ${profile}  (or open a new terminal)`);
}

function setupPathWindows(): void {
  try {
    const userPath = execSync(
      `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('PATH','User')"`,
      { encoding: "utf-8", timeout: 10000 },
    ).trim();

    if (userPath.includes(INSTALL_DIR)) {
      success("PATH already includes " + INSTALL_DIR);
      return;
    }

    // Write a temp .ps1 script to avoid all shell escaping issues.
    // PowerShell here-strings and encoded commands are fragile with nested quotes;
    // a temp file is the safest cross-platform approach (used by Bun, Rust installers).
    const tmpScript = join(process.env.TEMP ?? process.env.TMP ?? "C:\\Windows\\Temp", "jeriko-path-setup.ps1");
    const ps1 = [
      `$dir = "${INSTALL_DIR.replace(/\\/g, "\\\\").replace(/"/g, '`"')}"`,
      `$cur = [Environment]::GetEnvironmentVariable('PATH', 'User')`,
      `if ($cur -and $cur.Length -gt 0) {`,
      `  [Environment]::SetEnvironmentVariable('PATH', "$dir;$cur", 'User')`,
      `} else {`,
      `  [Environment]::SetEnvironmentVariable('PATH', $dir, 'User')`,
      `}`,
    ].join("\n");

    writeFileSync(tmpScript, ps1, "utf-8");

    try {
      execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpScript}"`,
        { encoding: "utf-8", timeout: 10000 },
      );
      success(`PATH updated (added ${INSTALL_DIR})`);
      warn("Open a new terminal for PATH changes to take effect");
    } finally {
      try { unlinkSync(tmpScript); } catch { /* cleanup best-effort */ }
    }
  } catch {
    warn("Could not update PATH automatically — add " + INSTALL_DIR + " to your PATH manually");
  }
}

export function setupTemplates(): void {
  info("Installing project templates...");

  const candidates = [
    join(dirname(process.execPath), "..", "lib", "jeriko", "templates"),
    join(process.cwd(), "templates"),
    TEMPLATES_INSTALL_DIR,
  ];

  let sourceDir: string | null = null;
  for (const candidate of candidates) {
    if (existsSync(candidate) && candidate !== TEMPLATES_INSTALL_DIR) {
      sourceDir = candidate;
      break;
    }
  }

  if (!sourceDir) {
    if (existsSync(TEMPLATES_INSTALL_DIR)) {
      success("Templates already installed");
      return;
    }
    warn("Templates not found — jeriko create will work in dev mode only");
    return;
  }

  mkdirSync(TEMPLATES_INSTALL_DIR, { recursive: true });
  cpSync(sourceDir, TEMPLATES_INSTALL_DIR, { recursive: true });

  let count = 0;
  for (const sub of ["webdev", "deploy"]) {
    const subDir = join(TEMPLATES_INSTALL_DIR, sub);
    if (existsSync(subDir)) {
      try {
        const entries = readdirSync(subDir, { withFileTypes: true });
        count += entries.filter((e) => e.isDirectory()).length;
      } catch { /* ignore */ }
    }
  }

  success(`${count} project templates installed`);
}

/**
 * Install the agent system prompt (AGENT.md → ~/.config/jeriko/agent.md).
 *
 * Searches known locations where AGENT.md might exist:
 *   1. Alongside the binary (binary installers place it in the download dir)
 *   2. In the project root (source builds, unix-install.sh)
 *   3. In the data dir (~/.jeriko/AGENT.md — legacy location)
 *
 * If found, copies to the canonical config location where the kernel reads it.
 * If not found, warns — the agent will have no system prompt until configured.
 */
export function setupAgentPrompt(): void {
  info("Installing agent system prompt...");

  const target = join(CONFIG_DIR, "agent.md");

  // If already installed, skip (user may have customized it)
  if (existsSync(target)) {
    success("Agent prompt exists → " + target);
    return;
  }

  const candidates = [
    // install.sh places agent.md next to the downloaded binary
    join(dirname(process.execPath), "agent.md"),
    // Source builds (running from cloned repo)
    join(process.cwd(), "AGENT.md"),
    // Legacy location (unix-install.sh copies here)
    join(DATA_DIR, "AGENT.md"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
      copyFileSync(candidate, target);
      success(`Agent prompt installed → ${target}`);
      return;
    }
  }

  warn("AGENT.md not found — agent will have no system prompt until configured");
}

/**
 * Ensure a stable user ID exists in ~/.config/jeriko/.env.
 *
 * The user ID is a globally unique identifier for this Jeriko installation.
 * Used for relay routing: webhooks, OAuth callbacks, and billing are scoped
 * to this ID so the relay server can forward events to the correct machine.
 *
 * Idempotent — preserves the existing ID if one is already set.
 */
export function setupUserId(): void {
  info("Checking user identity...");

  const envFile = join(CONFIG_DIR, ".env");

  // Check if JERIKO_USER_ID already exists in env or the secrets file
  if (process.env.JERIKO_USER_ID) {
    success(`User ID exists: ${process.env.JERIKO_USER_ID.slice(0, 8)}...`);
    return;
  }

  // Check the .env file directly (process.env may not have loaded it yet)
  if (existsSync(envFile)) {
    const content = readFileSync(envFile, "utf-8");
    const match = content.match(/^JERIKO_USER_ID=(.+)$/m);
    if (match?.[1]) {
      process.env.JERIKO_USER_ID = match[1].trim().replace(/^["']|["']$/g, "");
      success(`User ID exists: ${process.env.JERIKO_USER_ID.slice(0, 8)}...`);
      return;
    }
  }

  // Generate and persist a new user ID
  const userId = randomUUID();

  mkdirSync(CONFIG_DIR, { recursive: true });

  // Append to .env (same pattern as saveSecret in shared/secrets.ts)
  const existingContent = existsSync(envFile) ? readFileSync(envFile, "utf-8") : "";
  const lines = existingContent.split("\n").filter((l) => l.trim() !== "");
  lines.push(`JERIKO_USER_ID=${userId}`);
  writeFileSync(envFile, lines.join("\n") + "\n", { mode: 0o600 });

  try {
    chmodSync(envFile, 0o600);
  } catch { /* best-effort on some filesystems */ }

  process.env.JERIKO_USER_ID = userId;
  success(`User ID generated: ${userId.slice(0, 8)}...`);
}

export function verifyInstallation(): void {
  info("Verifying installation...");

  const binary = join(INSTALL_DIR, BINARY_NAME);
  if (!existsSync(binary)) {
    warn("Binary not found at " + binary);
    return;
  }

  try {
    const version = execSync(`"${binary}" --version`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    success(`Installed: ${version}`);
  } catch {
    warn("Binary exists but --version failed");
  }
}

// ---------------------------------------------------------------------------
// Versioned installation
// ---------------------------------------------------------------------------

/**
 * Compute the versioned binary path.
 *
 * Layout:
 *   ~/.local/share/jeriko/versions/{version}/jeriko[.exe]
 */
export function versionedBinaryPath(version: string): string {
  return join(VERSIONS_DIR, version, BINARY_NAME);
}

/**
 * Install the current binary into the versioned directory and create a symlink
 * (or copy on Windows) at `~/.local/bin/jeriko`.
 */
export function installVersioned(version: string): void {
  const versionDir = join(VERSIONS_DIR, version);
  const versionedBinary = join(versionDir, BINARY_NAME);
  const installTarget = join(INSTALL_DIR, BINARY_NAME);

  // 1. Create version directory
  mkdirSync(versionDir, { recursive: true });

  // 2. Copy current binary to versioned location
  const sourceBinary = process.execPath;
  info(`Installing version ${version}...`);
  copyFileSync(sourceBinary, versionedBinary);
  if (!IS_WINDOWS) {
    chmodSync(versionedBinary, 0o755);
  }
  success(`Binary stored at ${versionedBinary}`);

  // 3. Create symlink (or copy on Windows) at install location
  mkdirSync(INSTALL_DIR, { recursive: true });

  if (IS_WINDOWS) {
    // Windows: copy instead of symlink (symlinks require admin on older Windows)
    copyFileSync(versionedBinary, installTarget);
    success(`Binary copied to ${installTarget}`);
  } else {
    // Unix: symlink
    try {
      unlinkSync(installTarget);
    } catch { /* doesn't exist yet */ }
    symlinkSync(versionedBinary, installTarget);
    success(`Symlinked ${installTarget} → ${versionedBinary}`);
  }
}

/**
 * Check if a CLI argument looks like a self-install target
 * (stable, latest, or semver) vs. a plugin package name.
 */
export function isSelfInstallTarget(arg: string): boolean {
  return VERSION_TARGET_RE.test(arg);
}
