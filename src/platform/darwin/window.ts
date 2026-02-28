// Darwin — Window management via AppleScript (System Events)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeAppleScript } from "../../shared/escape.js";
import type { WindowProvider, WindowInfo } from "../interface.js";

const execAsync = promisify(exec);

function runOsascript(script: string): Promise<string> {
  return execAsync(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`)
    .then((r) => r.stdout.trim());
}

export class DarwinWindow implements WindowProvider {
  async list(): Promise<WindowInfo[]> {
    const script = `
tell application "System Events"
  set output to ""
  set idx to 0
  repeat with proc in (every process whose visible is true)
    set appName to name of proc
    set isFront to (frontmost of proc) as string
    repeat with w in windows of proc
      set wTitle to name of w
      try
        set wPos to position of w
        set wSize to size of w
        set output to output & idx & "\t" & appName & "\t" & wTitle & "\t" & (item 1 of wPos) & "\t" & (item 2 of wPos) & "\t" & (item 1 of wSize) & "\t" & (item 2 of wSize) & "\t" & isFront & "\n"
      end try
      set idx to idx + 1
    end repeat
  end repeat
  return output
end tell`;
    const raw = await runOsascript(script);
    if (!raw) return [];

    return raw.split("\n").filter(Boolean).map((line) => {
      const [id = "0", app = "", title = "", x = "0", y = "0", w = "0", h = "0", focused = "false"] = line.split("\t");
      return {
        id: Number(id),
        app,
        title,
        x: Number(x),
        y: Number(y),
        width: Number(w),
        height: Number(h),
        focused: focused === "true",
      };
    });
  }

  async focus(app: string): Promise<void> {
    const safeApp = escapeAppleScript(app);
    await runOsascript(`
tell application "${safeApp}"
  activate
end tell`);
  }

  async minimize(app: string): Promise<void> {
    const safeApp = escapeAppleScript(app);
    await runOsascript(`
tell application "System Events"
  tell process "${safeApp}"
    try
      click button 3 of window 1
    on error
      set miniaturized of window 1 to true
    end try
  end tell
end tell`);
  }

  async resize(app: string, width: number, height: number): Promise<void> {
    const safeApp = escapeAppleScript(app);
    await runOsascript(`
tell application "System Events"
  tell process "${safeApp}"
    set size of window 1 to {${Math.floor(width)}, ${Math.floor(height)}}
  end tell
end tell`);
  }

  async close(app: string): Promise<void> {
    const safeApp = escapeAppleScript(app);
    await runOsascript(`
tell application "${safeApp}"
  close front window
end tell`);
  }
}
