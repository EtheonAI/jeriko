/**
 * Tests for system theme detection — luminance math, COLORFGBG parsing,
 * detectSystemTheme() resolution order.
 */

import { describe, test, expect } from "bun:test";
import {
  detectSystemTheme,
  kindFromLuminance,
  parseColorFgBg,
  relativeLuminance,
} from "../../../../src/cli/themes/index.js";

describe("relativeLuminance", () => {
  test("pure black = 0", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  test("pure white = 1", () => {
    expect(relativeLuminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 5);
  });

  test("pure green is brighter than pure red (per ITU-R BT.709)", () => {
    const red   = relativeLuminance({ r: 1, g: 0, b: 0 });
    const green = relativeLuminance({ r: 0, g: 1, b: 0 });
    expect(green).toBeGreaterThan(red);
  });
});

describe("kindFromLuminance", () => {
  test("0 → dark", () => expect(kindFromLuminance(0)).toBe("dark"));
  test("0.4 → dark", () => expect(kindFromLuminance(0.4)).toBe("dark"));
  test("0.5 → light (at the threshold)", () => expect(kindFromLuminance(0.5)).toBe("light"));
  test("0.9 → light", () => expect(kindFromLuminance(0.9)).toBe("light"));
});

describe("parseColorFgBg", () => {
  test("undefined and empty yield null", () => {
    expect(parseColorFgBg(undefined)).toBeNull();
    expect(parseColorFgBg("")).toBeNull();
  });

  test("white fg / black bg → dark", () => {
    expect(parseColorFgBg("15;0")).toBe("dark");
  });

  test("black fg / white bg → light", () => {
    expect(parseColorFgBg("0;15")).toBe("light");
  });

  test("ANSI 7 (light gray) is treated as light", () => {
    expect(parseColorFgBg("0;7")).toBe("light");
  });

  test("ANSI 6 is dark-family", () => {
    expect(parseColorFgBg("0;6")).toBe("dark");
  });

  test("'default' bg yields null so caller can fall through", () => {
    expect(parseColorFgBg("7;default")).toBeNull();
  });

  test("single segment (no ';') yields null", () => {
    expect(parseColorFgBg("15")).toBeNull();
  });

  test("non-numeric bg yields null", () => {
    expect(parseColorFgBg("0;oops")).toBeNull();
  });
});

describe("detectSystemTheme", () => {
  test("returns 'dark' when no signals are present", async () => {
    expect(await detectSystemTheme({ env: {} })).toBe("dark");
  });

  test("honors COLORFGBG=light", async () => {
    expect(await detectSystemTheme({ env: { COLORFGBG: "0;15" } })).toBe("light");
  });

  test("honors COLORFGBG=dark", async () => {
    expect(await detectSystemTheme({ env: { COLORFGBG: "15;0" } })).toBe("dark");
  });
});
