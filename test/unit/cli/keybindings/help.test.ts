/**
 * Tests for the KeybindingHelp overlay.
 *
 * The overlay is a pure renderer — it receives a Binding[] and produces
 * Ink output. We verify it surfaces every binding's description and chord,
 * groups by scope, and does not throw for empty input.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import {
  DEFAULT_BINDINGS,
  KeybindingHelp,
  formatChord,
  type Binding,
} from "../../../../src/cli/keybindings/index.js";
import { ThemeProvider } from "../../../../src/cli/themes/index.js";

function wrap(node: React.ReactElement): React.ReactElement {
  return React.createElement(ThemeProvider, null, node);
}

/** Turn a BindingSpec into a Binding with a no-op handler. */
function asBindings(): Binding[] {
  return DEFAULT_BINDINGS.map((spec) => ({ ...spec, handler: () => {} }));
}

// Strip ANSI so substring assertions aren't thrown off by color codes.
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
function stripAnsi(s: string | undefined): string {
  return (s ?? "").replace(ANSI_PATTERN, "");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KeybindingHelp", () => {
  test("renders title and a close hint", () => {
    const { lastFrame } = render(
      wrap(React.createElement(KeybindingHelp, { bindings: asBindings() })),
    );
    const frame = stripAnsi(lastFrame());
    expect(frame).toContain("Keybindings");
    expect(frame).toContain("Close");
  });

  test("renders every binding's description", () => {
    const bindings = asBindings();
    const { lastFrame } = render(
      wrap(React.createElement(KeybindingHelp, { bindings })),
    );
    const frame = stripAnsi(lastFrame());
    for (const b of bindings) expect(frame).toContain(b.description);
  });

  test("renders every binding's formatted chord", () => {
    const bindings = asBindings();
    const { lastFrame } = render(
      wrap(React.createElement(KeybindingHelp, { bindings })),
    );
    const frame = stripAnsi(lastFrame());
    for (const b of bindings) {
      expect(frame).toContain(formatChord(b.chord));
    }
  });

  test("groups bindings under their scope heading", () => {
    const bindings = asBindings();
    const { lastFrame } = render(
      wrap(React.createElement(KeybindingHelp, { bindings })),
    );
    const frame = stripAnsi(lastFrame());
    // Scope labels live in Help.tsx; verify the major ones surface.
    expect(frame).toContain("Global");
    expect(frame).toContain("Input");
    expect(frame).toContain("Wizard");
  });

  test("renders without error given an empty binding list", () => {
    const { unmount } = render(
      wrap(React.createElement(KeybindingHelp, { bindings: [] })),
    );
    expect(() => unmount()).not.toThrow();
  });
});
