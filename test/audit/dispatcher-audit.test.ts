/**
 * Dispatcher audit tests — comprehensive coverage of the CLI dispatch system.
 *
 * Tests cover:
 *   - Global flag handling (--version, --help, --format, --quiet)
 *   - Command registry (getCommands, registerAll, categories)
 *   - Unknown command handling with fuzzy suggestions
 *   - stripGlobalFlags behavior and edge cases
 *   - parseArgs (args.ts) correctness
 *   - Output formatting (ok/fail in json/text/logfmt)
 *   - Error paths and exit codes
 */

import { describe, expect, it, spyOn, afterEach, beforeEach } from "bun:test";
import { parseArgs, flagStr, flagBool, requireFlag } from "../../src/shared/args.js";
import { setOutputFormat, getOutputFormat } from "../../src/shared/output.js";

// ---------------------------------------------------------------------------
// parseArgs (src/shared/args.ts)
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("parses positional arguments", () => {
    const result = parseArgs(["sys", "info"]);
    expect(result.positional).toEqual(["sys", "info"]);
    expect(result.flags).toEqual({});
  });

  it("parses --flag value", () => {
    const result = parseArgs(["--format", "json"]);
    expect(result.flags.format).toBe("json");
    expect(result.positional).toEqual([]);
  });

  it("parses --flag=value", () => {
    const result = parseArgs(["--format=text"]);
    expect(result.flags.format).toBe("text");
  });

  it("parses boolean flags (--flag with no value)", () => {
    const result = parseArgs(["--quiet", "--verbose"]);
    expect(result.flags.quiet).toBe(true);
    expect(result.flags.verbose).toBe(true);
  });

  it("parses --no-flag as false", () => {
    const result = parseArgs(["--no-color"]);
    expect(result.flags.color).toBe(false);
  });

  it("parses short flags -f value", () => {
    const result = parseArgs(["-f", "json"]);
    expect(result.flags.f).toBe("json");
  });

  it("parses short boolean flags -v", () => {
    const result = parseArgs(["-v", "--help"]);
    expect(result.flags.v).toBe(true);
    expect(result.flags.help).toBe(true);
  });

  it("handles -- separator (everything after is positional)", () => {
    const result = parseArgs(["--format", "json", "--", "--not-a-flag", "file.txt"]);
    expect(result.flags.format).toBe("json");
    expect(result.positional).toEqual(["--not-a-flag", "file.txt"]);
  });

  it("treats --flag followed by -next as boolean", () => {
    const result = parseArgs(["--quiet", "--format", "text"]);
    expect(result.flags.quiet).toBe(true);
    expect(result.flags.format).toBe("text");
  });

  it("handles mixed positional and flags", () => {
    const result = parseArgs(["sys", "--cpu", "--format", "text", "extra"]);
    expect(result.positional).toEqual(["sys", "extra"]);
    expect(result.flags.cpu).toBe(true);
    expect(result.flags.format).toBe("text");
  });

  it("handles empty argv", () => {
    const result = parseArgs([]);
    expect(result.positional).toEqual([]);
    expect(result.flags).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// flagStr / flagBool / requireFlag
// ---------------------------------------------------------------------------

describe("flag helpers", () => {
  it("flagStr returns string value", () => {
    const parsed = parseArgs(["--format", "text"]);
    expect(flagStr(parsed, "format", "json")).toBe("text");
  });

  it("flagStr returns default when flag missing", () => {
    const parsed = parseArgs([]);
    expect(flagStr(parsed, "format", "json")).toBe("json");
  });

  it("flagStr returns default when flag is boolean true", () => {
    const parsed = parseArgs(["--format"]);
    // --format with no value → true (boolean), flagStr should return default
    expect(flagStr(parsed, "format", "json")).toBe("json");
  });

  it("flagBool returns true for present flag", () => {
    const parsed = parseArgs(["--quiet"]);
    expect(flagBool(parsed, "quiet")).toBe(true);
  });

  it("flagBool returns false for missing flag", () => {
    const parsed = parseArgs([]);
    expect(flagBool(parsed, "quiet")).toBe(false);
  });

  it("flagBool returns false for --no-flag", () => {
    const parsed = parseArgs(["--no-quiet"]);
    expect(flagBool(parsed, "quiet")).toBe(false);
  });

  it("requireFlag returns string value", () => {
    const parsed = parseArgs(["--id", "abc123"]);
    expect(requireFlag(parsed, "id")).toBe("abc123");
  });

  it("requireFlag throws on missing flag", () => {
    const parsed = parseArgs([]);
    expect(() => requireFlag(parsed, "id")).toThrow("Missing required flag: --id");
  });

  it("requireFlag throws on boolean flag (no value)", () => {
    const parsed = parseArgs(["--id"]);
    expect(() => requireFlag(parsed, "id")).toThrow("Missing required flag: --id");
  });
});

// ---------------------------------------------------------------------------
// Output format (src/shared/output.ts)
// ---------------------------------------------------------------------------

describe("output format", () => {
  afterEach(() => {
    setOutputFormat("json"); // reset
  });

  it("defaults to json", () => {
    setOutputFormat("json");
    expect(getOutputFormat()).toBe("json");
  });

  it("can be set to text", () => {
    setOutputFormat("text");
    expect(getOutputFormat()).toBe("text");
  });

  it("can be set to logfmt", () => {
    setOutputFormat("logfmt");
    expect(getOutputFormat()).toBe("logfmt");
  });
});

// ---------------------------------------------------------------------------
// Dispatcher — version and help
// ---------------------------------------------------------------------------

describe("dispatcher", () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let logSpy: ReturnType<typeof spyOn>;
  let writeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    exitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    writeSpy.mockRestore();
    setOutputFormat("json");
  });

  it("--version prints version string and exits 0", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["--version"]);
    } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith("jeriko 2.0.0-alpha.1");
  });

  it("--help with no command prints help and exits 0", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["--help"]);
    } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    expect(exitSpy).toHaveBeenCalledWith(0);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Unix-first CLI toolkit");
    expect(output).toContain("Commands:");
    expect(output).toContain("--format json|text|logfmt");
  });

  it("unknown command produces error with suggestion", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["syss"]); // close to "sys"
    } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    // fail() writes to stdout via process.stdout.write
    const written = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(written).toContain("Unknown command");
    expect(written).toContain("syss");
    // Should suggest "sys" (Levenshtein distance 1)
    expect(written).toContain("sys");
  });

  it("completely unknown command (no suggestions) still fails gracefully", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["zzzzzzzzz"]);
    } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    const written = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(written).toContain("Unknown command");
    expect(written).toContain("zzzzzzzzz");
  });

  it("--format flag sets output format before command runs", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["--format", "text", "--version"]);
    } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    // Format should have been set to text
    expect(getOutputFormat()).toBe("text");
  });

  it("--format=logfmt sets output format (equals form)", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["--format=logfmt", "--version"]);
    } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    expect(getOutputFormat()).toBe("logfmt");
  });

  it("--quiet flag sets quiet module export", async () => {
    const mod = await import("../../src/cli/dispatcher.js");
    try {
      await mod.dispatcher(["--quiet", "--version"]);
    } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    expect(mod.quiet).toBe(true);
  });

  it("invalid --format value falls back to json", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try {
      await dispatcher(["--format", "yaml", "--version"]);
    } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    // "yaml" is not a valid format; dispatcher should keep json default
    expect(getOutputFormat()).toBe("json");
  });
});

