// Win32 — Window management via PowerShell + Win32 API

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { WindowProvider, WindowInfo } from "../interface.js";

const execAsync = promisify(exec);

function escapePowerShell(str: string): string {
  return str.replace(/'/g, "''");
}

export class Win32Window implements WindowProvider {
  async list(): Promise<WindowInfo[]> {
    const psScript = `
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object {
  $name = $_.ProcessName
  $title = $_.MainWindowTitle
  $id = $_.Id
  Write-Output "$id\t$name\t$title"
}`;
    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
    );

    return stdout.split("\n").filter(Boolean).map((line) => {
      const [id = "0", app = "", title = ""] = line.trim().split("\t");
      return {
        id: Number(id),
        app,
        title,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        focused: false,
      };
    });
  }

  async focus(app: string): Promise<void> {
    const safeApp = escapePowerShell(app);
    const psScript = `
$wshell = New-Object -ComObject WScript.Shell
$wshell.AppActivate('${safeApp}')`;
    await execAsync(
      `powershell.exe -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
    );
  }

  async minimize(app: string): Promise<void> {
    const safeApp = escapePowerShell(app);
    const psScript = `
$proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*${safeApp}*' } | Select-Object -First 1
if ($proc) {
  Add-Type -Name Win -Namespace Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);'
  [Native.Win]::ShowWindow($proc.MainWindowHandle, 6)
}`;
    await execAsync(
      `powershell.exe -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
    );
  }

  async resize(app: string, width: number, height: number): Promise<void> {
    const safeApp = escapePowerShell(app);
    const w = Math.floor(width);
    const h = Math.floor(height);
    const psScript = `
$proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*${safeApp}*' } | Select-Object -First 1
if ($proc) {
  Add-Type -Name Win -Namespace Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);'
  [Native.Win]::MoveWindow($proc.MainWindowHandle, 0, 0, ${w}, ${h}, $true)
}`;
    await execAsync(
      `powershell.exe -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
    );
  }

  async close(app: string): Promise<void> {
    const safeApp = escapePowerShell(app);
    const psScript = `
$proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*${safeApp}*' } | Select-Object -First 1
if ($proc) { $proc.CloseMainWindow() }`;
    await execAsync(
      `powershell.exe -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
    );
  }
}
