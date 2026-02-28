// Linux — Open URLs, files, and applications via xdg-open

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeShellArg } from "../../shared/escape.js";
import type { OpenProvider } from "../interface.js";

const execAsync = promisify(exec);

export class LinuxOpen implements OpenProvider {
  /** Open a URL in the default browser. */
  async url(url: string): Promise<void> {
    const safeUrl = escapeShellArg(url);
    await execAsync(`xdg-open ${safeUrl}`);
  }

  /** Open a file with its default application. */
  async file(path: string): Promise<void> {
    const safePath = escapeShellArg(path);
    await execAsync(`xdg-open ${safePath}`);
  }

  /** Launch an application by name or .desktop file. */
  async app(name: string): Promise<void> {
    const safeName = escapeShellArg(name);
    // Try gtk-launch first (handles .desktop files), fall back to xdg-open
    try {
      await execAsync(`gtk-launch ${safeName}`);
    } catch {
      await execAsync(`xdg-open ${safeName}`);
    }
  }
}
