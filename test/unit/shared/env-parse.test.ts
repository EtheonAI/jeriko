// env-parse tests — pure functions, drive via the `env` option.

import { describe, it, expect } from "bun:test";
import { parseEnvInt, parseEnvBool, parseEnvString } from "../../../src/shared/env-parse.js";

describe("parseEnvInt", () => {
  it("returns fallback when missing", () => {
    expect(parseEnvInt("X", 993, { env: {} })).toBe(993);
  });

  it("returns fallback when empty string", () => {
    expect(parseEnvInt("X", 993, { env: { X: "" } })).toBe(993);
  });

  it("returns fallback on non-numeric", () => {
    expect(parseEnvInt("X", 993, { env: { X: "abc" } })).toBe(993);
  });

  it("parses a valid numeric value", () => {
    expect(parseEnvInt("X", 993, { env: { X: "587" } })).toBe(587);
  });

  it("returns fallback when below min", () => {
    expect(parseEnvInt("X", 993, { env: { X: "0" }, min: 1 })).toBe(993);
  });

  it("returns fallback when above max", () => {
    expect(parseEnvInt("X", 993, { env: { X: "99999" }, max: 65535 })).toBe(993);
  });

  it("accepts min/max inclusive bounds", () => {
    expect(parseEnvInt("X", 0, { env: { X: "1" }, min: 1, max: 65535 })).toBe(1);
    expect(parseEnvInt("X", 0, { env: { X: "65535" }, min: 1, max: 65535 })).toBe(65535);
  });
});

describe("parseEnvBool", () => {
  it.each(["1", "true", "yes", "on", "TRUE", "Yes"])(
    "returns true for %s",
    (v) => {
      expect(parseEnvBool("X", false, { env: { X: v } })).toBe(true);
    },
  );

  it.each(["0", "false", "no", "off", "FALSE", "n"])(
    "returns false for %s",
    (v) => {
      expect(parseEnvBool("X", true, { env: { X: v } })).toBe(false);
    },
  );

  it("returns fallback on unknown strings", () => {
    expect(parseEnvBool("X", true, { env: { X: "maybe" } })).toBe(true);
    expect(parseEnvBool("X", false, { env: { X: "maybe" } })).toBe(false);
  });

  it("returns fallback when missing", () => {
    expect(parseEnvBool("X", true, { env: {} })).toBe(true);
  });
});

describe("parseEnvString", () => {
  it("returns the value when set", () => {
    expect(parseEnvString("X", "default", { env: { X: "hello" } })).toBe("hello");
  });

  it("returns fallback when missing", () => {
    expect(parseEnvString("X", "default", { env: {} })).toBe("default");
  });

  it("enforces oneOf constraint", () => {
    expect(parseEnvString("X", "stable", { env: { X: "beta" }, oneOf: ["stable", "latest"] }))
      .toBe("stable");
    expect(parseEnvString("X", "stable", { env: { X: "latest" }, oneOf: ["stable", "latest"] }))
      .toBe("latest");
  });
});
