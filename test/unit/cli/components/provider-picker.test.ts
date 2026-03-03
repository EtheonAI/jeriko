/**
 * ProviderPicker component tests — verifies provider filtering, rendering,
 * auto-configuration for discovered providers, and cancel behavior.
 *
 * Test strategy:
 *   - Pure function tests for filterPickerProviders (no React)
 *   - Rendering tests for each visual state (synchronous)
 *   - Callback tests for user interactions (onComplete, onCancel)
 *
 * Note: Ink 6 + React 18 batches useInput state updates, so tests that
 * assert on lastFrame() after stdin.write() are unreliable under load.
 * We test callback invocations instead — these fire synchronously.
 */

import { describe, test, expect, mock } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import {
  ProviderPicker,
  filterPickerProviders,
  type PickerResult,
} from "../../../../src/cli/components/ProviderPicker.js";
import type { ProviderInfo } from "../../../../src/cli/types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Wait for React to flush batched state updates. */
function flush(ms = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeProvider(overrides: Partial<ProviderInfo> = {}): ProviderInfo {
  return {
    id: "groq",
    name: "Groq",
    type: "available",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.1-8b-instant",
    envKey: "GROQ_API_KEY",
    ...overrides,
  };
}

/** Realistic provider set covering all types. */
function makeProviderSet(): ProviderInfo[] {
  return [
    makeProvider({ id: "anthropic", name: "Anthropic", type: "built-in" }),
    makeProvider({ id: "openai", name: "OpenAI", type: "built-in" }),
    makeProvider({ id: "my-custom", name: "My Custom", type: "custom", baseUrl: "https://custom.api.com/v1" }),
    makeProvider({
      id: "google",
      name: "Google (Gemini)",
      type: "discovered",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-2.5-pro",
      envKey: "GEMINI_API_KEY",
    }),
    makeProvider({
      id: "groq",
      name: "Groq",
      type: "available",
      baseUrl: "https://api.groq.com/openai/v1",
      defaultModel: "llama-3.1-8b-instant",
      envKey: "GROQ_API_KEY",
    }),
    makeProvider({
      id: "deepseek",
      name: "DeepSeek",
      type: "available",
      baseUrl: "https://api.deepseek.com",
      defaultModel: "deepseek-chat",
      envKey: "DEEPSEEK_API_KEY",
    }),
    makeProvider({
      id: "xai",
      name: "xAI (Grok)",
      type: "available",
      baseUrl: "https://api.x.ai/v1",
      defaultModel: "grok-3-latest",
      envKey: "XAI_API_KEY",
    }),
  ];
}

// ANSI key codes for ink input
const KEYS = {
  UP: "\u001B[A",
  DOWN: "\u001B[B",
  ENTER: "\r",
  ESCAPE: "\u001B\u001B",
  BACKSPACE: "\u007F",
};

// ---------------------------------------------------------------------------
// filterPickerProviders — pure logic
// ---------------------------------------------------------------------------

describe("filterPickerProviders", () => {
  test("filters to available and discovered only", () => {
    const providers = makeProviderSet();
    const result = filterPickerProviders(providers);

    expect(result.every((p) => p.type === "available" || p.type === "discovered")).toBe(true);
    expect(result.some((p) => p.type === "built-in")).toBe(false);
    expect(result.some((p) => p.type === "custom")).toBe(false);
  });

  test("preserves order from input", () => {
    const providers = makeProviderSet();
    const result = filterPickerProviders(providers);
    const ids = result.map((p) => p.id);

    expect(ids).toEqual(["google", "groq", "deepseek", "xai"]);
  });

  test("returns empty for no eligible providers", () => {
    const providers = [
      makeProvider({ id: "a", type: "built-in" }),
      makeProvider({ id: "b", type: "custom" }),
    ];
    expect(filterPickerProviders(providers)).toEqual([]);
  });

  test("handles empty input", () => {
    expect(filterPickerProviders([])).toEqual([]);
  });

  test("handles all discovered", () => {
    const providers = [
      makeProvider({ id: "a", type: "discovered" }),
      makeProvider({ id: "b", type: "discovered" }),
    ];
    const result = filterPickerProviders(providers);
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.type === "discovered")).toBe(true);
  });

  test("handles all available", () => {
    const providers = [
      makeProvider({ id: "a", type: "available" }),
      makeProvider({ id: "b", type: "available" }),
    ];
    const result = filterPickerProviders(providers);
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.type === "available")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProviderPicker — rendering (synchronous, no input)
// ---------------------------------------------------------------------------

describe("ProviderPicker rendering", () => {
  test("renders header", () => {
    const { lastFrame } = render(
      React.createElement(ProviderPicker, {
        providers: makeProviderSet(),
        onComplete: () => {},
        onCancel: () => {},
      }),
    );
    expect(lastFrame()!).toContain("Add a Provider");
  });

  test("renders available provider names", () => {
    const { lastFrame } = render(
      React.createElement(ProviderPicker, {
        providers: makeProviderSet(),
        onComplete: () => {},
        onCancel: () => {},
      }),
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Groq");
    expect(frame).toContain("DeepSeek");
    expect(frame).toContain("xAI (Grok)");
  });

  test("renders discovered providers with env var badge", () => {
    const { lastFrame } = render(
      React.createElement(ProviderPicker, {
        providers: makeProviderSet(),
        onComplete: () => {},
        onCancel: () => {},
      }),
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Google (Gemini)");
    expect(frame).toContain("GEMINI_API_KEY set");
  });

  test("renders default model hints", () => {
    const { lastFrame } = render(
      React.createElement(ProviderPicker, {
        providers: makeProviderSet(),
        onComplete: () => {},
        onCancel: () => {},
      }),
    );
    const frame = lastFrame()!;
    expect(frame).toContain("llama-3.1-8b-instant");
    expect(frame).toContain("deepseek-chat");
    expect(frame).toContain("gemini-2.5-pro");
  });

  test("renders navigation hint", () => {
    const { lastFrame } = render(
      React.createElement(ProviderPicker, {
        providers: makeProviderSet(),
        onComplete: () => {},
        onCancel: () => {},
      }),
    );
    const frame = lastFrame()!;
    expect(frame).toContain("navigate");
    expect(frame).toContain("Enter");
    expect(frame).toContain("Esc");
  });

  test("renders selection marker", () => {
    const { lastFrame } = render(
      React.createElement(ProviderPicker, {
        providers: makeProviderSet(),
        onComplete: () => {},
        onCancel: () => {},
      }),
    );
    expect(lastFrame()!).toContain("▸");
  });

  test("excludes built-in and custom from list", () => {
    const { lastFrame } = render(
      React.createElement(ProviderPicker, {
        providers: makeProviderSet(),
        onComplete: () => {},
        onCancel: () => {},
      }),
    );
    const frame = lastFrame()!;
    expect(frame).not.toContain("Anthropic");
    expect(frame).not.toContain("OpenAI");
    expect(frame).not.toContain("My Custom");
  });

  test("renders empty state when no eligible providers", () => {
    const { lastFrame } = render(
      React.createElement(ProviderPicker, {
        providers: [makeProvider({ type: "built-in" })],
        onComplete: () => {},
        onCancel: () => {},
      }),
    );
    expect(lastFrame()!).toContain("No providers available");
  });

  test("renders all-configured message", () => {
    const { lastFrame } = render(
      React.createElement(ProviderPicker, {
        providers: [
          makeProvider({ id: "a", type: "built-in" }),
          makeProvider({ id: "b", type: "custom" }),
        ],
        onComplete: () => {},
        onCancel: () => {},
      }),
    );
    expect(lastFrame()!).toContain("already configured");
  });

  test("renders provider without defaultModel", () => {
    const providers: ProviderInfo[] = [
      makeProvider({ id: "lm", name: "LM Studio", type: "available", defaultModel: undefined }),
    ];
    const { lastFrame } = render(
      React.createElement(ProviderPicker, {
        providers,
        onComplete: () => {},
        onCancel: () => {},
      }),
    );
    const frame = lastFrame()!;
    expect(frame).toContain("LM Studio");
    expect(frame).toContain("Add a Provider");
  });
});

// ---------------------------------------------------------------------------
// ProviderPicker — interaction callbacks
//
// These tests verify onComplete/onCancel are called with correct data.
// Callback invocations are synchronous and reliable across all environments.
// ---------------------------------------------------------------------------

describe("ProviderPicker callbacks", () => {
  test("enter on discovered provider calls onComplete with env ref", async () => {
    const onComplete = mock((_result: PickerResult) => {});
    const providers: ProviderInfo[] = [
      makeProvider({
        id: "google",
        name: "Google (Gemini)",
        type: "discovered",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        defaultModel: "gemini-2.5-pro",
        envKey: "GEMINI_API_KEY",
      }),
    ];

    const { stdin } = render(
      React.createElement(ProviderPicker, {
        providers,
        onComplete,
        onCancel: () => {},
      }),
    );

    stdin.write(KEYS.ENTER);
    await flush();

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]![0] as PickerResult;
    expect(result.id).toBe("google");
    expect(result.name).toBe("Google (Gemini)");
    expect(result.apiKey).toBe("{env:GEMINI_API_KEY}");
    expect(result.defaultModel).toBe("gemini-2.5-pro");
    expect(result.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
  });

  test("enter on available provider does NOT call onComplete (enters apikey phase)", async () => {
    const onComplete = mock((_result: PickerResult) => {});
    const providers: ProviderInfo[] = [
      makeProvider({ type: "available" }),
    ];

    const { stdin } = render(
      React.createElement(ProviderPicker, {
        providers,
        onComplete,
        onCancel: () => {},
      }),
    );

    stdin.write(KEYS.ENTER);
    await flush();

    // Should NOT have called onComplete — entered apikey phase instead
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("escape calls onCancel in select phase", async () => {
    const onCancel = mock(() => {});
    const { stdin } = render(
      React.createElement(ProviderPicker, {
        providers: makeProviderSet(),
        onComplete: () => {},
        onCancel,
      }),
    );

    stdin.write(KEYS.ESCAPE);
    await flush();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("escape in empty state calls onCancel", async () => {
    const onCancel = mock(() => {});
    const { stdin } = render(
      React.createElement(ProviderPicker, {
        providers: [makeProvider({ type: "built-in" })],
        onComplete: () => {},
        onCancel,
      }),
    );

    stdin.write(KEYS.ESCAPE);
    await flush();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("discovered provider result includes all fields", async () => {
    const onComplete = mock((_result: PickerResult) => {});
    const providers: ProviderInfo[] = [
      makeProvider({
        id: "xai",
        name: "xAI (Grok)",
        type: "discovered",
        baseUrl: "https://api.x.ai/v1",
        defaultModel: "grok-3-latest",
        envKey: "XAI_API_KEY",
      }),
    ];

    const { stdin } = render(
      React.createElement(ProviderPicker, {
        providers,
        onComplete,
        onCancel: () => {},
      }),
    );

    stdin.write(KEYS.ENTER);
    await flush();

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]![0] as PickerResult;
    expect(result).toEqual({
      id: "xai",
      name: "xAI (Grok)",
      baseUrl: "https://api.x.ai/v1",
      apiKey: "{env:XAI_API_KEY}",
      defaultModel: "grok-3-latest",
    });
  });

  test("discovered provider without baseUrl passes empty string", async () => {
    const onComplete = mock((_result: PickerResult) => {});
    const providers: ProviderInfo[] = [
      makeProvider({
        id: "test",
        name: "Test",
        type: "discovered",
        baseUrl: undefined,
        envKey: "TEST_KEY",
      }),
    ];

    const { stdin } = render(
      React.createElement(ProviderPicker, {
        providers,
        onComplete,
        onCancel: () => {},
      }),
    );

    stdin.write(KEYS.ENTER);
    await flush();

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]![0] as PickerResult;
    expect(result.baseUrl).toBe("");
  });
});
