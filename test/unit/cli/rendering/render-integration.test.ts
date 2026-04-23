/**
 * Integration tests wiring markdown + cache + theme together.
 *
 * Focus: the markdown cache is automatically invalidated across theme
 * switches because its key includes the active theme id. A regression
 * that severs that link would produce stale colors after /theme switch.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { renderMarkdown, sharedMarkdownCache } from "../../../../src/cli/rendering/index.js";
import { setActiveTheme, getActiveTheme } from "../../../../src/cli/theme.js";
import { resolveTheme } from "../../../../src/cli/themes/index.js";

// Tests mutate the singleton cache; isolate them by clearing before each.
afterEach(() => {
  sharedMarkdownCache.clear();
});

function restoreTheme<T>(fn: () => T): T {
  const original = getActiveTheme();
  try {
    return fn();
  } finally {
    setActiveTheme(resolveTheme(original));
  }
}

describe("renderMarkdown caching", () => {
  test("two renders of the same text produce identical output", () => {
    const text = "**hello** world";
    const a = renderMarkdown(text);
    const b = renderMarkdown(text);
    expect(a).toBe(b);
  });

  test("second render of the same text hits the cache", () => {
    const text = "some **bold** text";
    sharedMarkdownCache.clear();
    expect(sharedMarkdownCache.size).toBe(0);
    renderMarkdown(text);
    expect(sharedMarkdownCache.size).toBeGreaterThan(0);
    const sizeAfterFirst = sharedMarkdownCache.size;
    renderMarkdown(text);
    expect(sharedMarkdownCache.size).toBe(sizeAfterFirst);
  });

  test("theme switch produces a different cache entry", () => {
    restoreTheme(() => {
      // Use a markdown fragment whose rendering actually pulls hex colors
      // from PALETTE — inline code (`…`) colors via theme.tool, so two
      // themes with different tool hex will produce different frames.
      // Bold + italic alone would not because those ANSI codes aren't
      // color-dependent.
      const text = "Run `npm install` to get started";
      sharedMarkdownCache.clear();

      setActiveTheme(resolveTheme("jeriko"));
      const dark = renderMarkdown(text);
      const sizeAfterDark = sharedMarkdownCache.size;

      setActiveTheme(resolveTheme("nocturne"));
      const nocturne = renderMarkdown(text);

      // A new entry was added for the second theme — cache grew.
      expect(sharedMarkdownCache.size).toBeGreaterThan(sizeAfterDark);
      expect(dark).not.toBe(nocturne);
    });
  });

  test("same theme, repeated render — stable", () => {
    restoreTheme(() => {
      setActiveTheme(resolveTheme("jeriko"));
      const a = renderMarkdown("Hello **world**");
      const b = renderMarkdown("Hello **world**");
      expect(a).toBe(b);
    });
  });
});
