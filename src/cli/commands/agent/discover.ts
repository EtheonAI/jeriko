import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok } from "../../../shared/output.js";

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
      console.log("  --list                 List all commands as JSON");
      console.log("  --format toon|verbose  Output format (default: toon)");
      console.log("  --output <path>        Write to file instead of stdout");
      process.exit(0);
    }

    const format = flagStr(parsed, "format", "toon");

    // Use the dispatcher registry — no filesystem scanning needed.
    // This works in both dev mode and compiled binaries.
    const { getCommands } = await import("../../dispatcher.js");
    const registry = await getCommands();

    // Group commands by category
    const grouped: Record<string, Array<{ name: string; description: string }>> = {};
    for (const cmd of registry.values()) {
      const cat = cmd.category ?? "other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat]!.push({ name: cmd.name, description: cmd.description });
    }

    if (flagBool(parsed, "list")) {
      const commands = [...registry.values()].map((c) => ({
        name: c.name,
        description: c.description,
        category: c.category ?? "other",
      }));
      ok({ commands, count: commands.length });
      return;
    }

    if (format === "toon") {
      const sections = Object.entries(grouped)
        .map(([cat, cmds]) => `## ${cat}\n${cmds.map((c) => `${c.name}: ${c.description}`).join("\n")}`)
        .join("\n\n");

      const total = [...registry.values()].length;
      const prompt = `# Jeriko CLI — Available Commands\n\n${sections}\n\nTotal: ${total} commands`;

      const output = flagStr(parsed, "output", "");
      if (output) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(output, prompt);
        ok({ written: output, commands: total });
      } else {
        ok({ prompt, commands: total, categories: Object.keys(grouped) });
      }
    } else {
      const commands = [...registry.values()].map((c) => ({
        name: c.name,
        description: c.description,
        category: c.category ?? "other",
      }));
      ok({ commands, count: commands.length });
    }
  },
};
