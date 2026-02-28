import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeAppleScript } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "contacts",
  description: "Contacts (search, list, get)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko contacts <action> [options]");
      console.log("\nActions:");
      console.log("  search <name>     Search contacts by name");
      console.log("  list              List all contacts");
      console.log("  get <name>        Get full contact details");
      console.log("\nFlags:");
      console.log("  --limit <n>       Max results (default: 20)");
      console.log("  --group <name>    Filter by group");
      process.exit(0);
    }

    if (platform() !== "darwin") fail("Contacts is only available on macOS");

    const action = parsed.positional[0];
    if (!action) fail("Missing action. Usage: jeriko contacts <search|list|get>");
    const limit = parseInt(flagStr(parsed, "limit", "20"), 10);

    switch (action) {
      case "search": {
        const query = parsed.positional.slice(1).join(" ");
        if (!query) fail("Missing search query. Usage: jeriko contacts search <name>");
        const queryEsc = escapeAppleScript(query);
        const script = `tell application "Contacts"
  set results to {}
  set matches to (every person whose name contains "${queryEsc}")
  repeat with p in matches
    set end of results to (name of p) & " <" & (value of first email of p) & ">"
  end repeat
  return results
end tell`;
        try {
          const output = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8", timeout: 15000 });
          const contacts = output.trim().split(", ").filter(Boolean).slice(0, limit);
          ok({ query, contacts, count: contacts.length });
        } catch {
          ok({ query, contacts: [], count: 0 });
        }
        break;
      }
      case "list": {
        const script = `tell application "Contacts" to get name of every person`;
        const output = execSync(`osascript -e '${script}'`, { encoding: "utf-8", timeout: 15000 });
        const names = output.trim().split(", ").filter(Boolean).slice(0, limit);
        ok({ contacts: names, count: names.length });
        break;
      }
      case "get": {
        const name = parsed.positional.slice(1).join(" ");
        if (!name) fail("Missing contact name. Usage: jeriko contacts get <name>");
        const nameEsc = escapeAppleScript(name);
        const script = `tell application "Contacts"
  set p to first person whose name is "${nameEsc}"
  set emails to value of every email of p
  set phones to value of every phone of p
  return (name of p) & "|" & (emails as string) & "|" & (phones as string)
end tell`;
        try {
          const output = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
          const parts = output.trim().split("|");
          ok({ name: parts[0], emails: parts[1], phones: parts[2] });
        } catch {
          fail(`Contact not found: "${name}"`, 5);
        }
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use search, list, or get.`);
    }
  },
};
