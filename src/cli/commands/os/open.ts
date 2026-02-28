import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeShellArg } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "open",
  description: "Open file, URL, or application",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko open <target> [options]");
      console.log("\nOpen a file, URL, or application using the system default handler.");
      console.log("\nExamples:");
      console.log("  jeriko open https://github.com");
      console.log("  jeriko open ./report.pdf");
      console.log("  jeriko open --app 'Visual Studio Code' .");
      console.log("\nFlags:");
      console.log("  --app <name>      Open with specific application");
      console.log("  --reveal          Reveal in Finder (macOS)");
      process.exit(0);
    }

    const target = parsed.positional[0];
    if (!target) fail("Missing target. Usage: jeriko open <file|url|app>");

    const os = platform();
    const app = flagStr(parsed, "app", "");
    const reveal = flagBool(parsed, "reveal");

    try {
      switch (os) {
        case "darwin": {
          const flags: string[] = [];
          if (app) flags.push(`-a ${escapeShellArg(app)}`);
          if (reveal) flags.push("-R");
          execSync(`open ${flags.join(" ")} ${escapeShellArg(target)}`, { encoding: "utf-8" });
          break;
        }
        case "linux": {
          execSync(`xdg-open ${escapeShellArg(target)}`, { encoding: "utf-8" });
          break;
        }
        default:
          fail(`Open not supported on: ${os}`);
      }
      ok({ opened: target, app: app || "default", platform: os });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Failed to open "${target}": ${msg}`);
    }
  },
};
