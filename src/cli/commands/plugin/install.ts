import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  name: "install",
  description: "Install plugin",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko install <package> [options]");
      console.log("\nInstall a Jeriko plugin from npm or a local path.");
      console.log("\nExamples:");
      console.log("  jeriko install @jeriko/plugin-slack");
      console.log("  jeriko install ./my-plugin");
      console.log("  jeriko install https://github.com/user/jeriko-plugin");
      console.log("\nFlags:");
      console.log("  --trust           Auto-trust the plugin after install");
      console.log("  --global          Install globally (default: per-project)");
      process.exit(0);
    }

    const pkg = parsed.positional[0];
    if (!pkg) fail("Missing package name. Usage: jeriko install <package>");

    const autoTrust = flagBool(parsed, "trust");

    // Ensure plugins directory exists
    if (!existsSync(PLUGINS_DIR)) {
      mkdirSync(PLUGINS_DIR, { recursive: true });
    }

    try {
      // Install via npm into the plugins directory
      console.log(`Installing ${pkg}...`);
      execSync(`npm install --prefix "${PLUGINS_DIR}" "${pkg}"`, {
        encoding: "utf-8",
        timeout: 120000,
      });

      // Parse the installed package name
      const pkgName = pkg.startsWith(".") || pkg.startsWith("/")
        ? pkg.split("/").pop()!.replace(/\/$/, "")
        : pkg.replace(/@[\d.]+$/, ""); // strip version suffix

      // Update registry
      const registry = loadRegistry();
      const entry: PluginEntry = {
        name: pkgName,
        version: "latest",
        path: join(PLUGINS_DIR, "node_modules", pkgName),
        trusted: autoTrust,
        installed_at: new Date().toISOString(),
      };

      registry[pkgName] = entry;
      saveRegistry(registry);

      ok({ installed: true, plugin: pkgName, trusted: autoTrust, path: entry.path });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Install failed: ${msg}`);
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
