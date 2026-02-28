import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";

export const command: CommandHandler = {
  name: "screenshot",
  description: "Screen capture",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko screenshot [options]");
      console.log("\nCapture a screenshot of the screen or a window.");
      console.log("\nFlags:");
      console.log("  --output <path>   Output file path (default: ~/Desktop/screenshot.png)");
      console.log("  --window          Capture active window only");
      console.log("  --delay <s>       Delay before capture in seconds");
      process.exit(0);
    }

    const os = platform();
    const defaultPath = join(process.env.HOME || "~", "Desktop", `screenshot-${Date.now()}.png`);
    const output = resolve(flagStr(parsed, "output", defaultPath));
    const delay = parseInt(flagStr(parsed, "delay", "0"), 10);

    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay * 1000));
    }

    try {
      switch (os) {
        case "darwin": {
          const windowFlag = flagBool(parsed, "window") ? "-w" : "";
          execSync(`screencapture -x ${windowFlag} "${output}"`, { encoding: "utf-8" });
          break;
        }
        case "linux": {
          // Requires scrot or gnome-screenshot
          const windowFlag = flagBool(parsed, "window") ? "-u" : "";
          execSync(`scrot ${windowFlag} "${output}"`, { encoding: "utf-8" });
          break;
        }
        default:
          fail(`Screenshot not supported on platform: ${os}`);
      }

      if (!existsSync(output)) {
        fail("Screenshot was not saved (user may have cancelled)");
      }

      ok({ path: output, platform: os });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Screenshot failed: ${msg}`);
    }
  },
};
