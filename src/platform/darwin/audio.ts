// Darwin — Audio: TTS (say), recording (sox/rec), volume (osascript)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeShellArg } from "../../shared/escape.js";
import type { AudioProvider } from "../interface.js";

const execAsync = promisify(exec);

function runOsascript(script: string): Promise<string> {
  return execAsync(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`)
    .then((r) => r.stdout.trim());
}

export class DarwinAudio implements AudioProvider {
  /**
   * Text-to-speech using macOS `say` command.
   * @param text  Text to speak
   * @param voice  macOS voice name (e.g., "Samantha", "Alex", "Daniel")
   */
  async speak(text: string, voice?: string): Promise<void> {
    const safeText = escapeShellArg(text);
    const voiceFlag = voice ? `-v ${escapeShellArg(voice)}` : "";
    await execAsync(`say ${voiceFlag} ${safeText}`);
  }

  /**
   * Record audio using sox/rec CLI.
   * @param duration  Duration in seconds
   * @returns Path to the recorded audio file
   */
  async record(duration: number): Promise<string> {
    const tmpDir = process.env["TMPDIR"] ?? "/tmp";
    const filename = `jeriko-recording-${Date.now()}.wav`;
    const outputPath = `${tmpDir}${filename}`;
    const safePath = escapeShellArg(outputPath);

    // Try sox first (more common), fall back to ffmpeg
    try {
      await execAsync(`which rec`);
      await execAsync(`rec ${safePath} trim 0 ${Math.floor(duration)}`);
    } catch {
      // Fallback: ffmpeg with default input device
      await execAsync(
        `ffmpeg -f avfoundation -i ":0" -t ${Math.floor(duration)} -y ${safePath}`,
      );
    }

    return outputPath;
  }

  /**
   * Get or set system volume.
   * @param level  0-100 to set, omit to get current volume
   * @returns Current volume level (0-100)
   */
  async volume(level?: number): Promise<number> {
    if (level !== undefined) {
      // macOS volume is 0-100, maps to AppleScript output volume 0-100
      const clamped = Math.max(0, Math.min(100, Math.round(level)));
      await runOsascript(`set volume output volume ${clamped}`);
      return clamped;
    }
    return this.getVolume();
  }

  /** Get the current system output volume (0-100). */
  async getVolume(): Promise<number> {
    const raw = await runOsascript(`output volume of (get volume settings)`);
    return Number(raw) || 0;
  }
}
