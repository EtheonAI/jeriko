/**
 * Tests for shared CLI validation helpers.
 */

import { describe, test, expect } from "bun:test";
import {
  validateEmail,
  validateUrl,
  validateRequired,
  validateMinLength,
  validateDatetime,
  validateSkillName,
  getErrorMessage,
} from "../../../src/cli/lib/validate.js";

describe("validateEmail", () => {
  test("accepts valid emails", () => {
    expect(validateEmail("user@example.com")).toBeUndefined();
    expect(validateEmail("a@b.c")).toBeUndefined();
    expect(validateEmail("foo+bar@domain.co.uk")).toBeUndefined();
  });

  test("rejects invalid emails", () => {
    expect(validateEmail("")).toBeDefined();
    expect(validateEmail("not-an-email")).toBeDefined();
    expect(validateEmail("@missing.user")).toBeDefined();
    expect(validateEmail("missing@")).toBeDefined();
    expect(validateEmail("has spaces@bad.com")).toBeDefined();
  });
});

describe("validateUrl", () => {
  test("accepts http and https", () => {
    expect(validateUrl("https://example.com")).toBeUndefined();
    expect(validateUrl("http://localhost:3000")).toBeUndefined();
  });

  test("rejects non-http URLs", () => {
    expect(validateUrl("ftp://files.com")).toBeDefined();
    expect(validateUrl("example.com")).toBeDefined();
    expect(validateUrl("")).toBeDefined();
  });
});

describe("validateRequired", () => {
  test("accepts non-empty strings", () => {
    expect(validateRequired("hello")).toBeUndefined();
    expect(validateRequired("  x  ")).toBeUndefined();
  });

  test("rejects empty or whitespace-only", () => {
    expect(validateRequired("")).toBeDefined();
    expect(validateRequired("   ")).toBeDefined();
  });
});

describe("validateMinLength", () => {
  test("creates validator with custom min and label", () => {
    const validate = validateMinLength(5, "Name");
    expect(validate("hello")).toBeUndefined();
    expect(validate("hi")).toBeDefined();
    expect(validate("hi")).toContain("Name");
    expect(validate("hi")).toContain("5");
  });

  test("trims before checking", () => {
    const validate = validateMinLength(3);
    expect(validate("  ab  ")).toBeDefined();
    expect(validate("  abc  ")).toBeUndefined();
  });
});

describe("validateDatetime", () => {
  test("accepts valid ISO dates", () => {
    expect(validateDatetime("2026-06-01T09:00")).toBeUndefined();
    expect(validateDatetime("2026-01-15")).toBeUndefined();
  });

  test("rejects invalid dates", () => {
    expect(validateDatetime("not-a-date")).toBeDefined();
    expect(validateDatetime("")).toBeDefined();
  });
});

describe("validateSkillName", () => {
  test("accepts valid skill names", () => {
    expect(validateSkillName("my-skill")).toBeUndefined();
    expect(validateSkillName("skill123")).toBeUndefined();
    expect(validateSkillName("ab")).toBeUndefined();
  });

  test("rejects invalid skill names", () => {
    expect(validateSkillName("a")).toBeDefined();
    expect(validateSkillName("My Skill")).toBeDefined();
    expect(validateSkillName("UPPERCASE")).toBeDefined();
    expect(validateSkillName("-leading-dash")).toBeDefined();
  });
});

describe("getErrorMessage", () => {
  test("extracts message from Error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  test("converts non-Error to string", () => {
    expect(getErrorMessage("raw string")).toBe("raw string");
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(null)).toBe("null");
  });
});
