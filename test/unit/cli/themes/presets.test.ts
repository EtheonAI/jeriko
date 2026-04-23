/**
 * Structural validation for every built-in theme preset.
 *
 * This guards against shape regressions — adding a new ThemeColors key or
 * a new preset requires this file to be updated in one place, because it
 * drives both coverage (via listThemes) and key presence (via the
 * REQUIRED_COLOR_KEYS list derived from jeriko).
 */

import { describe, test, expect } from "bun:test";
import { jeriko } from "../../../../src/cli/themes/presets/jeriko.js";
import { listThemes } from "../../../../src/cli/themes/index.js";

/** Canonical hex color regex — accepts #rrggbb (the format every preset uses). */
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** The required ThemeColors keys, derived from the reference theme. */
const REQUIRED_COLOR_KEYS = Object.keys(jeriko.colors).sort();

describe("every built-in preset", () => {
  for (const theme of listThemes()) {
    describe(theme.id, () => {
      test("has a non-empty displayName", () => {
        expect(theme.displayName).toBeTypeOf("string");
        expect(theme.displayName.length).toBeGreaterThan(0);
      });

      test("kind is one of dark|light|high-contrast", () => {
        expect(["dark", "light", "high-contrast"]).toContain(theme.kind);
      });

      test("colors object has every required key", () => {
        const keys = Object.keys(theme.colors).sort();
        expect(keys).toEqual(REQUIRED_COLOR_KEYS);
      });

      test("every color value is a 6-digit hex string", () => {
        for (const [key, value] of Object.entries(theme.colors)) {
          expect(HEX6.test(value)).toBe(true);
          expect(value.length).toBe(7);
          // Negative: keep the key in the error trail when it fails.
          if (!HEX6.test(value)) throw new Error(`Bad color at ${theme.id}.${key}: ${value}`);
        }
      });
    });
  }
});
