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
    label: "macOS / Linux / WSL",
    command: "curl -fsSL https://jeriko.ai/install.sh | bash",
    uninstall: "rm -f /usr/local/bin/jeriko && rm -rf ~/.jeriko ~/.config/jeriko",
  },
];
