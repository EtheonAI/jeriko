import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeAppleScript } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "remind",
  description: "Apple Reminders (create, list, complete)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko remind <action> [options]");
      console.log("\nActions:");
      console.log("  create <text>       Create reminder");
      console.log("  list                List reminders");
      console.log("  complete <title>    Mark reminder complete");
      console.log("\nFlags:");
      console.log("  --list <name>       Reminder list (default: Reminders)");
      console.log("  --due <datetime>    Due date (ISO 8601)");
      process.exit(0);
    }

    if (platform() !== "darwin") fail("Reminders is only available on macOS");

    const action = parsed.positional[0];
    if (!action) fail("Missing action. Usage: jeriko remind <create|list|complete>");

    const listName = flagStr(parsed, "list", "Reminders");
    const listEsc = escapeAppleScript(listName);

    switch (action) {
      case "create": {
        const text = parsed.positional.slice(1).join(" ");
        if (!text) fail("Missing reminder text. Usage: jeriko remind create <text>");
        const textEsc = escapeAppleScript(text);
        const script = `tell application "Reminders"
  tell list "${listEsc}"
    make new reminder with properties {name:"${textEsc}"}
  end tell
end tell`;
        execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
        ok({ created: true, text, list: listName });
        break;
      }
      case "list": {
        const script = `tell application "Reminders"
  get name of every reminder of list "${listEsc}" whose completed is false
end tell`;
        const output = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
        const reminders = output.trim().split(", ").filter(Boolean);
        ok({ list: listName, reminders, count: reminders.length });
        break;
      }
      case "complete": {
        const title = parsed.positional.slice(1).join(" ");
        if (!title) fail("Missing reminder title. Usage: jeriko remind complete <title>");
        const titleEsc = escapeAppleScript(title);
        const script = `tell application "Reminders"
  tell list "${listEsc}"
    set completed of (first reminder whose name is "${titleEsc}") to true
  end tell
end tell`;
        try {
          execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
          ok({ completed: true, title, list: listName });
        } catch {
          fail(`Reminder not found: "${title}"`, 5);
        }
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use create, list, or complete.`);
    }
  },
};
