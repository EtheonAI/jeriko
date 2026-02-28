// Darwin — Screenshot via screencapture CLI

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeShellArg, escapeAppleScript } from "../../shared/escape.js";
import type { ScreenshotProvider, ScreenshotResult } from "../interface.js";

const execAsync = promisify(exec);

function tmpPath(suffix = ".png"): string {
  const dir = process.env["TMPDIR"] ?? "/tmp";
  return `${dir}jeriko-screenshot-${Date.now()}${suffix}`;
}

export class DarwinScreenshot implements ScreenshotProvider {
  /**
   * Capture the screen or a region.
   * @param region  Optional region as "x,y,w,h" or omit for full screen
   */
  async capture(region?: string): Promise<ScreenshotResult> {
    const path = tmpPath();
    const safePath = escapeShellArg(path);

    if (region) {
      // Parse "x,y,w,h" into screencapture -R flag
      const parts = region.split(",").map((s) => s.trim());
      if (parts.length === 4) {
        const rect = parts.join(",");
        await execAsync(`screencapture -x -R${rect} ${safePath}`);
      } else {
        // If not a valid rect, capture interactive selection
        await execAsync(`screencapture -x -s ${safePath}`);
      }
    } else {
      // Full screen capture, -x suppresses the shutter sound
      await execAsync(`screencapture -x ${safePath}`);
    }

    // Get dimensions via sips
    let width: number | undefined;
    let height: number | undefined;
    try {
      const { stdout } = await execAsync(`sips -g pixelWidth -g pixelHeight ${safePath}`);
      const wMatch = stdout.match(/pixelWidth:\s*(\d+)/);
      const hMatch = stdout.match(/pixelHeight:\s*(\d+)/);
      if (wMatch?.[1]) width = Number(wMatch[1]);
      if (hMatch?.[1]) height = Number(hMatch[1]);
    } catch {
      // sips failure is non-fatal — we still have the file
    }

    return { path, width, height };
  }

  /**
   * Capture a specific application's frontmost window.
   * @param app  Application name (e.g., "Safari"). Omit for interactive window selection.
   */
  async captureWindow(app?: string): Promise<ScreenshotResult> {
    const path = tmpPath();
    const safePath = escapeShellArg(path);

    if (app) {
      // Bring app to front, then capture its window
      const safeApp = escapeAppleScript(app);
      await execAsync(`osascript -e 'tell application "${safeApp}" to activate'`);
      // Short delay to let the window come to front
      await new Promise((resolve) => setTimeout(resolve, 300));
      // -l flag captures a specific window by ID; we use -w for frontmost window
      await execAsync(`screencapture -x -w ${safePath}`);
    } else {
      // Interactive window selection
      await execAsync(`screencapture -x -w ${safePath}`);
    }

    let width: number | undefined;
    let height: number | undefined;
    try {
      const { stdout } = await execAsync(`sips -g pixelWidth -g pixelHeight ${safePath}`);
      const wMatch = stdout.match(/pixelWidth:\s*(\d+)/);
      const hMatch = stdout.match(/pixelHeight:\s*(\d+)/);
      if (wMatch?.[1]) width = Number(wMatch[1]);
      if (hMatch?.[1]) height = Number(hMatch[1]);
    } catch {
      // non-fatal
    }

    return { path, width, height };
  }
}
