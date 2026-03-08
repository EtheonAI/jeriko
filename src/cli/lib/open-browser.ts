// Open a URL in the user's default browser (cross-platform).

import { execSync } from "node:child_process";
import { platform } from "node:os";

export function openInBrowser(url: string): void {
  const os = platform();
  const quoted = JSON.stringify(url);
  try {
    if (os === "darwin") execSync(`open ${quoted}`);
    else if (os === "win32") execSync(`start "" ${quoted}`);
    else execSync(`xdg-open ${quoted}`);
  } catch {
    // Silently fail — the URL is already displayed in the terminal.
  }
}
