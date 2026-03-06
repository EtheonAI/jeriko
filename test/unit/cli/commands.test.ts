/**
 * Tests for CLI commands — slash command registry, parsing, exit detection, completion.
 */

import { describe, test, expect } from "bun:test";
import {
  SLASH_COMMANDS,
  HELP_ENTRIES,
  isExitCommand,
  parseSlashCommand,
  slashCompleter,
  SUB_AGENT_TOOLS,
} from "../../../src/cli/commands.js";

// ---------------------------------------------------------------------------
// SLASH_COMMANDS registry
// ---------------------------------------------------------------------------

describe("SLASH_COMMANDS", () => {
  test("contains all expected commands", () => {
    expect(SLASH_COMMANDS.has("/help")).toBe(true);
    expect(SLASH_COMMANDS.has("/new")).toBe(true);
    expect(SLASH_COMMANDS.has("/sessions")).toBe(true);
    expect(SLASH_COMMANDS.has("/resume")).toBe(true);
    expect(SLASH_COMMANDS.has("/model")).toBe(true);
    expect(SLASH_COMMANDS.has("/channels")).toBe(true);
    expect(SLASH_COMMANDS.has("/channel")).toBe(true);
  });

  test("all keys start with /", () => {
    for (const key of SLASH_COMMANDS.keys()) {
      expect(key.startsWith("/")).toBe(true);
    }
  });

  test("all values are non-empty strings", () => {
    for (const value of SLASH_COMMANDS.values()) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// HELP_ENTRIES
// ---------------------------------------------------------------------------

describe("HELP_ENTRIES", () => {
  test("contains tuples with command and description", () => {
    expect(HELP_ENTRIES.length).toBeGreaterThan(0);
    for (const [cmd, desc] of HELP_ENTRIES) {
      expect(typeof cmd).toBe("string");
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  test("includes all core commands", () => {
    const commands = HELP_ENTRIES.map(([cmd]) => cmd);
    expect(commands).toContain("/help");
    expect(commands).toContain("/new");
    expect(commands).toContain("/sessions");
    expect(commands).toContain("/model");
    expect(commands).toContain("/model add [id]");
    expect(commands).toContain("/status");
    expect(commands).toContain("/skills");
  });
});

// ---------------------------------------------------------------------------
// isExitCommand
// ---------------------------------------------------------------------------

describe("isExitCommand", () => {
  test("recognizes 'exit'", () => {
    expect(isExitCommand("exit")).toBe(true);
  });

  test("recognizes 'quit'", () => {
    expect(isExitCommand("quit")).toBe(true);
  });

  test("recognizes '.exit'", () => {
    expect(isExitCommand(".exit")).toBe(true);
  });

  test("recognizes '/exit'", () => {
    expect(isExitCommand("/exit")).toBe(true);
  });

  test("recognizes '/quit'", () => {
    expect(isExitCommand("/quit")).toBe(true);
  });

  test("handles whitespace", () => {
    expect(isExitCommand("  exit  ")).toBe(true);
    expect(isExitCommand(" /quit ")).toBe(true);
  });

  test("rejects empty string", () => {
    expect(isExitCommand("")).toBe(false);
  });

  test("rejects partial match", () => {
    expect(isExitCommand("exi")).toBe(false);
    expect(isExitCommand("quitting")).toBe(false);
  });

  test("is case-sensitive", () => {
    expect(isExitCommand("EXIT")).toBe(false);
    expect(isExitCommand("Quit")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseSlashCommand
// ---------------------------------------------------------------------------

describe("parseSlashCommand", () => {
  test("/help → { name: '/help', args: '' }", () => {
    const cmd = parseSlashCommand("/help");
    expect(cmd).toEqual({ name: "/help", args: "" });
  });

  test("/new → { name: '/new', args: '' }", () => {
    const cmd = parseSlashCommand("/new");
    expect(cmd).toEqual({ name: "/new", args: "" });
  });

  test("/resume bold-nexus-001 → name + args", () => {
    const cmd = parseSlashCommand("/resume bold-nexus-001");
    expect(cmd).toEqual({ name: "/resume", args: "bold-nexus-001" });
  });

  test("/model gpt4 → name + args", () => {
    const cmd = parseSlashCommand("/model gpt4");
    expect(cmd).toEqual({ name: "/model", args: "gpt4" });
  });

  test("plain text returns null", () => {
    expect(parseSlashCommand("hello world")).toBeNull();
  });

  test("empty string returns null", () => {
    expect(parseSlashCommand("")).toBeNull();
  });

  test("exit returns null (not a slash command)", () => {
    expect(parseSlashCommand("exit")).toBeNull();
  });

  test("quit returns null", () => {
    expect(parseSlashCommand("quit")).toBeNull();
  });

  test("/exit returns null (exit command, not slash command)", () => {
    expect(parseSlashCommand("/exit")).toBeNull();
  });

  test("/quit returns null (exit command, not slash command)", () => {
    expect(parseSlashCommand("/quit")).toBeNull();
  });

  test("handles leading whitespace", () => {
    const cmd = parseSlashCommand("  /help");
    expect(cmd).toEqual({ name: "/help", args: "" });
  });

  test("preserves args with multiple spaces", () => {
    const cmd = parseSlashCommand("/resume bold nexus 001");
    expect(cmd).toEqual({ name: "/resume", args: "bold nexus 001" });
  });

  test("/channel connect telegram → name + full args", () => {
    const cmd = parseSlashCommand("/channel connect telegram");
    expect(cmd).toEqual({ name: "/channel", args: "connect telegram" });
  });
});

// ---------------------------------------------------------------------------
// slashCompleter
// ---------------------------------------------------------------------------

describe("slashCompleter", () => {
  test("returns empty for non-slash input", () => {
    const [completions, line] = slashCompleter("hello");
    expect(completions).toEqual([]);
    expect(line).toBe("hello");
  });

  test("returns empty for empty string", () => {
    const [completions, line] = slashCompleter("");
    expect(completions).toEqual([]);
    expect(line).toBe("");
  });

  test("returns all commands for bare /", () => {
    const [completions, line] = slashCompleter("/");
    const allCommands = Array.from(SLASH_COMMANDS.keys());
    expect(completions).toEqual(allCommands);
    expect(line).toBe("/");
  });

  test("filters commands by prefix /he → /help", () => {
    const [completions] = slashCompleter("/he");
    expect(completions).toContain("/help");
    expect(completions).not.toContain("/new");
  });

  test("filters commands by prefix /se → /sessions", () => {
    const [completions] = slashCompleter("/se");
    expect(completions).toContain("/sessions");
  });

  test("exact match returns single result", () => {
    const [completions] = slashCompleter("/help");
    expect(completions).toEqual(["/help"]);
  });

  test("/ch matches /channels and /channel (and possibly others)", () => {
    const [completions] = slashCompleter("/ch");
    expect(completions).toContain("/channels");
    expect(completions).toContain("/channel");
    expect(completions.length).toBeGreaterThanOrEqual(2);
  });

  test("no matches returns all commands as fallback", () => {
    const [completions] = slashCompleter("/zzz");
    const allCommands = Array.from(SLASH_COMMANDS.keys());
    expect(completions).toEqual(allCommands);
  });

  test("returns the original line as the second element", () => {
    const [, line] = slashCompleter("/ne");
    expect(line).toBe("/ne");
  });
});

// ---------------------------------------------------------------------------
// SUB_AGENT_TOOLS
// ---------------------------------------------------------------------------

describe("SUB_AGENT_TOOLS", () => {
  test("identifies delegate as sub-agent tool", () => {
    expect(SUB_AGENT_TOOLS.has("delegate")).toBe(true);
  });

  test("identifies parallel_tasks as sub-agent tool", () => {
    expect(SUB_AGENT_TOOLS.has("parallel_tasks")).toBe(true);
  });

  test("does not match regular tools", () => {
    expect(SUB_AGENT_TOOLS.has("bash")).toBe(false);
    expect(SUB_AGENT_TOOLS.has("read")).toBe(false);
    expect(SUB_AGENT_TOOLS.has("write")).toBe(false);
    expect(SUB_AGENT_TOOLS.has("search")).toBe(false);
  });
});
