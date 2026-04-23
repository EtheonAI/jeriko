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
 *
 * Naming: plural nouns for collection managers (/sessions, /connectors, /skills, etc.)
 * Each manages its domain with subcommands.
 */
export const COMMAND_CATEGORIES: readonly CommandCategory[] = [
  {
    label: "Sessions",
    commands: [
      ["/help",           "Show available commands"],
      ["/new",            "Start a new session"],
      ["/sessions",       "Manage sessions (list, switch, delete, rename)"],
      ["/resume <slug>",  "Resume a previous session"],
      ["/history",        "Show message history"],
      ["/clear",          "Clear session messages"],
      ["/compact",        "Trigger context compaction"],
      ["/share",          "Share current session (list, revoke)"],
      ["/stop",           "Abort the current AI response"],
      ["/kill",           "Destroy session and start fresh"],
      ["/archive",        "Archive session and start fresh"],
      ["/cost",           "Session cost breakdown"],
    ],
  },
  {
    label: "Models",
    commands: [
      ["/model",            "Pick a model or add a provider"],
      ["/model <name>",     "Switch model (connects provider if needed)"],
      ["/model list",       "Browse all providers + models"],
      ["/model add [id]",   "Add a provider (preset picker + API key)"],
      ["/model rm [id]",    "Remove a provider"],
      ["/model pin <spec>", "Pin a model to your curated list"],
      ["/model unpin <spec>","Remove from curated list"],
      ["/model pins",       "Show your pinned models"],
    ],
  },
  {
    label: "Channels & Connectors",
    commands: [
      ["/channels",         "Manage channels (add, connect, disconnect, remove)"],
      ["/connectors",       "Manage connectors (connect, disconnect, auth, health)"],
    ],
  },
  {
    label: "Management",
    commands: [
      ["/tasks",            "Tasks hub (trigger, schedule, cron)"],
      ["/skills",           "Manage skills (list, create, remove, <name>)"],
      ["/notifications",    "Notification preferences (on, off)"],
    ],
  },
  {
    label: "Billing",
    commands: [
      ["/billing",         "Billing hub (manage, plan, upgrade, cancel)"],
      ["/plan",            "Show billing plan and usage"],
      ["/upgrade",         "Upgrade to Pro plan"],
    ],
  },
  {
    label: "System",
    commands: [
      ["/onboard",        "Run setup wizard"],
      ["/status",         "Daemon status and stats"],
      ["/sys",            "System info"],
      ["/config",         "Show configuration"],
      ["/theme [name]",   "Show or switch theme"],
      ["/keybindings",    "Toggle the keybinding help overlay"],
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Slash command registry
// ---------------------------------------------------------------------------

/**
 * Canonical slash command map. Keys are completion targets,
 * values are short descriptions shown in help and suggestions.
 *
 * Plural nouns for collection managers — each handles its domain
 * with subcommands (list, add, remove, connect, etc.)
 */
export const SLASH_COMMANDS = new Map<string, string>([
  // Sessions
  ["/help",           "Show available commands"],
  ["/new",            "Start a new session"],
  ["/sessions",       "Manage sessions"],
  ["/resume",         "Resume a previous session"],
  ["/history",        "Show message history"],
  ["/clear",          "Clear session messages"],
  ["/compact",        "Trigger context compaction"],
  ["/share",          "Share current session"],
  ["/stop",           "Abort the current AI response"],
  ["/kill",           "Destroy session and start fresh"],
  ["/archive",        "Archive session and start fresh"],
  ["/cost",           "Session cost breakdown"],

  // Models
  ["/model",          "Switch model, add/remove provider"],

  // Channels & Connectors
  ["/channels",       "Manage channels"],
  ["/connectors",     "Manage connectors"],

  // Management
  ["/tasks",          "Tasks hub"],
  ["/skills",         "Manage skills"],
  ["/notifications",  "Notification preferences"],

  // Billing
  ["/billing",        "Billing hub (manage, plan, upgrade, cancel)"],
  ["/plan",           "Show billing plan and usage"],
  ["/upgrade",        "Upgrade to Pro plan"],

  // System
  ["/onboard",        "Run setup wizard"],
  ["/status",         "Daemon status and stats"],
  ["/sys",            "System info"],
  ["/config",         "Show configuration"],
  ["/theme",          "Show or switch theme"],
  ["/keybindings",    "Toggle the keybinding help overlay"],
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
