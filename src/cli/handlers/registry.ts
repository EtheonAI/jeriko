/**
 * Command Registry — central registry for all management commands.
 *
 * Stores CommandDefinition instances and resolves lookups by name or alias.
 * Used by CLI dispatcher, REPL slash handler, and channel command adapter.
 *
 * Agent tools (exec, sys, fs, etc.) are NOT registered here.
 */

import type {
  CommandDefinition,
  CommandCategory,
  CommandSurface,
} from "../../shared/command-handler.js";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** All registered command definitions, keyed by primary name. */
const commands = new Map<string, CommandDefinition>();

/** Alias → primary name mapping. */
const aliases = new Map<string, string>();

/** Register a command definition. */
export function registerCommand(def: CommandDefinition): void {
  commands.set(def.name, def);

  // Register aliases
  if (def.aliases) {
    for (const alias of def.aliases) {
      aliases.set(alias, def.name);
    }
  }
}

/** Look up a command by name or alias. */
export function getCommand(name: string): CommandDefinition | undefined {
  const resolved = aliases.get(name) ?? name;
  return commands.get(resolved);
}

/** Check if a command exists (by name or alias). */
export function hasCommand(name: string): boolean {
  return commands.has(name) || aliases.has(name);
}

/** Get all registered commands. */
export function getAllCommands(): CommandDefinition[] {
  return Array.from(commands.values());
}

/** Get commands filtered by surface. */
export function getCommandsForSurface(
  surface: CommandSurface,
): CommandDefinition[] {
  return getAllCommands().filter((cmd) => cmd.surfaces.has(surface));
}

/** Get commands grouped by category. */
export function getCommandsByCategory(): Map<CommandCategory, CommandDefinition[]> {
  const grouped = new Map<CommandCategory, CommandDefinition[]>();
  for (const cmd of commands.values()) {
    const list = grouped.get(cmd.category) ?? [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }
  return grouped;
}

/**
 * Generate a help listing for a specific surface.
 * Returns lines grouped by category.
 */
export function generateHelp(surface: CommandSurface): Map<CommandCategory, string[]> {
  const help = new Map<CommandCategory, string[]>();
  for (const cmd of getCommandsForSurface(surface)) {
    const lines = help.get(cmd.category) ?? [];
    const prefix = surface === "cli" ? `jeriko ${cmd.name}` : `/${cmd.name}`;

    if (cmd.subcommands?.length) {
      // Show subcommands that are available on this surface
      const subs = cmd.subcommands.filter(
        (sub) => !sub.surfaces || sub.surfaces.has(surface),
      );
      for (const sub of subs) {
        lines.push(`  ${prefix} ${sub.name}  — ${sub.description}`);
      }
    } else {
      lines.push(`  ${prefix}  — ${cmd.description}`);
    }

    help.set(cmd.category, lines);
  }
  return help;
}
