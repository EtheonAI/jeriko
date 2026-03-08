/**
 * Tests for the withTimeout utility.
 */

import { describe, test, expect } from "bun:test";
import { withTimeout, TimeoutError } from "../../../src/cli/lib/timeout.js";

describe("withTimeout", () => {
  test("resolves when promise completes before timeout", async () => {
    const result = await withTimeout(
      Promise.resolve("done"),
      1000,
      "test-op",
    );
    expect(result).toBe("done");
  });

  test("rejects with TimeoutError when promise exceeds timeout", async () => {
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => resolve("late"), 5000),
    );

    try {
      await withTimeout(slow, 50, "slow-op");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).message).toContain("slow-op");
      expect((err as TimeoutError).message).toContain("timed out");
    }
  });

  test("passes through rejection from the original promise", async () => {
    const failing = Promise.reject(new Error("original-error"));

    try {
      await withTimeout(failing, 1000, "fail-op");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("original-error");
    }
  });

  test("returns immediately when timeout is 0", async () => {
    const result = await withTimeout(
      Promise.resolve(42),
      0,
      "zero-timeout",
    );
    expect(result).toBe(42);
  });

  test("TimeoutError has correct name property", () => {
    const err = new TimeoutError("test", 5000);
    expect(err.name).toBe("TimeoutError");
    expect(err.message).toBe("test timed out after 5s");
  });
});
