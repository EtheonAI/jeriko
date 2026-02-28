import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeAppleScript } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "notes",
  description: "Apple Notes (create, list, search, read)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko notes <action> [options]");
      console.log("\nActions:");
      console.log("  create <title> --body <text>   Create note");
      console.log("  list                           List notes");
      console.log("  search <query>                 Search notes");
      console.log("  read <title>                   Read note by title");
      console.log("\nFlags:");
      console.log("  --folder <name>   Notes folder (default: Notes)");
      console.log("  --body <text>     Note body content");
      process.exit(0);
    }

    if (platform() !== "darwin") fail("Notes is only available on macOS");

    const action = parsed.positional[0];
    if (!action) fail("Missing action. Usage: jeriko notes <create|list|search|read>");

    switch (action) {
      case "create": {
        const title = parsed.positional[1];
        if (!title) fail("Missing title. Usage: jeriko notes create <title> --body <text>");
        const body = flagStr(parsed, "body", "");
        const folder = flagStr(parsed, "folder", "Notes");
        const titleEsc = escapeAppleScript(title);
        const bodyEsc = escapeAppleScript(body);
        const folderEsc = escapeAppleScript(folder);
        const script = `tell application "Notes"
  tell folder "${folderEsc}"
    make new note with properties {name:"${titleEsc}", body:"${bodyEsc}"}
  end tell
end tell`;
        execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
        ok({ created: true, title, folder });
        break;
      }
      case "list": {
        const folder = flagStr(parsed, "folder", "Notes");
        const folderEsc = escapeAppleScript(folder);
        const script = `tell application "Notes" to get name of every note of folder "${folderEsc}"`;
        const output = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
        const notes = output.trim().split(", ").filter(Boolean);
        ok({ folder, notes, count: notes.length });
        break;
      }
      case "search": {
        const query = parsed.positional.slice(1).join(" ");
        if (!query) fail("Missing search query. Usage: jeriko notes search <query>");
        // AppleScript search across all notes
        const queryEsc = escapeAppleScript(query);
        const script = `tell application "Notes"
  set matchingNotes to {}
  repeat with n in every note
    if name of n contains "${queryEsc}" or body of n contains "${queryEsc}" then
      set end of matchingNotes to name of n
    end if
  end repeat
  return matchingNotes
end tell`;
        const output = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8", timeout: 15000 });
        const results = output.trim().split(", ").filter(Boolean);
        ok({ query, results, count: results.length });
        break;
      }
      case "read": {
        const title = parsed.positional.slice(1).join(" ");
        if (!title) fail("Missing title. Usage: jeriko notes read <title>");
        const titleEsc = escapeAppleScript(title);
        const script = `tell application "Notes"
  set n to first note whose name is "${titleEsc}"
  return body of n
end tell`;
        try {
          const output = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
          ok({ title, body: output.trim() });
        } catch {
          fail(`Note not found: "${title}"`, 5);
        }
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use create, list, search, or read.`);
    }
  },
};
