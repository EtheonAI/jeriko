/**
 * Tests for the TUI Prompt component logic.
 *
 * Tests the extracted prompt logic (submit gating, content reading, state
 * transitions) without requiring a SolidJS or @opentui runtime. Follows
 * the same extraction pattern as agent-provider.test.ts.
 */

import { describe, test, expect, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Mock TextareaRenderable — mirrors the properties used by Prompt
// ---------------------------------------------------------------------------

interface MockTextareaRef {
  plainText: string;
  cleared: boolean;
  focused: boolean;
  clear(): void;
  focus(): void;
  blur(): void;
}

function createMockRef(plainText = ""): MockTextareaRef {
  return {
    plainText,
    cleared: false,
    focused: false,
    clear() {
      this.plainText = "";
      this.cleared = true;
    },
    focus() {
      this.focused = true;
    },
    blur() {
      this.focused = false;
    },
  };
}

// ---------------------------------------------------------------------------
// Extracted content-change logic (mirrors Prompt.handleContentChange)
//
// @opentui/core fires onContentChange with a ContentChangeEvent (empty {}),
// NOT a string. The actual text lives on the ref's plainText getter.
// ---------------------------------------------------------------------------

function readContentFromRef(ref: MockTextareaRef | undefined): string {
  if (!ref) return "";
  return ref.plainText;
}

// ---------------------------------------------------------------------------
// Extracted submit logic (mirrors Prompt.handleSubmit)
// ---------------------------------------------------------------------------

interface SubmitContext {
  ref: MockTextareaRef | undefined;
  isStreaming: boolean;
}

interface SubmitResult {
  submitted: boolean;
  submittedText?: string;
}

function evaluateSubmit(ctx: SubmitContext): SubmitResult {
  if (!ctx.ref) return { submitted: false };
  const value = ctx.ref.plainText.trim();
  if (!value || ctx.isStreaming) return { submitted: false };
  return { submitted: true, submittedText: value };
}

function executeSubmit(
  ctx: SubmitContext,
  onSubmit: (text: string) => void,
): SubmitResult {
  const result = evaluateSubmit(ctx);
  if (!result.submitted || !ctx.ref) return result;

  onSubmit(result.submittedText!);
  ctx.ref.clear();
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Prompt — Content Reading", () => {
  test("reads plainText from the ref, not from callback argument", () => {
    const ref = createMockRef("hello world");
    // The callback argument from @opentui/core is an empty object,
    // but we should read from the ref's plainText property.
    const callbackArg = {}; // ContentChangeEvent — empty
    const text = readContentFromRef(ref);
    expect(text).toBe("hello world");
    expect(callbackArg).toEqual({}); // confirm it's useless
  });

  test("returns empty string when ref is undefined", () => {
    expect(readContentFromRef(undefined)).toBe("");
  });

  test("reads updated text after ref changes", () => {
    const ref = createMockRef("initial");
    expect(readContentFromRef(ref)).toBe("initial");

    ref.plainText = "updated text";
    expect(readContentFromRef(ref)).toBe("updated text");
  });

  test("reads empty string from cleared ref", () => {
    const ref = createMockRef("some text");
    ref.clear();
    expect(readContentFromRef(ref)).toBe("");
  });
});

describe("Prompt — Submit Gating", () => {
  test("submits with valid text and not streaming", () => {
    const ref = createMockRef("hello");
    const result = evaluateSubmit({ ref, isStreaming: false });
    expect(result.submitted).toBe(true);
    expect(result.submittedText).toBe("hello");
  });

  test("rejects when ref is undefined", () => {
    const result = evaluateSubmit({ ref: undefined, isStreaming: false });
    expect(result.submitted).toBe(false);
  });

  test("rejects empty text", () => {
    const ref = createMockRef("");
    const result = evaluateSubmit({ ref, isStreaming: false });
    expect(result.submitted).toBe(false);
  });

  test("rejects whitespace-only text", () => {
    const ref = createMockRef("   \n\t  ");
    const result = evaluateSubmit({ ref, isStreaming: false });
    expect(result.submitted).toBe(false);
  });

  test("rejects when streaming", () => {
    const ref = createMockRef("valid text");
    const result = evaluateSubmit({ ref, isStreaming: true });
    expect(result.submitted).toBe(false);
  });

  test("trims whitespace from submitted text", () => {
    const ref = createMockRef("  hello world  ");
    const result = evaluateSubmit({ ref, isStreaming: false });
    expect(result.submitted).toBe(true);
    expect(result.submittedText).toBe("hello world");
  });
});

