import { describe, expect, it } from "bun:test";
import { escapeAppleScript } from "../../src/shared/escape.js";

describe("escapeAppleScript", () => {
  it("escapes backslashes", () => {
    expect(escapeAppleScript("path\\to\\file")).toContain("\\\\");
  });

  it("escapes double quotes", () => {
    expect(escapeAppleScript('say "hello"')).toContain('\\"');
  });

  it("handles empty string", () => {
    expect(escapeAppleScript("")).toBe("");
  });

  it("passes through safe strings unchanged", () => {
    expect(escapeAppleScript("hello world")).toBe("hello world");
  });
});
