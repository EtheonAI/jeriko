/**
 * Tests for the TUI CommandProvider — slash command parsing and dispatch.
 *
 * Tests the command parsing logic directly without requiring a SolidJS context.
 */

import { describe, test, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Extracted command parsing logic (mirrors CommandProvider.tryCommand)
// ---------------------------------------------------------------------------

interface ParsedCommand {
  isCommand: boolean;
  isExit: boolean;
  name?: string;
  args?: string;
}

function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  // Exit commands
  if (trimmed === "exit" || trimmed === "quit" || trimmed === ".exit") {
    return { isCommand: true, isExit: true };
  }

  // Must start with /
  if (!trimmed.startsWith("/")) {
    return { isCommand: false, isExit: false };
  }

  // Extract command name and args
  const spaceIdx = trimmed.indexOf(" ");
  const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

  return { isCommand: true, isExit: false, name, args };
}

// Known command names for validation
const KNOWN_COMMANDS = new Set(["/new", "/sessions", "/resume", "/model", "/help"]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Command Parsing", () => {
  describe("exit commands", () => {
    test("recognizes exit", () => {
      expect(parseCommand("exit").isExit).toBe(true);
    });

    test("recognizes quit", () => {
      expect(parseCommand("quit").isExit).toBe(true);
    });

    test("recognizes .exit", () => {
      expect(parseCommand(".exit").isExit).toBe(true);
    });

    test("trims whitespace before matching", () => {
      expect(parseCommand("  exit  ").isExit).toBe(true);
    });
  });

  describe("slash commands", () => {
    test("/new is a command with no args", () => {
      const parsed = parseCommand("/new");
      expect(parsed.isCommand).toBe(true);
      expect(parsed.name).toBe("/new");
      expect(parsed.args).toBe("");
    });

    test("/resume extracts slug argument", () => {
      const parsed = parseCommand("/resume bold-nexus-042");
      expect(parsed.name).toBe("/resume");
      expect(parsed.args).toBe("bold-nexus-042");
    });

    test("/model extracts model name", () => {
      const parsed = parseCommand("/model gpt-4o");
      expect(parsed.name).toBe("/model");
      expect(parsed.args).toBe("gpt-4o");
    });

    test("/help is a command", () => {
      const parsed = parseCommand("/help");
      expect(parsed.isCommand).toBe(true);
      expect(parsed.name).toBe("/help");
    });

    test("/sessions is a command", () => {
      const parsed = parseCommand("/sessions");
      expect(parsed.isCommand).toBe(true);
      expect(parsed.name).toBe("/sessions");
    });
  });

  describe("non-commands", () => {
    test("normal text is not a command", () => {
      expect(parseCommand("Hello world").isCommand).toBe(false);
    });

    test("text starting with a letter is not a command", () => {
      expect(parseCommand("just text").isCommand).toBe(false);
    });

    test("empty string is not a command", () => {
      expect(parseCommand("").isCommand).toBe(false);
    });
  });

  describe("unknown commands", () => {
    test("/unknown is parsed as a command but not in KNOWN_COMMANDS", () => {
      const parsed = parseCommand("/unknown");
      expect(parsed.isCommand).toBe(true);
      expect(parsed.name).toBe("/unknown");
      expect(KNOWN_COMMANDS.has(parsed.name!)).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("/resume with no arg gives empty args", () => {
      const parsed = parseCommand("/resume");
      expect(parsed.args).toBe("");
    });

    test("/resume with multiple spaces preserves args", () => {
      const parsed = parseCommand("/resume some session slug");
      expect(parsed.args).toBe("some session slug");
    });

    test("whitespace-only input is not a command", () => {
      expect(parseCommand("   ").isCommand).toBe(false);
    });
  });
});
