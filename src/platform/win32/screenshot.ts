// Win32 — Screenshot via PowerShell + .NET System.Drawing

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeShellArg } from "../../shared/escape.js";
import type { ScreenshotProvider, ScreenshotResult } from "../interface.js";

const execAsync = promisify(exec);

function tmpPath(suffix = ".png"): string {
  const dir = process.env["TEMP"] ?? process.env["TMP"] ?? "C:\\Temp";
  return `${dir}\\jeriko-screenshot-${Date.now()}${suffix}`;
}

export class Win32Screenshot implements ScreenshotProvider {
  async capture(region?: string): Promise<ScreenshotResult> {
    const path = tmpPath();

    if (region) {
      const parts = region.split(",").map((s) => s.trim());
      if (parts.length === 4) {
        const [x, y, w, h] = parts;
        // Capture a specific region using .NET
        const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$bmp = New-Object System.Drawing.Bitmap(${w}, ${h})
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen(${x}, ${y}, 0, 0, $bmp.Size)
$bmp.Save('${path.replace(/'/g, "''")}')
$gfx.Dispose()
$bmp.Dispose()
`;
        await execAsync(`powershell.exe -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
      } else {
        // Full screen fallback
        await this.captureFullScreen(path);
      }
    } else {
      await this.captureFullScreen(path);
    }

    // Get dimensions
    let width: number | undefined;
    let height: number | undefined;
    try {
      const { stdout } = await execAsync(
        `powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${path.replace(/'/g, "''")}'); Write-Output ($img.Width.ToString() + ' ' + $img.Height.ToString()); $img.Dispose()"`,
      );
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

    // Use Snipping Tool API or Alt+PrintScreen equivalent
    const focusCmd = app
      ? `$wshell = New-Object -ComObject WScript.Shell; $wshell.AppActivate('${app.replace(/'/g, "''")}'); Start-Sleep -Milliseconds 300;`
      : "";

    const psScript = `
${focusCmd}
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bmp.Save('${path.replace(/'/g, "''")}')
$gfx.Dispose()
$bmp.Dispose()
`;

    await execAsync(
      `powershell.exe -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
    );

    return { path };
  }

  private async captureFullScreen(path: string): Promise<void> {
    const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bmp.Save('${path.replace(/'/g, "''")}')
$gfx.Dispose()
$bmp.Dispose()
`;
    await execAsync(
      `powershell.exe -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
    );
  }
}
