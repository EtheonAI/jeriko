/** Single source of truth for platform install commands. */

export interface Platform {
  /** Tab label shown to the user */
  label: string;
  /** One-liner install command */
  command: string;
  /** Uninstall command */
  uninstall: string;
}

export const PLATFORMS: Platform[] = [
  {
    label: "macOS / Linux",
    command: "curl -fsSL https://jeriko.ai/install.sh | bash",
    uninstall: "rm -f /usr/local/bin/jeriko && rm -rf ~/.jeriko ~/.config/jeriko",
  },
  {
    label: "Windows (PowerShell)",
    command: "irm https://jeriko.ai/install.ps1 | iex",
    uninstall: 'Remove-Item "$env:LOCALAPPDATA\\jeriko" -Recurse -Force',
  },
  {
    label: "Windows (CMD)",
    command: "curl -fsSL https://jeriko.ai/install.cmd -o install.cmd && install.cmd",
    uninstall: 'rmdir /s /q "%LOCALAPPDATA%\\jeriko"',
  },
];
