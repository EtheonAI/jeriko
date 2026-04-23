/**
 * Tests for layout primitives — Row, Column, Gap, Divider.
 *
 * Ink's layout engine is Yoga; we don't assert pixel-exact output here.
 * We verify structural guarantees: children render, labels show through,
 * dividers produce a rule, and no primitive throws on legal props.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";
import { Row } from "../../../../src/cli/ui/layout/Row.js";
import { Column } from "../../../../src/cli/ui/layout/Column.js";
import { Gap } from "../../../../src/cli/ui/layout/Gap.js";
import { Divider } from "../../../../src/cli/ui/layout/Divider.js";

describe("Row", () => {
  test("renders children", () => {
    const { lastFrame } = render(
      React.createElement(
        Row,
        { gap: "sm" },
        React.createElement(Text, null, "left"),
        React.createElement(Text, null, "right"),
      ),
    );
    expect(lastFrame()).toContain("left");
    expect(lastFrame()).toContain("right");
  });

  test("accepts all MainAxis values without throwing", () => {
    const mains = ["start", "center", "end", "space-between", "space-around"] as const;
    for (const main of mains) {
      const { unmount } = render(
        React.createElement(Row, { main }, React.createElement(Text, null, "x")),
      );
      expect(() => unmount()).not.toThrow();
    }
  });
});

describe("Column", () => {
  test("renders children stacked vertically", () => {
    const { lastFrame } = render(
      React.createElement(
        Column,
        { gap: "sm" },
        React.createElement(Text, null, "row-1"),
        React.createElement(Text, null, "row-2"),
      ),
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("row-1");
    expect(frame).toContain("row-2");
    // row-1 appears on an earlier line than row-2
    const idx1 = frame.indexOf("row-1");
    const idx2 = frame.indexOf("row-2");
    expect(idx1).toBeLessThan(idx2);
  });
});

describe("Gap", () => {
  test("renders without throwing", () => {
    const { unmount } = render(React.createElement(Gap, { size: "md" }));
    expect(() => unmount()).not.toThrow();
  });

  test("horizontal gap renders", () => {
    const { unmount } = render(React.createElement(Gap, { size: "lg", horizontal: true }));
    expect(() => unmount()).not.toThrow();
  });
});

describe("Divider", () => {
  test("horizontal divider produces a rule", () => {
    const { lastFrame } = render(React.createElement(Divider, { length: 10 }));
    expect(lastFrame()).toContain("─");
  });

  test("horizontal divider with label shows label", () => {
    const { lastFrame } = render(React.createElement(Divider, { label: "Section" }));
    expect(lastFrame()).toContain("Section");
    expect(lastFrame()).toContain("─");
  });

  test("vertical divider produces a pipe", () => {
    const { lastFrame } = render(
      React.createElement(Divider, { orientation: "vertical", length: 3 }),
    );
    expect(lastFrame()).toContain("│");
  });
});
