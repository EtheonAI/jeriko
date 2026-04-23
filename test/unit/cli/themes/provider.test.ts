/**
 * Tests for ThemeProvider — initial selection, live switch, auto-detect,
 * and PALETTE mutation crossing the React/chalk boundary.
 */

import { describe, test, expect, afterEach } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";

import {
  ThemeProvider,
  resolveTheme,
  useTheme,
  applyTheme,
  DEFAULT_THEME_ID,
} from "../../../../src/cli/themes/index.js";
import { PALETTE } from "../../../../src/cli/theme.js";

// Reset PALETTE to default between tests so one switch can't leak into the
// next. ThemeProvider mutates PALETTE via palette-bridge as a side effect.
afterEach(() => {
  applyTheme(resolveTheme(DEFAULT_THEME_ID));
});

/**
 * Poll until `predicate` is true or timeout expires. Returns the matching
 * value. Throws with the last observed value on timeout. Senior pattern for
 * React-effect-driven assertions — never flakes under CPU load, never
 * blocks longer than needed.
 */
async function waitFor<T>(
  produce: () => T,
  predicate: (value: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 1_000;
  const intervalMs = opts.intervalMs ?? 5;
  const start = Date.now();
  let latest = produce();
  while (Date.now() - start < timeoutMs) {
    latest = produce();
    if (predicate(latest)) return latest;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `waitFor: predicate never matched within ${timeoutMs}ms. Last value: ${String(latest)}`,
  );
}

// ---------------------------------------------------------------------------
// Probe components — expose theme state in the rendered frame
// ---------------------------------------------------------------------------

/** Renders the current theme's brand color into the frame. */
const ColorProbe: React.FC = () => {
  const { colors } = useTheme();
  return React.createElement(Text, null, colors.brand);
};

/** Renders the current theme id. */
const IdProbe: React.FC = () => {
  const { theme } = useTheme();
  return React.createElement(Text, null, theme);
};

// A tiny component that calls setTheme on mount — easier to drive than
// wiring up useEffect with delays.
const SwitchOnMount: React.FC<{ target: string }> = ({ target }) => {
  const { setTheme, theme } = useTheme();
  React.useEffect(() => {
    setTheme(target);
  }, [setTheme, target]);
  return React.createElement(Text, null, theme);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ThemeProvider", () => {
  test("seeds initial theme from initialTheme prop", () => {
    const solarized = resolveTheme("solarized-dark");
    const { lastFrame } = render(
      React.createElement(
        ThemeProvider,
        { initialTheme: "solarized-dark" },
        React.createElement(ColorProbe),
      ),
    );
    expect(lastFrame()).toContain(solarized.colors.brand);
  });

  test("falls back to default for unknown initialTheme", () => {
    const defaultTheme = resolveTheme(DEFAULT_THEME_ID);
    const { lastFrame } = render(
      React.createElement(
        ThemeProvider,
        { initialTheme: "not-a-real-theme" },
        React.createElement(IdProbe),
      ),
    );
    expect(lastFrame()).toContain(defaultTheme.id);
  });

  test("setTheme() triggers a re-render with new colors", async () => {
    const target = "nocturne";
    const targetTheme = resolveTheme(target);
    const { lastFrame, unmount } = render(
      React.createElement(
        ThemeProvider,
        { initialTheme: DEFAULT_THEME_ID },
        React.createElement(React.Fragment, null,
          React.createElement(SwitchOnMount, { target }),
          React.createElement(ColorProbe),
        ),
      ),
    );
    await waitFor(
      () => lastFrame() ?? "",
      (frame) => frame.includes(targetTheme.colors.brand),
    );
    unmount();
  });

  test("setTheme() also propagates to PALETTE (chalk bridge)", async () => {
    const target = "nocturne";
    const targetTheme = resolveTheme(target);
    const { unmount } = render(
      React.createElement(
        ThemeProvider,
        { initialTheme: DEFAULT_THEME_ID },
        React.createElement(SwitchOnMount, { target }),
      ),
    );
    await waitFor(
      () => PALETTE.brand,
      (brand) => brand === targetTheme.colors.brand,
    );
    unmount();
  });

  test("autoDetect=true consults the injected detector", async () => {
    let called = false;
    const detector = async (): Promise<"dark" | "light"> => {
      called = true;
      return "light";
    };
    const { lastFrame, unmount } = render(
      React.createElement(
        ThemeProvider,
        { autoDetect: true, detect: detector },
        React.createElement(IdProbe),
      ),
    );
    await waitFor(
      () => lastFrame() ?? "",
      (frame) => frame.includes("jeriko-light"),
    );
    expect(called).toBe(true);
    unmount();
  });

  test("autoDetect=true does NOT override an explicit initialTheme", async () => {
    let called = false;
    const detector = async (): Promise<"dark" | "light"> => {
      called = true;
      return "light";
    };
    const { lastFrame, unmount } = render(
      React.createElement(
        ThemeProvider,
        { initialTheme: "solarized-dark", autoDetect: true, detect: detector },
        React.createElement(IdProbe),
      ),
    );
    // Detector must be given a fair chance to run; it would fire on mount.
    await new Promise((r) => setTimeout(r, 30));
    expect(called).toBe(false);
    expect(lastFrame()).toContain("solarized-dark");
    unmount();
  });
});
