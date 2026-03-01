/**
 * Tests for the TUI theme system — color palette completeness and mode switching.
 */

import { describe, test, expect } from "bun:test";
import {
  getThemeColors,
  type ThemeColors,
  type ThemeMode,
} from "../../../src/cli/tui/lib/theme.js";

// ---------------------------------------------------------------------------
// Required color slots — every slot must be present in every palette
// ---------------------------------------------------------------------------

const REQUIRED_SLOTS: (keyof ThemeColors)[] = [
  "background",
  "backgroundPanel",
  "backgroundElement",
  "backgroundMenu",
  "primary",
  "secondary",
  "accent",
  "text",
  "textMuted",
  "border",
  "borderActive",
  "success",
  "error",
  "warning",
  "info",
];

const MODES: ThemeMode[] = ["dark", "light"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Theme", () => {
  for (const mode of MODES) {
    describe(`${mode} palette`, () => {
      const colors = getThemeColors(mode);

      test("has all required color slots", () => {
        for (const slot of REQUIRED_SLOTS) {
          expect(colors[slot]).toBeDefined();
          expect(typeof colors[slot]).toBe("string");
        }
      });

      test("all slots are valid 6-digit hex colors", () => {
        for (const slot of REQUIRED_SLOTS) {
          expect(isValidHexColor(colors[slot])).toBe(true);
        }
      });

      test("has no unexpected undefined values", () => {
        for (const [key, value] of Object.entries(colors)) {
          expect(value).not.toBeUndefined();
          expect(value).not.toBe("");
        }
      });
    });
  }

  test("dark and light palettes are distinct", () => {
    const dark = getThemeColors("dark");
    const light = getThemeColors("light");

    // At minimum, background colors must differ
    expect(dark.background).not.toBe(light.background);
    expect(dark.text).not.toBe(light.text);
  });

  test("dark palette has dark backgrounds (low luminance)", () => {
    const dark = getThemeColors("dark");
    // #0a0a0a → R=10, G=10, B=10 — very dark
    const bg = parseInt(dark.background.slice(1, 3), 16);
    expect(bg).toBeLessThan(30);
  });

  test("light palette has light backgrounds (high luminance)", () => {
    const light = getThemeColors("light");
    // #fafafa → R=250 — very light
    const bg = parseInt(light.background.slice(1, 3), 16);
    expect(bg).toBeGreaterThan(200);
  });
});