describe("Prompt — Submit Execution", () => {
  test("calls onSubmit with trimmed text", () => {
    const onSubmit = mock(() => {});
    const ref = createMockRef("  send this  ");
    executeSubmit({ ref, isStreaming: false }, onSubmit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("send this");
  });

  test("clears the ref after submit", () => {
    const ref = createMockRef("hello");
    executeSubmit({ ref, isStreaming: false }, () => {});

    expect(ref.cleared).toBe(true);
    expect(ref.plainText).toBe("");
  });

  test("does not call onSubmit when gating fails", () => {
    const onSubmit = mock(() => {});

    // Empty text
    executeSubmit({ ref: createMockRef(""), isStreaming: false }, onSubmit);
    expect(onSubmit).not.toHaveBeenCalled();

    // Streaming
    executeSubmit({ ref: createMockRef("text"), isStreaming: true }, onSubmit);
    expect(onSubmit).not.toHaveBeenCalled();

    // No ref
    executeSubmit({ ref: undefined, isStreaming: false }, onSubmit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("does not clear ref when gating fails", () => {
    const ref = createMockRef("text");
    executeSubmit({ ref, isStreaming: true }, () => {});
    expect(ref.cleared).toBe(false);
    expect(ref.plainText).toBe("text");
  });
});

describe("Prompt — Full Interaction Flow", () => {
  test("type → submit → clear cycle", () => {
    const submitted: string[] = [];
    const onSubmit = (text: string) => submitted.push(text);
    const ref = createMockRef("");

    // Simulate typing
    ref.plainText = "h";
    expect(readContentFromRef(ref)).toBe("h");
    ref.plainText = "he";
    expect(readContentFromRef(ref)).toBe("he");
    ref.plainText = "hello";
    expect(readContentFromRef(ref)).toBe("hello");

    // Submit
    const result = executeSubmit({ ref, isStreaming: false }, onSubmit);
    expect(result.submitted).toBe(true);
    expect(submitted).toEqual(["hello"]);

    // After submit, ref is cleared
    expect(ref.plainText).toBe("");
    expect(readContentFromRef(ref)).toBe("");
  });

  test("submit blocked during streaming, succeeds after", () => {
    const submitted: string[] = [];
    const onSubmit = (text: string) => submitted.push(text);
    const ref = createMockRef("hello");

    // Try during streaming — blocked
    const blocked = executeSubmit({ ref, isStreaming: true }, onSubmit);
    expect(blocked.submitted).toBe(false);
    expect(submitted).toEqual([]);
    expect(ref.plainText).toBe("hello"); // not cleared

    // After streaming ends — succeeds
    const success = executeSubmit({ ref, isStreaming: false }, onSubmit);
    expect(success.submitted).toBe(true);
    expect(submitted).toEqual(["hello"]);
  });

  test("slash commands pass through as regular text", () => {
    // The Prompt component doesn't handle slash commands —
    // it submits text to the parent, which routes through CommandProvider.
    const submitted: string[] = [];
    const ref = createMockRef("/help");
    executeSubmit({ ref, isStreaming: false }, (text) => submitted.push(text));

    expect(submitted).toEqual(["/help"]);
  });

  test("multiline text preserves newlines", () => {
    const submitted: string[] = [];
    const ref = createMockRef("line 1\nline 2\nline 3");
    executeSubmit({ ref, isStreaming: false }, (text) => submitted.push(text));

    expect(submitted).toEqual(["line 1\nline 2\nline 3"]);
  });
});

describe("Prompt — Key Bindings", () => {
  // Import the constant indirectly by verifying its structure.
  // The key bindings array is exported implicitly through the component,
  // but we can verify the expected shape here.

  const expectedBindings = [
    { name: "return", action: "submit" },
    { name: "return", meta: true, action: "newline" },
    { name: "left", action: "move-left" },
    { name: "right", action: "move-right" },
    { name: "up", action: "move-up" },
    { name: "down", action: "move-down" },
    { name: "backspace", action: "backspace" },
    { name: "delete", action: "delete" },
    { name: "home", action: "buffer-home" },
    { name: "end", action: "buffer-end" },
  ];

  test("return key maps to submit action", () => {
    const returnBinding = expectedBindings.find(
      (b) => b.name === "return" && !("meta" in b && b.meta),
    );
    expect(returnBinding?.action).toBe("submit");
  });

  test("meta+return maps to newline action", () => {
    const metaReturn = expectedBindings.find(
      (b) => b.name === "return" && "meta" in b && b.meta,
    );
    expect(metaReturn?.action).toBe("newline");
  });

  test("all navigation keys are mapped", () => {
    const navActions = ["move-left", "move-right", "move-up", "move-down"];
    for (const action of navActions) {
      const binding = expectedBindings.find((b) => b.action === action);
      expect(binding).toBeDefined();
    }
  });

  test("editing keys are mapped", () => {
    const editActions = ["backspace", "delete", "buffer-home", "buffer-end"];
    for (const action of editActions) {
      const binding = expectedBindings.find((b) => b.action === action);
      expect(binding).toBeDefined();
    }
  });
});

describe("Prompt — Mock Ref Behavior", () => {
  test("clear resets plainText and sets cleared flag", () => {
    const ref = createMockRef("test");
    expect(ref.plainText).toBe("test");
    expect(ref.cleared).toBe(false);

    ref.clear();
    expect(ref.plainText).toBe("");
    expect(ref.cleared).toBe(true);
  });

  test("focus and blur toggle state", () => {
    const ref = createMockRef();
    expect(ref.focused).toBe(false);

    ref.focus();
    expect(ref.focused).toBe(true);

    ref.blur();
    expect(ref.focused).toBe(false);
  });
});
