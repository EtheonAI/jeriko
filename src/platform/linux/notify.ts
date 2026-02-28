// Linux — Notifications via notify-send (libnotify)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeShellArg } from "../../shared/escape.js";
import type { NotifyProvider } from "../interface.js";

const execAsync = promisify(exec);

export class LinuxNotify implements NotifyProvider {
  /**
   * Send a desktop notification using notify-send.
   * @param title    Notification title
   * @param message  Notification body text
   * @param sound    Optional sound file path (played via paplay if available)
   */
  async send(title: string, message: string, sound?: string): Promise<void> {
    const safeTitle = escapeShellArg(title);
    const safeMessage = escapeShellArg(message);

    await execAsync(`notify-send ${safeTitle} ${safeMessage}`);

    // Play a sound if specified (using PulseAudio's paplay)
    if (sound) {
      const safeSound = escapeShellArg(sound);
      try {
        await execAsync(`paplay ${safeSound}`);
      } catch {
        // Sound playback is best-effort
      }
    }
  }
}
