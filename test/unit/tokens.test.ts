import { describe, expect, it } from "bun:test";
import { estimateTokens, shouldCompact } from "../../src/shared/tokens.js";

describe("tokens", () => {
  it("estimateTokens returns a positive number for text", () => {
    const tokens = estimateTokens("Hello, world! This is a test message.");
    expect(tokens).toBeGreaterThan(0);
  });

  it("estimateTokens returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("longer text produces more tokens", () => {
    const short = estimateTokens("Hello");
    const long = estimateTokens("Hello, this is a much longer message that should produce more tokens");
    expect(long).toBeGreaterThan(short);
  });
});
