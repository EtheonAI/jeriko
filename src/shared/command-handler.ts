/**
 * Unified Command Handler — shared interface for CLI, REPL, and Channel commands.
 *
 * Three surfaces invoke the same handlers through surface-specific adapters:
 *   - CLI adapter: parses argv, calls handler.handle(ctx)
 *   - REPL adapter: parses /slash args, calls handler.handle(ctx)
 *   - Channel adapter: parses /slash args, adds keyboard layouts
 *
 * Agent tools (exec, sys, fs, etc.) are NOT part of this system.
 * They remain flat commands with JSON output and fast startup.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where the command is being executed. */
export type CommandSurface = "cli" | "repl" | "channel";

/** Context passed to every command handler. */
export interface CommandContext {
  /** Where this command is being executed. */
  surface: CommandSurface;
  /** Subcommand (e.g., "list", "new") — undefined for root invocation. */
  subcommand?: string;
  /** Positional arguments after the command/subcommand. */
  args: string[];
  /** Raw argument string (useful for channels). */
  rawArgs: string;
  /** Channel metadata (only present on channel surface). */
  channelMeta?: ChannelMetadata;
}

/** Metadata about the channel invoking the command. */
export interface ChannelMetadata {
  /** Channel type (telegram, whatsapp, etc.) */
  channelType: string;
  /** Chat ID within the channel. */
  chatId: string;
  /** User display name. */
  userName?: string;
}

/** Keyboard button for channel inline keyboards. */
export interface KeyboardButton {
  text: string;
  callbackData?: string;
}

/** Result returned by command handlers. */
export interface CommandResult {
  /** Formatted text response. */
  text: string;
  /** Optional inline keyboard layout (channels only). */
  keyboard?: KeyboardButton[][];
  /** Whether this was an error. */
  isError?: boolean;
  /** Suppress the default response (handler took care of output). */
  silent?: boolean;
}

/** Definition of a management command. */
export interface CommandDefinition {
  /** Primary command name (e.g., "session", "model"). */
  name: string;
  /** One-line description for help display. */
  description: string;
  /** Category for grouped help. */
  category: CommandCategory;
  /** Which surfaces support this command. */
  surfaces: Set<CommandSurface>;
  /** Supported subcommands (e.g., "list", "new", "switch"). */
  subcommands?: SubcommandDefinition[];
  /** Aliases (e.g., "/sessions" → "session list"). */
  aliases?: string[];
  /** Execute the command. */
  handle(ctx: CommandContext): Promise<CommandResult>;
}

/** Definition of a subcommand within a parent command. */
export interface SubcommandDefinition {
  /** Subcommand name (e.g., "list", "new"). */
  name: string;
  /** One-line description. */
  description: string;
  /** Which surfaces support this subcommand. */
  surfaces?: Set<CommandSurface>;
}

/** Command categories for grouped help display. */
export type CommandCategory =
  | "session"
  | "model"
  | "provider"
  | "connector"
  | "channel"
  | "trigger"
  | "skill"
  | "task"
  | "billing"
  | "server"
  | "config"
  | "system"
  | "notification";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a Set of surfaces. */
export function surfaces(...s: CommandSurface[]): Set<CommandSurface> {
  return new Set(s);
}

/** All three surfaces. */
export const ALL_SURFACES = surfaces("cli", "repl", "channel");

/** CLI and REPL only (no channels). */
export const CLI_REPL = surfaces("cli", "repl");

/** CLI only. */
export const CLI_ONLY = surfaces("cli");

/** Parse a raw command string into command name, subcommand, and args. */
export function parseCommandString(input: string): {
  command: string;
  subcommand?: string;
  args: string[];
  rawArgs: string;
} {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const command = (parts[0] ?? "").replace(/^\//, "").toLowerCase();
  const rest = parts.slice(1);

  return {
    command,
    subcommand: rest[0],
    args: rest,
    rawArgs: parts.slice(1).join(" "),
  };
}
