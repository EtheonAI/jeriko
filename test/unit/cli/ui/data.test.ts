/**
 * Tests for data primitives — ListItem, TreeNode, TreeChild, CodeBadge.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";
import { ListItem } from "../../../../src/cli/ui/data/ListItem.js";
import { TreeNode, TreeChild, TREE_GLYPHS } from "../../../../src/cli/ui/data/Tree.js";
import { CodeBadge } from "../../../../src/cli/ui/data/CodeBadge.js";

describe("ListItem", () => {
  test("selected row shows selection marker", () => {
    const { lastFrame } = render(
      React.createElement(ListItem, { label: "Option A", selected: true }),
    );
    expect(lastFrame()).toContain("▸");
    expect(lastFrame()).toContain("Option A");
  });

  test("unselected row does not show selection marker", () => {
    const { lastFrame } = render(
      React.createElement(ListItem, { label: "Option B", selected: false }),
    );
    expect(lastFrame()).not.toContain("▸");
    expect(lastFrame()).toContain("Option B");
  });

  test("hint text is rendered when provided", () => {
    const { lastFrame } = render(
      React.createElement(ListItem, { label: "Model", hint: "claude-sonnet-4.6" }),
    );
    expect(lastFrame()).toContain("Model");
    expect(lastFrame()).toContain("claude-sonnet-4.6");
  });

  test("trailing slot content is rendered", () => {
    const { lastFrame } = render(
      React.createElement(
        ListItem,
        { label: "Plan", trailing: React.createElement(Text, null, "PRO") },
      ),
    );
    expect(lastFrame()).toContain("Plan");
    expect(lastFrame()).toContain("PRO");
  });

  test("leading slot content is rendered", () => {
    const { lastFrame } = render(
      React.createElement(
        ListItem,
        { label: "Item", leading: React.createElement(Text, null, "★") },
      ),
    );
    expect(lastFrame()).toContain("★");
    expect(lastFrame()).toContain("Item");
  });
});

describe("TreeNode", () => {
  test("middle position renders the middle connector glyph", () => {
    const { lastFrame } = render(
      React.createElement(
        TreeNode,
        { position: "middle" },
        React.createElement(Text, null, "child-1"),
      ),
    );
    expect(lastFrame()).toContain(TREE_GLYPHS.middle);
    expect(lastFrame()).toContain("child-1");
  });

  test("last position renders the last connector glyph", () => {
    const { lastFrame } = render(
      React.createElement(
        TreeNode,
        { position: "last" },
        React.createElement(Text, null, "child-2"),
      ),
    );
    expect(lastFrame()).toContain(TREE_GLYPHS.last);
  });

  test("depth indents the connector", () => {
    const { lastFrame } = render(
      React.createElement(
        TreeNode,
        { position: "middle", depth: 2 },
        React.createElement(Text, null, "deep"),
      ),
    );
    const frame = lastFrame() ?? "";
    // Two levels of indent (two TREE_GLYPHS.space prefixes) before the connector
    const expectedPrefix = TREE_GLYPHS.space.repeat(2) + TREE_GLYPHS.middle;
    expect(frame).toContain(expectedPrefix);
  });
});

describe("TreeChild", () => {
  test("parent=middle → draws branch glyph under it", () => {
    const { lastFrame } = render(
      React.createElement(
        TreeChild,
        { parentPosition: "middle" },
        React.createElement(Text, null, "line2"),
      ),
    );
    expect(lastFrame()).toContain(TREE_GLYPHS.branch);
  });

  test("parent=last → draws whitespace under it (no branch)", () => {
    const { lastFrame } = render(
      React.createElement(
        TreeChild,
        { parentPosition: "last" },
        React.createElement(Text, null, "line2"),
      ),
    );
    expect(lastFrame()).not.toContain(TREE_GLYPHS.branch);
    expect(lastFrame()).toContain("line2");
  });
});

describe("CodeBadge", () => {
  test("renders the language wrapped in brackets", () => {
    const { lastFrame } = render(React.createElement(CodeBadge, { language: "ts" }));
    expect(lastFrame()).toContain("[ts]");
  });
});
