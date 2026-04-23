/**
 * Tests for chrome primitives — Pane, Dialog, Badge, StatusIcon, KeyboardHint.
 *
 * We render each primitive to a frame and assert observable content.
 * Border geometry is Ink's responsibility; we only check that titles,
 * footers, labels, and glyphs reach the output.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";
import { Pane } from "../../../../src/cli/ui/chrome/Pane.js";
import { Dialog } from "../../../../src/cli/ui/chrome/Dialog.js";
import { Badge } from "../../../../src/cli/ui/chrome/Badge.js";
import { StatusIcon } from "../../../../src/cli/ui/chrome/StatusIcon.js";
import { KeyboardHint } from "../../../../src/cli/ui/chrome/KeyboardHint.js";

describe("Pane", () => {
  test("renders title and children", () => {
    const { lastFrame } = render(
      React.createElement(
        Pane,
        { title: "Permission Request", tone: "brand" },
        React.createElement(Text, null, "body content"),
      ),
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Permission Request");
    expect(frame).toContain("body content");
  });

  test("renders footer when provided", () => {
    const { lastFrame } = render(
      React.createElement(
        Pane,
        {
          title: "T",
          footer: React.createElement(Text, null, "footer-line"),
        },
        React.createElement(Text, null, "body"),
      ),
    );
    expect(lastFrame()).toContain("footer-line");
  });

  test("accepts every BorderStyle without throwing", () => {
    for (const border of ["single", "double", "round", "bold", "classic"] as const) {
      const { unmount } = render(
        React.createElement(
          Pane,
          { border },
          React.createElement(Text, null, "x"),
        ),
      );
      expect(() => unmount()).not.toThrow();
    }
  });
});

describe("Dialog", () => {
  test("renders title, body, and keyboard hints", () => {
    const { lastFrame } = render(
      React.createElement(
        Dialog,
        {
          title: "Allow tool use?",
          hints: [
            { keys: "y", action: "Allow" },
            { keys: "n", action: "Deny" },
          ],
        },
        React.createElement(Text, null, "Run: rm -rf ."),
      ),
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Allow tool use?");
    expect(frame).toContain("Run: rm -rf .");
    expect(frame).toContain("Allow");
    expect(frame).toContain("Deny");
  });

  test("renders without hints", () => {
    const { unmount } = render(
      React.createElement(
        Dialog,
        { title: "Confirm" },
        React.createElement(Text, null, "content"),
      ),
    );
    expect(() => unmount()).not.toThrow();
  });
});

describe("Badge", () => {
  test("outline variant wraps label in brackets", () => {
    const { lastFrame } = render(React.createElement(Badge, { intent: "success" }, "PASS"));
    expect(lastFrame()).toContain("[");
    expect(lastFrame()).toContain("PASS");
    expect(lastFrame()).toContain("]");
  });

  test("solid variant pads label", () => {
    const { lastFrame } = render(
      React.createElement(Badge, { intent: "error", variant: "solid" }, "FAIL"),
    );
    expect(lastFrame()).toContain(" FAIL ");
  });
});

describe("StatusIcon", () => {
  const EXPECTED: Array<[Parameters<typeof StatusIcon>[0]["status"], string]> = [
    ["success", "✓"],
    ["error",   "✗"],
    ["warning", "⚠"],
    ["info",    "ℹ"],
    ["pending", "○"],
    ["running", "●"],
  ];

  for (const [status, glyph] of EXPECTED) {
    test(`${status} renders ${glyph}`, () => {
      const { lastFrame } = render(React.createElement(StatusIcon, { status }));
      expect(lastFrame()).toContain(glyph);
    });
  }

  test("icon override is honored", () => {
    const { lastFrame } = render(
      React.createElement(StatusIcon, { status: "success", icon: "★" }),
    );
    expect(lastFrame()).toContain("★");
    expect(lastFrame()).not.toContain("✓");
  });
});

describe("KeyboardHint", () => {
  test("renders every hint's keys and action", () => {
    const { lastFrame } = render(
      React.createElement(KeyboardHint, {
        hints: [
          { keys: "Enter", action: "Submit" },
          { keys: "Esc",   action: "Cancel" },
        ],
      }),
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Enter");
    expect(frame).toContain("Submit");
    expect(frame).toContain("Esc");
    expect(frame).toContain("Cancel");
  });

  test("uses custom separator when provided", () => {
    const { lastFrame } = render(
      React.createElement(KeyboardHint, {
        hints: [
          { keys: "a", action: "A" },
          { keys: "b", action: "B" },
        ],
        separator: " | ",
      }),
    );
    expect(lastFrame()).toContain(" | ");
  });

  test("single hint renders without separator", () => {
    const { lastFrame } = render(
      React.createElement(KeyboardHint, { hints: [{ keys: "Enter", action: "Submit" }] }),
    );
    expect(lastFrame()).toContain("Enter");
    expect(lastFrame()).toContain("Submit");
  });
});
