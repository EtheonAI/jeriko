/**
 * Tests for the fnv1a hash used as part of the markdown-cache key.
 */

import { describe, test, expect } from "bun:test";
import { fnv1a } from "../../../../src/cli/rendering/index.js";

describe("fnv1a", () => {
  test("empty string hashes to a stable value", () => {
    // FNV-1a with empty input collapses to the offset basis (0x811c9dc5).
    expect(fnv1a("")).toBe("811c9dc5");
  });

  test("is deterministic", () => {
    expect(fnv1a("hello")).toBe(fnv1a("hello"));
  });

  test("different inputs produce different outputs (no trivial collision)", () => {
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
    expect(fnv1a("hello")).not.toBe(fnv1a("hell"));
    expect(fnv1a("foo")).not.toBe(fnv1a("bar"));
  });

  test("output is a valid hex string", () => {
    const h = fnv1a("some text");
    expect(/^[0-9a-f]+$/.test(h)).toBe(true);
  });

  test("case-sensitive", () => {
    expect(fnv1a("Hello")).not.toBe(fnv1a("hello"));
  });
});
