import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const PLUGINS_DIR = join(homedir(), ".jeriko", "plugins");
const REGISTRY_FILE = join(PLUGINS_DIR, "registry.json");

interface PluginEntry {
  name: string;
  version: string;
  path: string;
  trusted: boolean;
  installed_at: string;
}

export const command: CommandHandler = {
  name: "uninstall",
  description: "Remove plugin",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko uninstall <plugin>");
      console.log("\nRemove an installed plugin.");
      console.log("\nFlags:");
      console.log("  --force           Force removal even if plugin is in use");
      process.exit(0);
    }

    const name = parsed.positional[0];
    if (!name) fail("Missing plugin name. Usage: jeriko uninstall <plugin>");

    const registry = loadRegistry();

    if (!registry[name]) {
      fail(`Plugin not installed: "${name}"`, 5);
    }

    const entry = registry[name];

    try {
      // Remove from npm
      try {
        execSync(`npm uninstall --prefix "${PLUGINS_DIR}" "${name}"`, {
          encoding: "utf-8",
          timeout: 60000,
        });
      } catch {
        // If npm uninstall fails, try to remove the directory directly
        if (existsSync(entry.path)) {
          rmSync(entry.path, { recursive: true, force: true });
        }
      }

      // Remove from registry
      delete registry[name];
      saveRegistry(registry);

      ok({ uninstalled: true, plugin: name });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Uninstall failed: ${msg}`);
    }
  },
};

function loadRegistry(): Record<string, PluginEntry> {
  if (!existsSync(REGISTRY_FILE)) return {};
  try {
    return JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveRegistry(registry: Record<string, PluginEntry>): void {
  writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2) + "\n");
}
