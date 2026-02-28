import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "clipboard",
  description: "Clipboard (get, set, clear)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko clipboard <action> [text]");
      console.log("\nActions:");
      console.log("  get               Get clipboard contents");
      console.log("  set <text>        Set clipboard contents");
      console.log("  clear             Clear clipboard");
      process.exit(0);
    }

    const os = platform();
    const action = parsed.positional[0] ?? "get";

    switch (action) {
      case "get": {
        try {
          const cmd = os === "darwin" ? "pbpaste" : "xclip -selection clipboard -o";
          const content = execSync(cmd, { encoding: "utf-8" });
          ok({ content, length: content.length });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Clipboard read failed: ${msg}`);
        }
        break;
      }
      case "set": {
        const text = parsed.positional.slice(1).join(" ");
        if (!text) fail("Missing text. Usage: jeriko clipboard set <text>");
        try {
          const cmd = os === "darwin" ? "pbcopy" : "xclip -selection clipboard";
          // Pipe text via stdin to avoid shell injection entirely
          execSync(cmd, { encoding: "utf-8", input: text });
          ok({ set: true, length: text.length });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Clipboard write failed: ${msg}`);
        }
        break;
      }
      case "clear": {
        try {
          const cmd = os === "darwin" ? "pbcopy" : "xclip -selection clipboard";
          // Pipe empty string via stdin
          execSync(cmd, { encoding: "utf-8", input: "" });
          ok({ cleared: true });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Clipboard clear failed: ${msg}`);
        }
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use get, set, or clear.`);
    }
  },
};
