/**
 * Tests for the TUI tool icon registry.
 */

import { describe, test, expect } from "bun:test";
import { getToolIcon, getAllToolIcons } from "../../../src/cli/tui/lib/icons.js";

// ---------------------------------------------------------------------------
// Known tool names (from the Jeriko tool registry)
// ---------------------------------------------------------------------------

const KNOWN_TOOLS = [
  "bash", "exec", "read", "write", "edit",
  "list", "search", "grep", "web", "browse",
  "delegate", "parallel",
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Tool Icons", () => {
  test("all known tools have registered icons", () => {
    for (const name of KNOWN_TOOLS) {
      const icon = getToolIcon(name);
      expect(icon.icon).toBeTruthy();
      expect(icon.label).toBeTruthy();
      expect(icon.icon.length).toBeLessThanOrEqual(2); // single char or ligature
    }
  });

  test("unknown tools return a default fallback icon", () => {
    const icon = getToolIcon("nonexistent_tool_xyz");
    expect(icon.icon).toBeTruthy();
    expect(icon.label).toBe("tool");
  });

  test("getAllToolIcons returns a non-empty map", () => {
    const all = getAllToolIcons();
    expect(all.size).toBeGreaterThan(0);
  });

  test("icon registry contains all KNOWN_TOOLS", () => {
    const all = getAllToolIcons();
    for (const name of KNOWN_TOOLS) {
      expect(all.has(name)).toBe(true);
    }
  });

  test("bash and exec share the same icon ($ prefix)", () => {
    const bash = getToolIcon("bash");
    const exec = getToolIcon("exec");
    expect(bash.icon).toBe(exec.icon);
    expect(bash.icon).toBe("$");
  });

  test("search and grep share the same icon", () => {
    const search = getToolIcon("search");
    const grep = getToolIcon("grep");
    expect(search.icon).toBe(grep.icon);
  });

  test("read and write have distinct icons (directional)", () => {
    const read = getToolIcon("read");
    const write = getToolIcon("write");
    // read: → (arrow right), write: ← (arrow left)
    expect(read.icon).not.toBe(write.icon);
  });
});
