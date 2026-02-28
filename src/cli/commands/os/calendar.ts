import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeAppleScript } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "calendar",
  description: "Calendar events (list, create, today)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko calendar <action> [options]");
      console.log("\nActions:");
      console.log("  today              Today's events");
      console.log("  list               List upcoming events");
      console.log("  create <title>     Create event");
      console.log("\nFlags:");
      console.log("  --calendar <name>  Calendar name");
      console.log("  --start <dt>       Start datetime (ISO 8601)");
      console.log("  --end <dt>         End datetime (ISO 8601)");
      console.log("  --location <text>  Event location");
      console.log("  --days <n>         Days to look ahead (default: 7)");
      process.exit(0);
    }

    if (platform() !== "darwin") fail("Calendar is only available on macOS");

    const action = parsed.positional[0] ?? "today";

    switch (action) {
      case "today":
      case "list": {
        const days = parseInt(flagStr(parsed, "days", action === "today" ? "1" : "7"), 10);
        const script = `set now to current date
set endDate to now + (${days} * days)
tell application "Calendar"
  set eventList to {}
  repeat with cal in calendars
    repeat with evt in (every event of cal whose start date >= now and start date <= endDate)
      set end of eventList to (summary of evt) & " | " & (start date of evt as string)
    end repeat
  end repeat
  return eventList
end tell`;
        try {
          const output = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8", timeout: 15000 });
          const events = output.trim().split(", ").filter(Boolean);
          ok({ period: `next ${days} day(s)`, events, count: events.length });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Calendar query failed: ${msg}`);
        }
        break;
      }
      case "create": {
        const title = parsed.positional.slice(1).join(" ");
        if (!title) fail("Missing event title. Usage: jeriko calendar create <title> --start <datetime>");
        const start = flagStr(parsed, "start", "");
        if (!start) fail("Missing --start flag. Usage: jeriko calendar create <title> --start <datetime>");
        const calName = flagStr(parsed, "calendar", "");
        const location = flagStr(parsed, "location", "");
        const titleEsc = escapeAppleScript(title);

        // TODO: proper datetime parsing and AppleScript event creation
        fail("Calendar event creation not yet fully implemented. Use: jeriko exec 'open -a Calendar'");
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use today, list, or create.`);
    }
  },
};
