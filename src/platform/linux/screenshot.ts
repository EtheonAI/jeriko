// Linux — Screenshot via scrot (X11) or grim (Wayland)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeShellArg } from "../../shared/escape.js";
import type { ScreenshotProvider, ScreenshotResult } from "../interface.js";

const execAsync = promisify(exec);

function isWayland(): boolean {
  return !!process.env["WAYLAND_DISPLAY"];
}

function tmpPath(suffix = ".png"): string {
  return `/tmp/jeriko-screenshot-${Date.now()}${suffix}`;
}

export class LinuxScreenshot implements ScreenshotProvider {
  async capture(region?: string): Promise<ScreenshotResult> {
    const path = tmpPath();
    const safePath = escapeShellArg(path);

    if (isWayland()) {
      if (region) {
        // grim -g "x,y widthxheight" format
        const parts = region.split(",").map((s) => s.trim());
        if (parts.length === 4) {
          const [x, y, w, h] = parts;
          await execAsync(`grim -g "${x},${y} ${w}x${h}" ${safePath}`);
        } else {
          // Use slurp for interactive region selection
          const { stdout: geometry } = await execAsync("slurp");
          await execAsync(`grim -g ${escapeShellArg(geometry.trim())} ${safePath}`);
        }
      } else {
        await execAsync(`grim ${safePath}`);
      }
    } else {
      // X11: scrot
      if (region) {
        const parts = region.split(",").map((s) => s.trim());
        if (parts.length === 4) {
          // scrot doesn't support arbitrary regions directly; use import (ImageMagick)
          const [x, y, w, h] = parts;
          await execAsync(`import -window root -crop ${w}x${h}+${x}+${y} ${safePath}`);
        } else {
          // Interactive selection
          await execAsync(`scrot -s ${safePath}`);
        }
      } else {
        await execAsync(`scrot ${safePath}`);
      }
    }

    // Get dimensions via identify (ImageMagick) or file
    let width: number | undefined;
    let height: number | undefined;
    try {
      const { stdout } = await execAsync(`identify -format "%w %h" ${safePath}`);
      const [w, h] = stdout.trim().split(" ");
      if (w) width = Number(w);
      if (h) height = Number(h);
    } catch {
      // non-fatal
    }

    return { path, width, height };
  }

  async captureWindow(app?: string): Promise<ScreenshotResult> {
    const path = tmpPath();
    const safePath = escapeShellArg(path);

    if (isWayland()) {
      // On Wayland, capture the focused window using swaymsg + grim
      if (app) {
        // Focus the app first via wmctrl or swaymsg
        try {
          // Sanitize app name for swaymsg criteria (only allow safe characters)
          const safeApp = app.replace(/[^a-zA-Z0-9 _.\-]/g, "");
          await execAsync(`swaymsg '[app_id="${safeApp}"] focus'`);
        } catch {
          try {
            await execAsync(`wmctrl -a ${escapeShellArg(app)}`);
          } catch {
            // best-effort focus
          }
        }
      }
      // Capture focused window geometry
      try {
        const { stdout: tree } = await execAsync(
          `swaymsg -t get_tree | jq -r '.. | select(.focused?) | select(.focused==true) | .rect | "\\(.x),\\(.y) \\(.width)x\\(.height)"'`,
        );
        await execAsync(`grim -g ${escapeShellArg(tree.trim())} ${safePath}`);
      } catch {
        // Fallback to full screen
        await execAsync(`grim ${safePath}`);
      }
    } else {
      // X11: scrot -u captures focused window, or use xdotool to focus first
      if (app) {
        try {
          await execAsync(`wmctrl -a ${escapeShellArg(app)}`);
        } catch {
          // best-effort
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await execAsync(`scrot -u ${safePath}`);
    }

    let width: number | undefined;
    let height: number | undefined;
    try {
      const { stdout } = await execAsync(`identify -format "%w %h" ${safePath}`);
      const [w, h] = stdout.trim().split(" ");
      if (w) width = Number(w);
      if (h) height = Number(h);
    } catch {
      // non-fatal
    }

    return { path, width, height };
  }
}
