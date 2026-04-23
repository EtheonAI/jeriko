/**
 * Tests for UI token resolvers.
 *
 * These are pure functions — no React, no Ink. They're the floor of the
 * subsystem: every primitive resolves colors through them, so if these
 * tests pass, every primitive's color semantics are correct by construction.
 */

import { describe, test, expect } from "bun:test";
import { THEMES, DEFAULT_THEME } from "../../../../src/cli/themes/index.js";
import type { ThemeColors } from "../../../../src/cli/themes/index.js";
import type { Intent, Status, Tone } from "../../../../src/cli/ui/types.js";
import {
  resolveTone,
  resolveIntent,
  toneFromIntent,
  resolveStatus,
  sizeToCells,
} from "../../../../src/cli/ui/tokens.js";

const COLORS: ThemeColors = THEMES[DEFAULT_THEME].colors;

describe("resolveTone", () => {
  const EVERY_TONE: readonly Tone[] = [
    "brand", "brandDim", "text", "muted", "dim", "faint",
    "tool", "success", "error", "warning", "info",
    "purple", "teal", "orange", "pink",
  ];

  test("every Tone resolves to a non-empty hex-ish color string", () => {
    for (const tone of EVERY_TONE) {
      const color = resolveTone(tone, COLORS);
      expect(color).toBeTypeOf("string");
      expect(color.length).toBeGreaterThan(0);
      expect(color.startsWith("#")).toBe(true);
    }
  });

  test("resolveTone('brand') returns the theme's brand color", () => {
    expect(resolveTone("brand", COLORS)).toBe(COLORS.brand);
  });

  test("resolveTone('success') returns the theme's success color", () => {
    expect(resolveTone("success", COLORS)).toBe(COLORS.success);
  });

  test("resolveTone('error') returns the theme's error color", () => {
    expect(resolveTone("error", COLORS)).toBe(COLORS.error);
  });
});

describe("toneFromIntent", () => {
  test("maps every Intent to a valid Tone", () => {
    const EVERY_INTENT: readonly Intent[] = ["brand", "success", "error", "warning", "info", "muted"];
    for (const intent of EVERY_INTENT) {
      const tone = toneFromIntent(intent);
      // The resulting tone must resolve to a real color — round-trip check.
      expect(resolveTone(tone, COLORS)).toBeTypeOf("string");
    }
  });
});

describe("resolveIntent", () => {
  test("is equivalent to resolveTone(toneFromIntent(...), colors)", () => {
    const intents: readonly Intent[] = ["brand", "success", "error", "warning", "info", "muted"];
    for (const intent of intents) {
      expect(resolveIntent(intent, COLORS)).toBe(resolveTone(toneFromIntent(intent), COLORS));
    }
  });
});

describe("resolveStatus", () => {
  test("every Status has a unique glyph and a valid tone", () => {
    const EVERY_STATUS: readonly Status[] = ["success", "error", "warning", "info", "pending", "running"];
    const seenIcons = new Set<string>();
    for (const status of EVERY_STATUS) {
      const { icon, tone } = resolveStatus(status);
      expect(icon.length).toBeGreaterThan(0);
      expect(seenIcons.has(icon)).toBe(false);
      seenIcons.add(icon);
      // Round-trip: the tone must resolve.
      expect(resolveTone(tone, COLORS)).toBeTypeOf("string");
    }
  });

  test("success ↦ ✓", () => expect(resolveStatus("success").icon).toBe("✓"));
  test("error ↦ ✗",   () => expect(resolveStatus("error").icon).toBe("✗"));
  test("warning ↦ ⚠", () => expect(resolveStatus("warning").icon).toBe("⚠"));
  test("info ↦ ℹ",    () => expect(resolveStatus("info").icon).toBe("ℹ"));
  test("pending ↦ ○", () => expect(resolveStatus("pending").icon).toBe("○"));
  test("running ↦ ●", () => expect(resolveStatus("running").icon).toBe("●"));
});

describe("sizeToCells", () => {
  test("sm → 1, md → 2, lg → 3", () => {
    expect(sizeToCells("sm")).toBe(1);
    expect(sizeToCells("md")).toBe(2);
    expect(sizeToCells("lg")).toBe(3);
  });
});
