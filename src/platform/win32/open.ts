// Win32 — Open URLs, files, and applications via start / PowerShell

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeShellArg } from "../../shared/escape.js";
import type { OpenProvider } from "../interface.js";

const execAsync = promisify(exec);

/** Escape for cmd.exe: double-quote wrapping with internal quote escaping. */
function escapeCmdArg(str: string): string {
  // Escape special cmd characters inside double quotes
  return '"' + str.replace(/"/g, '""').replace(/%/g, "%%") + '"';
}

export class Win32Open implements OpenProvider {
  /** Open a URL in the default browser. */
  async url(url: string): Promise<void> {
    // cmd start command handles URLs natively
    await execAsync(`start "" ${escapeCmdArg(url)}`, { shell: "cmd.exe" });
  }

  /** Open a file with its default application. */
  async file(path: string): Promise<void> {
    await execAsync(`start "" ${escapeCmdArg(path)}`, { shell: "cmd.exe" });
  }

  /** Launch an application by name or path. */
  async app(name: string): Promise<void> {
    // Try Start-Process first (handles app names), fall back to start
    try {
      await execAsync(
        `powershell.exe -NoProfile -Command "Start-Process '${name.replace(/'/g, "''")}'"`
      );
    } catch {
      await execAsync(`start "" ${escapeCmdArg(name)}`, { shell: "cmd.exe" });
    }
  }
}
