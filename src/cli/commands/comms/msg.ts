import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeAppleScript } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "msg",
  description: "iMessage",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko msg <action> [options]");
      console.log("\nActions:");
      console.log("  send <contact> <text>   Send iMessage");
      console.log("  recent [--limit <n>]    Recent conversations");
      console.log("\nFlags:");
      console.log("  --limit <n>       Max results (default: 10)");
      process.exit(0);
    }

    if (platform() !== "darwin") {
      fail("iMessage is only available on macOS");
    }

    const action = parsed.positional[0];
    if (!action) fail("Missing action. Usage: jeriko msg <send|recent>");

    switch (action) {
      case "send": {
        const contact = parsed.positional[1];
        const text = parsed.positional.slice(2).join(" ");
        if (!contact || !text) fail("Usage: jeriko msg send <contact> <text>");

        const escaped = escapeAppleScript(text);
        const contactEsc = escapeAppleScript(contact);

        const script = `tell application "Messages"
  set targetBuddy to buddy "${contactEsc}" of service "iMessage"
  send "${escaped}" to targetBuddy
end tell`;

        try {
          execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
          ok({ sent: true, to: contact, message: text });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Failed to send message: ${msg}`);
        }
        break;
      }
      case "recent": {
        // TODO: query Messages.app SQLite database for recent conversations
        fail("Recent messages not yet implemented. Requires Messages.app database access.");
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use send or recent.`);
    }
  },
};
