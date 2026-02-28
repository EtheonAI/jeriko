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
  });
});
