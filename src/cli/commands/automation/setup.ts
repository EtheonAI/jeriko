/**
 * `jeriko setup` — Post-install shell integration.
 *
 * Called by the install script after the binary is in place.
 * Handles:
 *   1. Create data + config directories
 *   2. Shell completions (bash, zsh, fish)
 *   3. PATH integration
 *   4. Verify installation
 *
 * Modeled after `claude install` from Claude Code.
 */

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync, cpSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const HOME = homedir();
const DATA_DIR = join(HOME, ".jeriko");
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME ?? join(HOME, ".config"), "jeriko");
const INSTALL_DIR = join(HOME, ".local", "bin");
const LIB_DIR = join(HOME, ".local", "lib", "jeriko");
const TEMPLATES_INSTALL_DIR = join(LIB_DIR, "templates");

// ---------------------------------------------------------------------------
// Shell completions
// ---------------------------------------------------------------------------

const COMMANDS = [
  "sys", "exec", "proc", "net", "fs", "doc", "browse", "search", "screenshot",
  "email", "msg", "notify", "audio", "notes", "remind", "calendar", "contacts",
  "music", "clipboard", "window", "camera", "open", "location",
  "stripe", "github", "paypal", "vercel", "twilio", "x", "gdrive", "onedrive",
  "code", "create", "dev", "parallel", "ask", "memory", "discover", "prompt",
  "init", "server", "task", "job", "install", "trust", "uninstall", "setup",
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
        'code:Code analysis'
        'create:Project scaffolding'
        'dev:Development tools'
        'parallel:Parallel task execution'
        'ask:Ask the AI agent'
        'memory:Session memory'
        'discover:Auto-generate system prompt'
        'prompt:Manage custom prompts'
        'init:Setup wizard'
        'server:Daemon management'
        'task:Task management'
        'job:Scheduled jobs'
        'setup:Post-install shell integration'
    )
    _describe 'command' commands
}
_jeriko "$@"
`.trim();

const FISH_COMPLETION = COMMANDS
  .map((c) => `complete -c jeriko -n '__fish_use_subcommand' -a '${c}'`)
  .join("\n");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function info(msg: string): void {
  console.log(`\x1b[34m→\x1b[0m ${msg}`);
}
function success(msg: string): void {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}
function warn(msg: string): void {
  console.log(`\x1b[33m!\x1b[0m ${msg}`);
}

function safeWrite(path: string, content: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content, "utf-8");
}

function getBinaryPath(): string {
  // Check where the currently running binary is
  const argv0 = process.argv[0] ?? "";
  if (argv0.includes("jeriko")) return argv0;
  // Fallback
  return join(INSTALL_DIR, "jeriko");
}

// ---------------------------------------------------------------------------
// Setup steps
// ---------------------------------------------------------------------------

function setupDirectories(): void {
  info("Creating directories...");

  const dirs = [
    // Core
    DATA_DIR,                          // ~/.jeriko
    join(DATA_DIR, "data"),            // ~/.jeriko/data — agent logs, DB
    join(DATA_DIR, "logs"),            // ~/.jeriko/logs — app logs
    CONFIG_DIR,                        // ~/.config/jeriko

    // Agent work directories
    join(DATA_DIR, "workspace"),       // ~/.jeriko/workspace — scripts, outputs, temp data
    join(DATA_DIR, "projects"),        // ~/.jeriko/projects — web/app dev projects

    // Subsystems
    join(DATA_DIR, "memory"),          // ~/.jeriko/memory — session memory, KV store
    join(DATA_DIR, "plugins"),         // ~/.jeriko/plugins — installed plugins
    join(DATA_DIR, "prompts"),         // ~/.jeriko/prompts — custom system prompts
    join(DATA_DIR, "downloads"),       // ~/.jeriko/downloads — cached release assets
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  success("Directories created");
}

function setupCompletions(): void {
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

function setupPath(): void {
  info("Checking PATH...");

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

  // Check if already added
  if (existsSync(profile)) {
    const content = readFileSync(profile, "utf-8");
    if (content.includes(".local/bin")) {
      success("PATH already configured in " + profile);
      return;
    }
  }

  // Append
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

function setupTemplates(): void {
  info("Installing project templates...");

  // Find templates relative to the running binary or source tree
  const candidates = [
    // Next to the binary (release tarball unpacked)
    join(dirname(process.execPath), "..", "lib", "jeriko", "templates"),
    // Dev mode: repo root
    join(process.cwd(), "templates"),
    // Already installed (skip copy)
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
    // Check if already installed
    if (existsSync(TEMPLATES_INSTALL_DIR)) {
      success("Templates already installed");
      return;
    }
    warn("Templates not found — jeriko create will work in dev mode only");
    return;
  }

  // Copy templates to ~/.local/lib/jeriko/templates/
  mkdirSync(TEMPLATES_INSTALL_DIR, { recursive: true });
  cpSync(sourceDir, TEMPLATES_INSTALL_DIR, { recursive: true });

  // Count what was installed
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

function verifyInstallation(): void {
  info("Verifying installation...");

  const binary = join(INSTALL_DIR, "jeriko");
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
// Command
// ---------------------------------------------------------------------------

export const command: CommandHandler = {
  name: "setup",
  description: "Post-install shell integration",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko setup");
      console.log("\nPost-install setup: directories, shell completions, PATH.");
      console.log("Called automatically by the install script.");
      process.exit(0);
    }

    console.log();
    console.log("\x1b[1m  Jeriko Setup\x1b[0m");
    console.log();

    setupDirectories();
    setupTemplates();
    setupCompletions();
    setupPath();
    verifyInstallation();

    console.log();
    success("Setup complete!");
    console.log();
    console.log("  Get started:");
    console.log("    \x1b[1mjeriko --help\x1b[0m          Show all commands");
    console.log("    \x1b[1mjeriko init\x1b[0m            Run setup wizard (API keys)");
    console.log("    \x1b[1mjeriko\x1b[0m                 Start interactive chat");
    console.log("    \x1b[1mjeriko server start\x1b[0m    Start the daemon");
    console.log();
  },
};
