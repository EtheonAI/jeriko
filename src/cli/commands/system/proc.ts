import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeShellArg } from "../../../shared/escape.js";
import { execSync } from "node:child_process";

export const command: CommandHandler = {
  name: "proc",
  description: "Process management (list, kill, find)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko proc <action> [options]");
      console.log("\nActions:");
      console.log("  list              List running processes");
      console.log("  kill <pid>        Kill process by PID");
      console.log("  find <name>       Find process by name");
      console.log("\nFlags:");
      console.log("  --sort cpu|mem    Sort by CPU or memory usage");
      console.log("  --limit <n>       Max results (default: 20)");
      process.exit(0);
    }

    const action = parsed.positional[0] ?? "list";
    const limit = parseInt(flagStr(parsed, "limit", "20"), 10);

    switch (action) {
      case "list": {
        const output = execSync("ps aux", { encoding: "utf-8" });
        const lines = output.trim().split("\n");
        const header = lines[0];
        const procs = lines.slice(1, 1 + limit);
        ok({ header, processes: procs, count: lines.length - 1, showing: procs.length });
        break;
      }
      case "kill": {
        const pid = parsed.positional[1];
        if (!pid) fail("Missing PID. Usage: jeriko proc kill <pid>");
        const pidNum = parseInt(pid, 10);
        if (isNaN(pidNum) || pidNum < 1) fail(`Invalid PID: "${pid}"`);
        try {
          process.kill(pidNum);
          ok({ killed: pidNum });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Failed to kill PID ${pidNum}: ${msg}`);
        }
        break;
      }
      case "find": {
        const name = parsed.positional[1];
        if (!name) fail("Missing process name. Usage: jeriko proc find <name>");
        const output = execSync(`pgrep -la ${escapeShellArg(name)} || true`, { encoding: "utf-8" });
        const matches = output.trim().split("\n").filter(Boolean);
        ok({ query: name, matches, count: matches.length });
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use list, kill, or find.`);
    }
  },
};
