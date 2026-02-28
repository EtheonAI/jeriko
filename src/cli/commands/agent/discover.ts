import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const command: CommandHandler = {
  name: "discover",
  description: "Auto-generate system prompts from commands",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko discover [options]");
      console.log("\nAuto-discover installed commands and generate a system prompt");
      console.log("listing all available capabilities.");
      console.log("\nFlags:");
      console.log("  --format toon|verbose  Output format (default: toon)");
      console.log("  --include-plugins      Include plugin commands");
      console.log("  --output <path>        Write to file instead of stdout");
      process.exit(0);
    }

    const format = flagStr(parsed, "format", "toon");

    // Import dispatcher to access command registry
    // We dynamically load the dispatcher to get the registered commands
    const { dispatcher } = await import("../../dispatcher.js");

    // Build command list by scanning the commands directory
    const commandsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
    const categories = readdirSync(commandsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const commands: Array<{ name: string; description: string; category: string }> = [];

    for (const category of categories) {
      const catDir = join(commandsDir, category);
      const files = readdirSync(catDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

      for (const file of files) {
        try {
          const mod = await import(join(catDir, file));
          if (mod.command && mod.command.name && mod.command.description) {
            commands.push({
              name: mod.command.name,
              description: mod.command.description,
              category,
            });
          }
        } catch {
          // Skip files that fail to import
        }
      }
    }

    if (format === "toon") {
      // Generate compact TOON-format prompt
      const grouped: Record<string, string[]> = {};
      for (const cmd of commands) {
        if (!grouped[cmd.category]) grouped[cmd.category] = [];
        grouped[cmd.category]!.push(`${cmd.name}: ${cmd.description}`);
      }

      const sections = Object.entries(grouped)
        .map(([cat, cmds]) => `## ${cat}\n${cmds.join("\n")}`)
        .join("\n\n");

      const prompt = `# Jeriko CLI — Available Commands\n\n${sections}\n\nTotal: ${commands.length} commands`;

      const output = flagStr(parsed, "output", "");
      if (output) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(output, prompt);
        ok({ written: output, commands: commands.length });
      } else {
        ok({ prompt, commands: commands.length, categories: Object.keys(grouped) });
      }
    } else {
      ok({ commands, count: commands.length });
    }
  },
};
