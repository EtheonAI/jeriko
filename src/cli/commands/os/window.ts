import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeAppleScript } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "window",
  description: "Window management (list, focus, resize, move)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko window <action> [options]");
      console.log("\nActions:");
      console.log("  list              List open windows");
      console.log("  focus <app>       Focus application window");
      console.log("  minimize <app>    Minimize window");
      console.log("  fullscreen <app>  Toggle fullscreen");
      process.exit(0);
    }

    if (platform() !== "darwin") fail("Window management is only available on macOS");

    const action = parsed.positional[0] ?? "list";

    switch (action) {
      case "list": {
        const script = `tell application "System Events"
  set appList to {}
  repeat with proc in (every process whose background only is false)
    set end of appList to (name of proc) & " (" & (count of windows of proc) & " windows)"
  end repeat
  return appList
end tell`;
        const output = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
        const windows = output.trim().split(", ").filter(Boolean);
        ok({ windows, count: windows.length });
        break;
      }
      case "focus": {
        const app = parsed.positional.slice(1).join(" ");
        if (!app) fail("Missing app name. Usage: jeriko window focus <app>");
        const appEsc = escapeAppleScript(app);
        execSync(`osascript -e 'tell application "${appEsc}" to activate'`, { encoding: "utf-8" });
        ok({ focused: app });
        break;
      }
      case "minimize": {
        const app = parsed.positional.slice(1).join(" ");
        if (!app) fail("Missing app name. Usage: jeriko window minimize <app>");
        const appEsc = escapeAppleScript(app);
        const script = `tell application "System Events" to set visible of process "${appEsc}" to false`;
        execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
        ok({ minimized: app });
        break;
      }
      case "fullscreen": {
        const app = parsed.positional.slice(1).join(" ");
        if (!app) fail("Missing app name. Usage: jeriko window fullscreen <app>");
        const appEsc = escapeAppleScript(app);
        const script = `tell application "System Events"
  tell process "${appEsc}"
    set value of attribute "AXFullScreen" of window 1 to not (value of attribute "AXFullScreen" of window 1)
  end tell
end tell`;
        execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8" });
        ok({ toggled_fullscreen: app });
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use list, focus, minimize, or fullscreen.`);
    }
  },
};
