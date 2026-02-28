// Darwin — macOS notifications via osascript (display notification)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeAppleScript } from "../../shared/escape.js";
import type { NotifyProvider } from "../interface.js";

const execAsync = promisify(exec);

export class DarwinNotify implements NotifyProvider {
  /**
   * Send a macOS notification using osascript.
   * @param title    Notification title
   * @param message  Notification body text
   * @param sound    Optional sound name (e.g., "Glass", "Ping", "Hero", "Submarine")
   */
  async send(title: string, message: string, sound?: string): Promise<void> {
    const safeTitle = escapeAppleScript(title);
    const safeMessage = escapeAppleScript(message);

    let soundClause = "";
    if (sound) {
      const safeSound = escapeAppleScript(sound);
      soundClause = ` sound name "${safeSound}"`;
    }

    const script = `display notification "${safeMessage}" with title "${safeTitle}"${soundClause}`;
    await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
  }
}
