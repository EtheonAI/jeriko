import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PLUGINS_DIR = join(homedir(), ".jeriko", "plugins");
const REGISTRY_FILE = join(PLUGINS_DIR, "registry.json");

interface PluginEntry {
  name: string;
  version: string;
  path: string;
  trusted: boolean;
  installed_at: string;
  trusted_at?: string;
  revoked_at?: string;
}

export const command: CommandHandler = {
  name: "trust",
  description: "Plugin trust management",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko trust <action> [plugin]");
      console.log("\nActions:");
      console.log("  grant <plugin>    Trust a plugin (allow tool access)");
      console.log("  revoke <plugin>   Revoke trust from a plugin");
      console.log("  list              List all plugins with trust status");
      console.log("  audit             Show trust change history");
      process.exit(0);
    }

    const action = parsed.positional[0] ?? "list";
    const registry = loadRegistry();

    switch (action) {
      case "grant": {
        const name = parsed.positional[1];
        if (!name) fail("Missing plugin name. Usage: jeriko trust grant <plugin>");
        if (!registry[name]) fail(`Plugin not installed: "${name}"`, 5);
        registry[name].trusted = true;
        registry[name].trusted_at = new Date().toISOString();
        delete registry[name].revoked_at;
        saveRegistry(registry);
        ok({ action: "grant", plugin: name, trusted: true });
        break;
      }
      case "revoke": {
        const name = parsed.positional[1];
        if (!name) fail("Missing plugin name. Usage: jeriko trust revoke <plugin>");
        if (!registry[name]) fail(`Plugin not installed: "${name}"`, 5);
        registry[name].trusted = false;
        registry[name].revoked_at = new Date().toISOString();
        saveRegistry(registry);
        ok({ action: "revoke", plugin: name, trusted: false });
        break;
      }
      case "list": {
        const plugins = Object.values(registry).map((p) => ({
          name: p.name,
          trusted: p.trusted,
          installed_at: p.installed_at,
          trusted_at: p.trusted_at,
        }));
        ok({ plugins, count: plugins.length });
        break;
      }
      case "audit": {
        const entries = Object.values(registry).map((p) => ({
          name: p.name,
          trusted: p.trusted,
          installed_at: p.installed_at,
          trusted_at: p.trusted_at,
          revoked_at: p.revoked_at,
        }));
        ok({ audit: entries, count: entries.length });
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use grant, revoke, list, or audit.`);
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