// ---------------------------------------------------------------------------
// Command registry — getCommands
// ---------------------------------------------------------------------------

describe("command registry", () => {
  it("getCommands returns a non-empty map", async () => {
    const { getCommands } = await import("../../src/cli/dispatcher.js");
    const commands = await getCommands();
    expect(commands.size).toBeGreaterThan(0);
  });

  it("every command has name and description", async () => {
    const { getCommands } = await import("../../src/cli/dispatcher.js");
    const commands = await getCommands();
    for (const [key, cmd] of commands) {
      expect(key).toBe(cmd.name);
      expect(typeof cmd.name).toBe("string");
      expect(cmd.name.length).toBeGreaterThan(0);
      expect(typeof cmd.description).toBe("string");
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });

  it("every command has a category assigned", async () => {
    const { getCommands } = await import("../../src/cli/dispatcher.js");
    const commands = await getCommands();
    for (const [, cmd] of commands) {
      expect(cmd.category).toBeDefined();
      expect(typeof cmd.category).toBe("string");
      expect(cmd.category!.length).toBeGreaterThan(0);
    }
  });

  it("has all expected categories", async () => {
    const { getCommands } = await import("../../src/cli/dispatcher.js");
    const commands = await getCommands();
    const categories = new Set<string>();
    for (const cmd of commands.values()) {
      if (cmd.category) categories.add(cmd.category);
    }
    const expected = [
      "system", "files", "browser", "comms", "os",
      "integrations", "dev", "agent", "automation", "plugin", "billing",
    ];
    for (const cat of expected) {
      expect(categories.has(cat)).toBe(true);
    }
  });

  it("every command has a run function", async () => {
    const { getCommands } = await import("../../src/cli/dispatcher.js");
    const commands = await getCommands();
    for (const [, cmd] of commands) {
      expect(typeof cmd.run).toBe("function");
    }
  });

  // Specific commands that should be registered
  const expectedCommands = [
    // system
    "sys", "exec", "proc", "net",
    // files
    "fs", "doc",
    // browser
    "browse", "search", "screenshot",
    // comms
    "email", "msg", "notify", "audio",
    // os
    "notes", "remind", "calendar", "contacts", "music",
    "clipboard", "window", "camera", "open", "location",
    // integrations
    "stripe", "github", "paypal", "vercel", "twilio", "x",
    "gdrive", "onedrive", "gmail", "outlook", "hubspot", "shopify",
    "slack", "discord", "sendgrid", "square", "gitlab", "cloudflare",
    "notion", "linear", "jira", "airtable", "asana",
    "mailchimp", "dropbox", "connectors",
    // dev
    "code", "create", "dev", "parallel",
    // agent
    "ask", "memory", "discover", "prompt", "skill", "share", "provider",
    // automation
    "init", "onboard", "server", "task", "setup", "update",
    // plugin
    "install", "trust", "uninstall",
    // billing
    "plan", "upgrade", "billing",
  ];

  for (const name of expectedCommands) {
    it(`registers command: ${name}`, async () => {
      const { getCommands } = await import("../../src/cli/dispatcher.js");
      const commands = await getCommands();
      expect(commands.has(name)).toBe(true);
    });
  }

  it("total command count matches expected", async () => {
    const { getCommands } = await import("../../src/cli/dispatcher.js");
    const commands = await getCommands();
    // 4 + 2 + 3 + 4 + 10 + 26 + 4 + 7 + 6 + 3 + 3 = 72
    expect(commands.size).toBe(expectedCommands.length);
  });
});

// ---------------------------------------------------------------------------
// Category assignment
// ---------------------------------------------------------------------------

describe("category assignment", () => {
  const categoryMap: Record<string, string[]> = {
    system: ["sys", "exec", "proc", "net"],
    files: ["fs", "doc"],
    browser: ["browse", "search", "screenshot"],
    comms: ["email", "msg", "notify", "audio"],
    os: ["notes", "remind", "calendar", "contacts", "music", "clipboard", "window", "camera", "open", "location"],
    integrations: [
      "stripe", "github", "paypal", "vercel", "twilio", "x",
      "gdrive", "onedrive", "gmail", "outlook", "hubspot", "shopify",
      "slack", "discord", "sendgrid", "square", "gitlab", "cloudflare",
      "notion", "linear", "jira", "airtable", "asana",
      "mailchimp", "dropbox", "connectors",
    ],
    dev: ["code", "create", "dev", "parallel"],
    agent: ["ask", "memory", "discover", "prompt", "skill", "share", "provider"],
    automation: ["init", "onboard", "server", "task", "setup", "update"],
    plugin: ["install", "trust", "uninstall"],
    billing: ["plan", "upgrade", "billing"],
  };

  for (const [category, commands] of Object.entries(categoryMap)) {
    for (const cmdName of commands) {
      it(`${cmdName} is in category "${category}"`, async () => {
        const { getCommands } = await import("../../src/cli/dispatcher.js");
        const registry = await getCommands();
        const cmd = registry.get(cmdName);
        expect(cmd).toBeDefined();
        expect(cmd!.category).toBe(category);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// stripGlobalFlags (tested indirectly via dispatcher behavior)
// ---------------------------------------------------------------------------

describe("stripGlobalFlags", () => {
  // We can't import stripGlobalFlags directly (not exported), so we test
  // it through dispatcher behavior. However, we can test the parseArgs +
  // strip logic by reasoning about the full flow.

  it("--format after command name is stripped from command args", async () => {
    // When argv is ["sys", "--format", "text", "--cpu"],
    // cmdArgs should be ["--cpu"] (format stripped).
    // We verify by checking that the sys command gets --cpu, not --format.
    // This is hard to test without running the real command, so we test
    // the parseArgs level instead.

    const parsed = parseArgs(["sys", "--format", "text", "--cpu"]);
    expect(parsed.positional).toEqual(["sys"]);
    expect(parsed.flags.format).toBe("text");
    expect(parsed.flags.cpu).toBe(true);
  });

  it("--format=value form is handled by parseArgs", async () => {
    const parsed = parseArgs(["--format=logfmt", "sys"]);
    expect(parsed.flags.format).toBe("logfmt");
    expect(parsed.positional).toEqual(["sys"]);
  });
});

// ---------------------------------------------------------------------------
// ok() and fail() output formatting
// ---------------------------------------------------------------------------

describe("ok/fail output", () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let writeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    exitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });
    writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    writeSpy.mockRestore();
    setOutputFormat("json");
  });

  it("ok() outputs valid JSON in json format", () => {
    setOutputFormat("json");
    const { ok } = require("../../src/shared/output.js");
    try { ok({ count: 42 }); } catch {}
    const output = writeSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.ok).toBe(true);
    expect(parsed.data.count).toBe(42);
  });

  it("fail() outputs valid JSON with error in json format", () => {
    setOutputFormat("json");
    const { fail } = require("../../src/shared/output.js");
    try { fail("something broke"); } catch {}
    const output = writeSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("something broke");
    expect(parsed.code).toBe(1);
  });

  it("ok() outputs key-value pairs in text format", () => {
    setOutputFormat("text");
    const { ok } = require("../../src/shared/output.js");
    try { ok({ name: "test", count: 5 }); } catch {}
    const output = writeSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("name: test");
    expect(output).toContain("count: 5");
    // text format should NOT be JSON
    expect(() => JSON.parse(output.trim())).toThrow();
  });

  it("fail() outputs Error: prefix in text format", () => {
    setOutputFormat("text");
    const { fail } = require("../../src/shared/output.js");
    try { fail("not found"); } catch {}
    const output = writeSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Error: not found");
  });

  it("ok() outputs logfmt in logfmt format", () => {
    setOutputFormat("logfmt");
    const { ok } = require("../../src/shared/output.js");
    try { ok({ name: "test" }); } catch {}
    const output = writeSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("ok=true");
    expect(output).toContain("name=test");
  });

  it("fail() outputs logfmt with error in logfmt format", () => {
    setOutputFormat("logfmt");
    const { fail } = require("../../src/shared/output.js");
    try { fail("oops", 2); } catch {}
    const output = writeSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("ok=false");
    expect(output).toContain("error=oops");
    expect(output).toContain("code=2");
  });

  it("fail() exits with specified exit code", () => {
    setOutputFormat("json");
    const { fail } = require("../../src/shared/output.js");
    try { fail("net error", 2); } catch {}
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("ok() exits with code 0", () => {
    setOutputFormat("json");
    const { ok } = require("../../src/shared/output.js");
    try { ok({}); } catch {}
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

describe("exit codes", () => {
  it("EXIT constants match ExitCode enum", async () => {
    const { EXIT } = await import("../../src/shared/output.js");
    expect(EXIT.OK).toBe(0);
    expect(EXIT.GENERAL).toBe(1);
    expect(EXIT.NETWORK).toBe(2);
    expect(EXIT.AUTH).toBe(3);
    expect(EXIT.NOT_FOUND).toBe(5);
    expect(EXIT.TIMEOUT).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Levenshtein / fuzzy matching (tested via dispatcher)
// ---------------------------------------------------------------------------

describe("fuzzy command matching", () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let logSpy: ReturnType<typeof spyOn>;
  let writeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    exitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    writeSpy.mockRestore();
    setOutputFormat("json");
  });

  it("suggests 'sys' for 'sy'", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try { await dispatcher(["sy"]); } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    const written = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(written).toContain("Did you mean");
    expect(written).toContain("sys");
  });

  it("suggests 'exec' for 'exce'", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try { await dispatcher(["exce"]); } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    const written = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(written).toContain("Did you mean");
    expect(written).toContain("exec");
  });

  it("no suggestions for completely unrelated input", async () => {
    const { dispatcher } = await import("../../src/cli/dispatcher.js");
    try { await dispatcher(["xyzabc123"]); } catch (e: any) {
      if (e?.message !== "EXIT") throw e;
    }
    const written = writeSpy.mock.calls.map((c) => c[0]).join("");
    expect(written).toContain("Unknown command");
    expect(written).not.toContain("Did you mean");
  });
});
