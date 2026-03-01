/**
 * TUI Theme — Color palettes for terminal rendering.
 *
 * Provides dark and light color palettes with semantic slots.
 * Theme detection uses the OSC 11 terminal escape sequence
 * to probe the actual background color.
 */

// ---------------------------------------------------------------------------
// Color palette type
// ---------------------------------------------------------------------------

export interface ThemeColors {
  /** Root background */
  background: string;
  /** Message panels, header */
  backgroundPanel: string;
  /** Input area, hover states */
  backgroundElement: string;
  /** Dropdowns, expanded tools */
  backgroundMenu: string;
  /** Warm orange — accent, user borders */
  primary: string;
  /** Blue — assistant borders, links */
  secondary: string;
  /** Purple — thinking, sub-agents */
  accent: string;
  /** Primary text */
  text: string;
  /** Secondary text, timestamps */
  textMuted: string;
  /** Subtle borders */
  border: string;
  /** Active/focused borders */
  borderActive: string;
  /** Green — tool success */
  success: string;
  /** Red — errors */
  error: string;
  /** Amber — warnings */
  warning: string;
  /** Cyan — info messages */
  info: string;
}

export type ThemeMode = "dark" | "light";

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const DARK: ThemeColors = {
  background:        "#0a0a0a",
  backgroundPanel:   "#141414",
  backgroundElement: "#1e1e1e",
  backgroundMenu:    "#282828",
  primary:           "#fab283",
  secondary:         "#5c9cf5",
  accent:            "#9d7cd8",
  text:              "#eeeeee",
  textMuted:         "#808080",
  border:            "#303030",
  borderActive:      "#505050",
  success:           "#9ece6a",
  error:             "#f7768e",
  warning:           "#e0af68",
  info:              "#7dcfff",
};

const LIGHT: ThemeColors = {
  background:        "#fafafa",
  backgroundPanel:   "#f0f0f0",
  backgroundElement: "#e6e6e6",
  backgroundMenu:    "#dcdcdc",
  primary:           "#c27030",
  secondary:         "#2060c0",
  accent:            "#7040a8",
  text:              "#1a1a1a",
  textMuted:         "#707070",
  border:            "#d0d0d0",
  borderActive:      "#a0a0a0",
  success:           "#2e8b2e",
  error:             "#cc3040",
  warning:           "#b08020",
  info:              "#1080b0",
};

const PALETTES: Record<ThemeMode, ThemeColors> = { dark: DARK, light: LIGHT };

export function getThemeColors(mode: ThemeMode): ThemeColors {
  return PALETTES[mode];
}

// ---------------------------------------------------------------------------
// Terminal background detection via OSC 11
// ---------------------------------------------------------------------------

/**
 * Probe the terminal for its background color using the OSC 11 escape sequence.
 * Returns "dark" or "light" based on the luminance of the reported color.
 *
 * Falls back to "dark" if:
 * - The terminal doesn't support OSC 11
 * - The response times out (within `timeoutMs`)
 * - stdin is not a TTY
 */
export async function detectThemeMode(timeoutMs: number = 800): Promise<ThemeMode> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "dark";

  return new Promise<ThemeMode>((resolve) => {
    let settled = false;
    let buffer = "";

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve("dark");
      }
    }, timeoutMs);

    const onData = (data: Buffer) => {
      buffer += data.toString();

      // OSC 11 response format: \x1b]11;rgb:RRRR/GGGG/BBBB\x1b\\
      // or:                     \x1b]11;rgb:RRRR/GGGG/BBBB\x07
      const match = buffer.match(/\x1b\]11;rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();

        const r = parseInt(match[1]!.slice(0, 2), 16);
        const g = parseInt(match[2]!.slice(0, 2), 16);
        const b = parseInt(match[3]!.slice(0, 2), 16);

        // ITU-R BT.709 relative luminance
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        resolve(luminance > 128 ? "light" : "dark");
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      if (wasRaw !== undefined) {
        try { process.stdin.setRawMode(wasRaw); } catch { /* best effort */ }
      }
    };

    let wasRaw: boolean | undefined;
    try {
      wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.on("data", onData);
      // Send OSC 11 query
      process.stdout.write("\x1b]11;?\x1b\\");
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve("dark");
      }
    }
  });
}
