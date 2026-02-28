// Darwin — Clipboard via pbcopy/pbpaste

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ClipboardProvider } from "../interface.js";

const execAsync = promisify(exec);

export class DarwinClipboard implements ClipboardProvider {
  /** Read the current clipboard contents as UTF-8 text. */
  async read(): Promise<string> {
    const { stdout } = await execAsync("pbpaste");
    return stdout;
  }

  /** Write text to the system clipboard. */
  async write(text: string): Promise<void> {
    // Pipe text into pbcopy via stdin to avoid shell injection
    const child = exec("pbcopy");
    child.stdin?.write(text);
    child.stdin?.end();
    await new Promise<void>((resolve, reject) => {
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pbcopy exited with code ${code}`));
      });
      child.on("error", reject);
    });
  }
}
