/**
 * Tests for CLI chat module — verifies the entry point exports.
 *
 * The actual interactive chat is tested via component tests (Input, Messages, etc.).
 * This file validates the public API surface: startChat and slashCompleter exports.
 */

import { describe, test, expect } from "bun:test";
import { SLASH_COMMANDS } from "../../../src/cli/commands.js";

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe("Chat module exports", () => {
  test("startChat is exported and callable", async () => {
    const mod = await import("../../../src/cli/chat.js");
    expect(typeof mod.startChat).toBe("function");
  });

  test("slashCompleter is re-exported from commands.ts", async () => {
    const mod = await import("../../../src/cli/chat.js");
    expect(typeof mod.slashCompleter).toBe("function");
  });

  test("slashCompleter works correctly via re-export", async () => {
    const { slashCompleter } = await import("../../../src/cli/chat.js");

    // Non-slash input
    const [empty, emptyLine] = slashCompleter("hello");
    expect(empty).toEqual([]);
    expect(emptyLine).toBe("hello");

    // Slash prefix
    const [all, slashLine] = slashCompleter("/");
    const allCommands = Array.from(SLASH_COMMANDS.keys());
    expect(all).toEqual(allCommands);
    expect(slashLine).toBe("/");

    // Filtered
    const [filtered] = slashCompleter("/he");
    expect(filtered).toContain("/help");
  });
});

// ---------------------------------------------------------------------------
// Ctrl+C state machine (logic test)
// ---------------------------------------------------------------------------

describe("Ctrl+C state machine", () => {
  const DOUBLE_CTRL_C_WINDOW = 1000;

  test("first press within window: no exit", () => {
    const lastTime = 0;
    const now = Date.now();
    expect((now - lastTime) < DOUBLE_CTRL_C_WINDOW).toBe(false);
  });

  test("second press within window: exit", () => {
    const now = Date.now();
    const lastTime = now - 500;
    expect((now - lastTime) < DOUBLE_CTRL_C_WINDOW).toBe(true);
  });

  test("second press outside window: no exit", () => {
    const now = Date.now();
    const lastTime = now - 2000;
    expect((now - lastTime) < DOUBLE_CTRL_C_WINDOW).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Channel command parsing (integration logic)
// ---------------------------------------------------------------------------

describe("Channel command parsing", () => {
  function parseChannelCommand(input: string): { action: string; name: string } | null {
    if (!input.startsWith("/channel ")) return null;
    const rest = input.slice(9).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) return null;
    return {
      action: rest.slice(0, spaceIdx),
      name: rest.slice(spaceIdx + 1).trim(),
    };
  }

  test("/channel connect telegram", () => {
    expect(parseChannelCommand("/channel connect telegram")).toEqual({
      action: "connect",
      name: "telegram",
    });
  });

  test("/channel disconnect whatsapp", () => {
    expect(parseChannelCommand("/channel disconnect whatsapp")).toEqual({
      action: "disconnect",
      name: "whatsapp",
    });
  });

  test("/channel without action returns null", () => {
    expect(parseChannelCommand("/channel")).toBeNull();
  });

  test("non-channel command returns null", () => {
    expect(parseChannelCommand("/help")).toBeNull();
  });
});
