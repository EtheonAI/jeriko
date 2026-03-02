/**
 * Tests for InputHistory — ring buffer with deduplication and navigation.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { InputHistory } from "../../../../src/cli/lib/history.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let history: InputHistory;

beforeEach(() => {
  history = new InputHistory();
});

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

describe("push", () => {
  test("adds entries", () => {
    history.push("hello");
    expect(history.length).toBe(1);
    expect(history.get(0)).toBe("hello");
  });

  test("multiple entries in order", () => {
    history.push("first");
    history.push("second");
    history.push("third");
    expect(history.length).toBe(3);
    expect(history.toArray()).toEqual(["first", "second", "third"]);
  });

  test("skips empty string", () => {
    history.push("");
    expect(history.length).toBe(0);
  });

  test("skips whitespace-only string", () => {
    history.push("   ");
    expect(history.length).toBe(0);
  });

  test("trims entries", () => {
    history.push("  hello  ");
    expect(history.get(0)).toBe("hello");
  });

  test("deduplicates consecutive identical entries", () => {
    history.push("hello");
    history.push("hello");
    history.push("hello");
    expect(history.length).toBe(1);
  });

  test("allows non-consecutive duplicates", () => {
    history.push("hello");
    history.push("world");
    history.push("hello");
    expect(history.length).toBe(3);
    expect(history.toArray()).toEqual(["hello", "world", "hello"]);
  });

  test("dedup considers trimmed values", () => {
    history.push("hello");
    history.push("  hello  ");
    expect(history.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Ring buffer (max size)
// ---------------------------------------------------------------------------

describe("ring buffer", () => {
  test("respects max size", () => {
    const small = new InputHistory(3);
    small.push("a");
    small.push("b");
    small.push("c");
    small.push("d");
    expect(small.length).toBe(3);
    expect(small.toArray()).toEqual(["b", "c", "d"]);
  });

  test("drops oldest entries when full", () => {
    const small = new InputHistory(2);
    small.push("first");
    small.push("second");
    small.push("third");
    expect(small.get(0)).toBe("second");
    expect(small.get(1)).toBe("third");
  });

  test("max size of 1 works", () => {
    const single = new InputHistory(1);
    single.push("a");
    single.push("b");
    expect(single.length).toBe(1);
    expect(single.get(0)).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// prev / next navigation
// ---------------------------------------------------------------------------

describe("prev", () => {
  test("returns same index when empty", () => {
    expect(history.prev(0)).toBe(0);
  });

  test("navigates backward", () => {
    history.push("a");
    history.push("b");
    history.push("c");
    // Start at draft position (length = 3)
    let idx = 3;
    idx = history.prev(idx); // → 2 ("c")
    expect(idx).toBe(2);
    expect(history.get(idx)).toBe("c");

    idx = history.prev(idx); // → 1 ("b")
    expect(idx).toBe(1);
    expect(history.get(idx)).toBe("b");

    idx = history.prev(idx); // → 0 ("a")
    expect(idx).toBe(0);
    expect(history.get(idx)).toBe("a");
  });

  test("stays at 0 when already at beginning", () => {
    history.push("a");
    expect(history.prev(0)).toBe(0);
  });
});

describe("next", () => {
  test("does not go past length", () => {
    history.push("a");
    expect(history.next(1)).toBe(1);
  });

  test("navigates forward", () => {
    history.push("a");
    history.push("b");
    let idx = 0;
    idx = history.next(idx); // → 1 ("b")
    expect(idx).toBe(1);

    idx = history.next(idx); // → 2 (draft)
    expect(idx).toBe(2);
    expect(history.get(idx)).toBe(""); // draft position returns ""
  });

  test("stays at length when past end", () => {
    history.push("a");
    expect(history.next(1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe("get", () => {
  test("returns entry by index", () => {
    history.push("a");
    history.push("b");
    expect(history.get(0)).toBe("a");
    expect(history.get(1)).toBe("b");
  });

  test("returns empty string for out of bounds", () => {
    expect(history.get(-1)).toBe("");
    expect(history.get(0)).toBe("");
    expect(history.get(100)).toBe("");
  });

  test("returns empty string for draft position", () => {
    history.push("a");
    expect(history.get(1)).toBe(""); // index === length
  });
});

// ---------------------------------------------------------------------------
// isEmpty / clear
// ---------------------------------------------------------------------------

describe("isEmpty", () => {
  test("true when empty", () => {
    expect(history.isEmpty).toBe(true);
  });

  test("false when has entries", () => {
    history.push("a");
    expect(history.isEmpty).toBe(false);
  });
});

describe("clear", () => {
  test("removes all entries", () => {
    history.push("a");
    history.push("b");
    history.clear();
    expect(history.length).toBe(0);
    expect(history.isEmpty).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toArray
// ---------------------------------------------------------------------------

describe("toArray", () => {
  test("returns copy of entries", () => {
    history.push("a");
    history.push("b");
    const arr = history.toArray();
    expect(arr).toEqual(["a", "b"]);

    // Mutating the returned array doesn't affect history
    arr.push("c");
    expect(history.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Full navigation cycle
// ---------------------------------------------------------------------------

describe("full navigation cycle", () => {
  test("up from draft → history → back to draft", () => {
    history.push("first");
    history.push("second");
    history.push("third");

    let idx = history.length; // 3 (draft)

    // Go up to "third"
    idx = history.prev(idx);
    expect(history.get(idx)).toBe("third");

    // Go up to "second"
    idx = history.prev(idx);
    expect(history.get(idx)).toBe("second");

    // Go back down to "third"
    idx = history.next(idx);
    expect(history.get(idx)).toBe("third");

    // Go back to draft
    idx = history.next(idx);
    expect(idx).toBe(3);
    expect(history.get(idx)).toBe("");
  });
});
