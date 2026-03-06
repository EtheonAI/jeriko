/**
 * Tests for the onboarding wizard — uses mock prompter to test flow.
 *
 * Flow: Channel → (token) → Provider → (API key + verify) → done
 */

import { describe, test, expect } from "bun:test";
import { runOnboarding } from "../../../../src/cli/wizard/onboarding.js";
import type { WizardPrompter } from "../../../../src/cli/wizard/prompter.js";

// ---------------------------------------------------------------------------
// Mock prompter
// ---------------------------------------------------------------------------

interface MockCall {
  method: string;
  args: unknown[];
}

function createMockPrompter(responses: unknown[]): {
  prompter: WizardPrompter;
  calls: MockCall[];
} {
  const calls: MockCall[] = [];
  let responseIndex = 0;

  const nextResponse = () => {
    const value = responses[responseIndex];
    responseIndex++;
    return value;
  };

  const prompter: WizardPrompter = {
    intro(title: string) {
      calls.push({ method: "intro", args: [title] });
    },
    outro(message: string) {
      calls.push({ method: "outro", args: [message] });
    },
    note(message: string, title?: string) {
      calls.push({ method: "note", args: [message, title] });
    },
    async select(opts) {
      calls.push({ method: "select", args: [opts] });
      return nextResponse() as any;
    },
    async text(opts) {
      calls.push({ method: "text", args: [opts] });
      return nextResponse() as any;
    },
    async password(opts) {
      calls.push({ method: "password", args: [opts] });
      return nextResponse() as any;
    },
    async confirm(opts) {
      calls.push({ method: "confirm", args: [opts] });
      return nextResponse() as any;
    },
    spinner() {
      return {
        start(msg: string) {
          calls.push({ method: "spinner.start", args: [msg] });
        },
        stop(msg?: string) {
          calls.push({ method: "spinner.stop", args: [msg] });
        },
      };
    },
  };

  return { prompter, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runOnboarding", () => {
  test("channel first: Telegram token → Claude provider with API key", async () => {
    const { prompter } = createMockPrompter([
      "telegram",                // select channel
      "123456:ABC-DEF-GHI",     // text (telegram token)
      "anthropic",              // select provider
      "sk-test-key-1234567890", // password (API key)
    ]);

    const result = await runOnboarding(prompter, "2.0.0");

    expect(result).not.toBeNull();
    expect(result!.channel).toBe("telegram");
    expect(result!.telegramToken).toBe("123456:ABC-DEF-GHI");
    expect(result!.provider).toBe("anthropic");
    expect(result!.model).toBe("claude");
    expect(result!.apiKey).toBe("sk-test-key-1234567890");
    expect(result!.envKey).toBe("ANTHROPIC_API_KEY");
  });

  test("channel first: WhatsApp → local provider (no API key)", async () => {
    const { prompter, calls } = createMockPrompter([
      "whatsapp", // select channel
      "local",    // select provider
    ]);

    const result = await runOnboarding(prompter, "2.0.0");

    expect(result).not.toBeNull();
    expect(result!.channel).toBe("whatsapp");
    expect(result!.whatsappEnabled).toBe(true);
    expect(result!.provider).toBe("local");
    expect(result!.apiKey).toBe("");

    // WhatsApp should show a note about QR pairing
    const noteCall = calls.find((c) => c.method === "note");
    expect(noteCall).toBeDefined();
  });

  test("skip channel → OpenAI provider with API key", async () => {
    const { prompter } = createMockPrompter([
      "skip",                      // select channel
      "openai",                    // select provider
      "sk-openai-test-key-12345",  // password (API key)
    ]);

    const result = await runOnboarding(prompter, "2.0.0");

    expect(result).not.toBeNull();
    expect(result!.channel).toBe("skip");
    expect(result!.telegramToken).toBeUndefined();
    expect(result!.whatsappEnabled).toBe(false);
    expect(result!.provider).toBe("openai");
    expect(result!.apiKey).toBe("sk-openai-test-key-12345");
  });

  test("returns null when user cancels at channel selection", async () => {
    const { prompter } = createMockPrompter([
      Symbol("cancel"), // cancel at channel select
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  test("returns null when user cancels at telegram token", async () => {
    const { prompter } = createMockPrompter([
      "telegram",        // select channel
      Symbol("cancel"),  // cancel at token input
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  test("returns null when user cancels at provider selection", async () => {
    const { prompter } = createMockPrompter([
      "skip",            // select channel
      Symbol("cancel"),  // cancel at provider select
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  test("returns null when user cancels at API key input", async () => {
    const { prompter } = createMockPrompter([
      "skip",            // select channel
      "anthropic",       // select provider
      Symbol("cancel"),  // cancel at API key
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  test("calls intro and outro", async () => {
    const { prompter, calls } = createMockPrompter([
      "skip",  // select channel
      "local", // select provider
    ]);

    await runOnboarding(prompter, "2.0.0");

    const introCall = calls.find((c) => c.method === "intro");
    expect(introCall).toBeDefined();
    expect(introCall!.args[0]).toContain("2.0.0");

    const outroCall = calls.find((c) => c.method === "outro");
    expect(outroCall).toBeDefined();
  });

  test("shows spinner during API key verification", async () => {
    const { prompter, calls } = createMockPrompter([
      "skip",                      // select channel
      "openai",                    // select provider
      "sk-openai-test-key-12345",  // password (API key)
    ]);

    await runOnboarding(prompter, "2.0.0");

    const spinnerStart = calls.find((c) => c.method === "spinner.start");
    expect(spinnerStart).toBeDefined();

    const spinnerStop = calls.find((c) => c.method === "spinner.stop");
    expect(spinnerStop).toBeDefined();
  });
});
