// Linux — Clipboard via xclip (X11) or wl-copy/wl-paste (Wayland)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ClipboardProvider } from "../interface.js";

const execAsync = promisify(exec);

/** Detect whether we're running on Wayland or X11. */
function isWayland(): boolean {
  return !!process.env["WAYLAND_DISPLAY"];
}

export class LinuxClipboard implements ClipboardProvider {
  async read(): Promise<string> {
    if (isWayland()) {
      const { stdout } = await execAsync("wl-paste --no-newline");
      return stdout;
    }
    const { stdout } = await execAsync("xclip -selection clipboard -o");
    return stdout;
  }

  async write(text: string): Promise<void> {
    const cmd = isWayland() ? "wl-copy" : "xclip -selection clipboard";
    const child = exec(cmd);
    child.stdin?.write(text);
    child.stdin?.end();
    await new Promise<void>((resolve, reject) => {
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Clipboard write failed with code ${code}`));
      });
      child.on("error", reject);
    });
  }
}
