// Darwin — open command (URLs, files, applications)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeShellArg } from "../../shared/escape.js";
import type { OpenProvider } from "../interface.js";

const execAsync = promisify(exec);

export class DarwinOpen implements OpenProvider {
  /** Open a URL in the default browser. */
  async url(url: string): Promise<void> {
    const safeUrl = escapeShellArg(url);
    await execAsync(`open ${safeUrl}`);
  }

  /** Open a file with its default application. */
  async file(path: string): Promise<void> {
    const safePath = escapeShellArg(path);
    await execAsync(`open ${safePath}`);
  }

  /** Launch an application by name. */
  async app(name: string): Promise<void> {
    const safeName = escapeShellArg(name);
    await execAsync(`open -a ${safeName}`);
  }
}
