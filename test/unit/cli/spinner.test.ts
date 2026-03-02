/**
 * Tests for CLI Spinner component (React/Ink) — top-level alias.
 *
 * Tests basic rendering. Detailed preset tests are in components/spinner.test.ts.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { Spinner, SPINNER_PRESETS } from "../../../src/cli/components/Spinner.js";

describe("Spinner (React component)", () => {
  test("renders with label", () => {
    const { lastFrame } = render(React.createElement(Spinner, { label: "Thinking" }));
    expect(lastFrame()).toContain("Thinking");
    expect(lastFrame()).toContain("…");
  });

  test("renders with a braille frame (default preset)", () => {
    const { lastFrame } = render(React.createElement(Spinner, { label: "Loading" }));
    const brailleChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const containsBraille = brailleChars.some((c) => lastFrame()?.includes(c));
    expect(containsBraille).toBe(true);
  });

  test("unmounts cleanly", () => {
    const { unmount } = render(React.createElement(Spinner, { label: "Test" }));
    expect(() => unmount()).not.toThrow();
  });

  test("SPINNER_PRESETS is exported", () => {
    expect(SPINNER_PRESETS).toBeDefined();
    expect(Object.keys(SPINNER_PRESETS).length).toBeGreaterThanOrEqual(4);
  });
});
