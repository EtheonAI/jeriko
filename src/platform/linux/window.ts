// Linux — Window management via wmctrl (X11) / swaymsg (Wayland)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeShellArg } from "../../shared/escape.js";
import type { WindowProvider, WindowInfo } from "../interface.js";

const execAsync = promisify(exec);

function isWayland(): boolean {
  return !!process.env["WAYLAND_DISPLAY"];
}

export class LinuxWindow implements WindowProvider {
  async list(): Promise<WindowInfo[]> {
    if (isWayland()) {
      // swaymsg approach for sway/wlroots compositors
      try {
        const { stdout } = await execAsync(
          `swaymsg -t get_tree | jq -r '.. | objects | select(.type == "con" and .name != null) | [.id, .app_id // .name, .name, .rect.x, .rect.y, .rect.width, .rect.height, .focused] | @tsv'`,
        );
        return stdout.split("\n").filter(Boolean).map((line) => {
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
      } catch {
        throw new Error("Window listing requires swaymsg (sway) or compatible Wayland compositor");
      }
    }

    // X11: wmctrl -lG
    try {
      const { stdout } = await execAsync("wmctrl -lG");
      return stdout.split("\n").filter(Boolean).map((line, idx) => {
        // Format: 0x... desktop x y width height host title
        const parts = line.trim().split(/\s+/);
        const x = Number(parts[2]) || 0;
        const y = Number(parts[3]) || 0;
        const width = Number(parts[4]) || 0;
        const height = Number(parts[5]) || 0;
        // Title is everything after the hostname (7th+ fields)
        const title = parts.slice(7).join(" ");
        const app = parts[6] ?? "";
        return { id: idx, app, title, x, y, width, height, focused: false };
      });
    } catch {
      throw new Error("Window listing requires wmctrl. Install: sudo apt install wmctrl");
    }
  }

  async focus(app: string): Promise<void> {
    // Sanitize app name for swaymsg criteria (only allow safe characters)
    const safeApp = app.replace(/[^a-zA-Z0-9 _.\-]/g, "");
    if (isWayland()) {
      await execAsync(`swaymsg '[app_id="${safeApp}"] focus'`);
    } else {
      await execAsync(`wmctrl -a ${escapeShellArg(app)}`);
    }
  }

  async minimize(app: string): Promise<void> {
    if (isWayland()) {
      throw new Error("Window minimize not implemented for Wayland");
    }
    // X11: use xdotool
    const { stdout: windowId } = await execAsync(`xdotool search --name ${escapeShellArg(app)} | head -1`);
    if (windowId.trim()) {
      await execAsync(`xdotool windowminimize ${windowId.trim()}`);
    }
  }

  async resize(app: string, width: number, height: number): Promise<void> {
    const safeApp = app.replace(/[^a-zA-Z0-9 _.\-]/g, "");
    if (isWayland()) {
      await execAsync(
        `swaymsg '[app_id="${safeApp}"] resize set ${Math.floor(width)} ${Math.floor(height)}'`,
      );
    } else {
      await execAsync(
        `wmctrl -r ${escapeShellArg(app)} -e 0,-1,-1,${Math.floor(width)},${Math.floor(height)}`,
      );
    }
  }

  async close(app: string): Promise<void> {
    const safeApp = app.replace(/[^a-zA-Z0-9 _.\-]/g, "");
    if (isWayland()) {
      await execAsync(`swaymsg '[app_id="${safeApp}"] kill'`);
    } else {
      await execAsync(`wmctrl -c ${escapeShellArg(app)}`);
    }
  }
}
