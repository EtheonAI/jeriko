/**
 * CLI Commands — Slash command registry, parsing, and completion.
 *
 * Single source of truth for all interactive chat slash commands.
 * Pure logic — no rendering, no side effects.
 */

// ---------------------------------------------------------------------------
// Command categories (for grouped help display)
// ---------------------------------------------------------------------------

export interface CommandCategory {
  label: string;
  commands: ReadonlyArray<[command: string, description: string]>;
}

/**
 * Grouped command categories for the help screen.
 * Each category contains commands with usage hints.
 */
export const COMMAND_CATEGORIES: readonly CommandCategory[] = [
  {
    label: "Session",
    commands: [
      ["/help",           "Show available commands"],
      ["/new",            "Start a new session"],
      ["/session",        "Show current session details"],
      ["/sessions",       "List recent sessions"],
      ["/resume <slug>",  "Resume a previous session"],
      ["/history",        "Show message history"],
      ["/clear",          "Clear session messages"],
      ["/compact",        "Trigger context compaction"],
      ["/share",          "Share current session"],
      ["/kill",           "Destroy session and start fresh"],
      ["/archive",        "Archive session and start fresh"],
    ],
  },
  {
    label: "Model",
    commands: [
      ["/model [name]",   "Show or switch the active model"],
      ["/models",         "List available models"],
    ],
  },
  {
    label: "Channels",
    commands: [
      ["/channels",       "List messaging channels"],
      ["/channel …",      "connect | disconnect | add | remove <name>"],
    ],
  },
  {
    label: "Providers",
    commands: [
      ["/providers",        "List AI providers"],
      ["/provider add",     "Add a provider (interactive picker)"],
      ["/provider rm <id>", "Remove a provider"],
    ],
  },
  {
    label: "Management",
    commands: [
      ["/connectors",     "List connector status"],
      ["/connect <name>", "Connect a service"],
      ["/disconnect <n>", "Disconnect a service"],
      ["/auth [name]",    "Connector authentication"],
      ["/triggers",       "List active triggers"],
      ["/tasks",          "List background tasks"],
      ["/skills",         "List installed skills"],
      ["/skill <name>",   "Show skill details"],
      ["/notifications",  "Notification preferences"],
    ],
  },
  {
    label: "Billing",
    commands: [
      ["/plan",            "Show billing plan and usage"],
      ["/upgrade",         "Upgrade to Pro plan"],
      ["/billing",         "Manage billing and invoices"],
      ["/cancel",          "Cancel subscription"],
      ["/cost",            "Session cost breakdown"],
    ],
  },
  {
    label: "System",
    commands: [
      ["/status",         "Daemon status and stats"],
      ["/health",         "Check connector health"],
      ["/sys",            "System info"],
      ["/config",         "Show configuration"],
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Slash command registry
// ---------------------------------------------------------------------------

/**
 * Canonical slash command map. Keys are completion targets,
 * values are short descriptions shown in help and suggestions.
 */
export const SLASH_COMMANDS = new Map<string, string>([
  // Session
  ["/help",           "Show available commands"],
  ["/new",            "Start a new session"],
  ["/session",        "Show current session details"],
  ["/sessions",       "List recent sessions"],
  ["/resume",         "Resume a previous session"],
  ["/history",        "Show message history"],
  ["/clear",          "Clear session messages"],
  ["/compact",        "Trigger context compaction"],
  ["/share",          "Share current session"],
  ["/kill",           "Destroy session and start fresh"],
  ["/archive",        "Archive session and start fresh"],

  // Model
  ["/model",          "Show or switch the active model"],
  ["/models",         "List available models"],

  // Channels
  ["/channels",       "List messaging channels"],
  ["/channel",        "Connect or disconnect a channel"],

  // Providers
  ["/providers",      "List AI providers"],
  ["/provider",       "Manage AI providers"],

  // Management
  ["/connectors",     "List connector status"],
  ["/connect",        "Connect a service"],
  ["/disconnect",     "Disconnect a service"],
  ["/auth",           "Connector authentication"],
  ["/triggers",       "List active triggers"],
  ["/tasks",          "List background tasks"],
  ["/skills",         "List installed skills"],
  ["/skill",          "Show skill details"],
  ["/notifications",  "Notification preferences"],

  // Billing
  ["/plan",           "Show billing plan and usage"],
  ["/upgrade",        "Upgrade to Pro plan"],
  ["/billing",        "Manage billing and invoices"],
  ["/cancel",         "Cancel subscription"],
  ["/cost",           "Session cost breakdown"],

  // System
  ["/status",         "Daemon status and stats"],
  ["/health",         "Check connector health"],
  ["/sys",            "System info"],
  ["/config",         "Show configuration"],
]);

/**
 * Help display entries — extended versions with argument syntax.
 * Flattened from COMMAND_CATEGORIES for backward compatibility.
 */
export const HELP_ENTRIES: ReadonlyArray<[command: string, description: string]> =
  COMMAND_CATEGORIES.flatMap((cat) => cat.commands);

// ---------------------------------------------------------------------------
// Exit detection
// ---------------------------------------------------------------------------

/** Recognized exit commands that terminate the REPL. */
const EXIT_COMMANDS = new Set(["exit", "quit", ".exit", "/exit", "/quit"]);

/** Check if input is an exit command. */
export function isExitCommand(input: string): boolean {
  return EXIT_COMMANDS.has(input.trim());
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Parsed slash command with name and trailing arguments. */
export interface ParsedSlashCommand {
  name: string;
  args: string;
}

/**
 * Parse a slash command from raw input.
 * Returns null if the input is not a slash command.
 */
export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmed = input.trim();

  // Exit commands are NOT slash commands — they're handled separately
  if (EXIT_COMMANDS.has(trimmed)) return null;
  if (!trimmed.startsWith("/")) return null;

  const spaceIdx = trimmed.indexOf(" ");
  const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

  return { name, args };
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

/**
 * Readline-compatible completer for slash commands.
 *
 * When user types `/` + Tab → shows all commands.
 * When user types `/he` + Tab → filters to `/help`.
 * Non-slash input returns no completions.
 */
export function slashCompleter(line: string): [completions: string[], line: string] {
  if (!line.startsWith("/")) return [[], line];

  const commands = Array.from(SLASH_COMMANDS.keys());
  const hits = commands.filter((c) => c.startsWith(line));
  return [hits.length > 0 ? hits : commands, line];
}

/** Tool names that spawn sub-agents — handled specially in rendering. */
export const SUB_AGENT_TOOLS = new Set(["delegate", "parallel_tasks"]);
