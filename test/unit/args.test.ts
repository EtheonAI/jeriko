import { describe, expect, it } from "bun:test";
import { parseArgs, flagBool, flagStr } from "../../src/shared/args.js";

describe("parseArgs", () => {
  it("parses positional arguments", () => {
    const result = parseArgs(["hello", "world"]);
    expect(result.positional).toEqual(["hello", "world"]);
  });

  it("parses boolean flags", () => {
    const result = parseArgs(["--verbose", "--help"]);
    expect(flagBool(result, "verbose")).toBe(true);
    expect(flagBool(result, "help")).toBe(true);
    expect(flagBool(result, "missing")).toBe(false);
  });

  it("parses string flags with values", () => {
    const result = parseArgs(["--model", "claude", "--port", "3000"]);
    expect(flagStr(result, "model", "default")).toBe("claude");
    expect(flagStr(result, "port", "80")).toBe("3000");
  });

  it("returns default for missing string flags", () => {
    const result = parseArgs([]);
    expect(flagStr(result, "model", "gpt")).toBe("gpt");
  });

  it("handles mixed positional and flags", () => {
    const result = parseArgs(["start", "--foreground", "--port", "8080"]);
    expect(result.positional).toContain("start");
    expect(flagBool(result, "foreground")).toBe(true);
    expect(flagStr(result, "port", "3000")).toBe("8080");
  });

  it("handles empty input", () => {
    const result = parseArgs([]);
    expect(result.positional).toEqual([]);
    expect(result.positionalIndices).toEqual([]);
  });

  describe("positionalIndices — argv location tracking", () => {
    it("records the argv index of each positional", () => {
      const result = parseArgs(["hello", "--flag", "value", "world"]);
      expect(result.positional).toEqual(["hello", "world"]);
      expect(result.positionalIndices).toEqual([0, 3]);
    });

    it("disambiguates a positional that equals a flag value", () => {
      // --format=json, then "json" as a command name. A naive
      // argv.indexOf("json") returns 0 (the flag value), but the parser
      // knows the real positional lives at index 1.
      const result = parseArgs(["--format=json", "json", "--arg"]);
      expect(result.positional).toEqual(["json"]);
      expect(result.positionalIndices).toEqual([1]);
    });

    it("disambiguates when a flag value matches a later positional", () => {
      // `--format new some-arg` — "new" is a real command name; old
      // indexOf("new") would match position 1 (the flag's value).
      const result = parseArgs(["--format", "new", "some-arg"]);
      // `new` became the flag's value, so the only true positional is
      // `some-arg` at argv index 2.
      expect(result.positional).toEqual(["some-arg"]);
      expect(result.positionalIndices).toEqual([2]);
    });

    it("tracks positionals after `--` correctly", () => {
      const result = parseArgs(["cmd", "--", "--file", "x"]);
      expect(result.positional).toEqual(["cmd", "--file", "x"]);
      expect(result.positionalIndices).toEqual([0, 2, 3]);
    });

    it("preserves argv-index shape across mixed forms", () => {
      const result = parseArgs([
        "cmd",          // 0 — positional
        "--a=1",        // 1 — flag
        "sub",          // 2 — positional
        "--b",          // 3 — flag
        "2",            // 4 — flag value
        "tail",         // 5 — positional
      ]);
      expect(result.positional).toEqual(["cmd", "sub", "tail"]);
      expect(result.positionalIndices).toEqual([0, 2, 5]);
    });
  });
});
