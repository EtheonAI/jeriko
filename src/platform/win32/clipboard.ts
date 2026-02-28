// Win32 — Clipboard via PowerShell (Get-Clipboard / Set-Clipboard)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ClipboardProvider } from "../interface.js";

const execAsync = promisify(exec);

export class Win32Clipboard implements ClipboardProvider {
  /** Read clipboard contents via PowerShell. */
  async read(): Promise<string> {
    const { stdout } = await execAsync(
      'powershell.exe -NoProfile -Command "Get-Clipboard"',
    );
    return stdout.trimEnd();
  }

  /** Write text to clipboard via PowerShell. */
  async write(text: string): Promise<void> {
    // Pipe through stdin to avoid shell injection in the text content.
    // PowerShell's $input reads from pipeline stdin.
    const child = exec(
      'powershell.exe -NoProfile -Command "$input | Set-Clipboard"',
    );
    child.stdin?.write(text);
    child.stdin?.end();
    await new Promise<void>((resolve, reject) => {
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Set-Clipboard exited with code ${code}`));
      });
      child.on("error", reject);
    });
  }
}
