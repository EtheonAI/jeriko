/**
 * Tests for the onboarding wizard — uses mock prompter to test flow.
 *
 * Flow (provider-only):
 *   1. Provider selection (anthropic, openai, local, lmstudio, presets)
 *   2. API key input + verification (retry on failure)
 *   3. Persist config (daemon startup is handled by createBackend)
 *
 * Local providers (Ollama, LM Studio) block until detected or user goes back.
 * Channels are added post-setup via /connect.
 *
 * NOTE: Mock API keys fail real verification, so tests always hit the
 * "verification failed" path and select "use-anyway" to proceed.
 */

import { describe, test, expect, afterEach, mock } from "bun:test";
import { runOnboarding, writeEnvBatch } from "../../../../src/cli/wizard/onboarding.js";
import type { WizardPrompter } from "../../../../src/cli/wizard/prompter.js";
import * as verify from "../../../../src/cli/wizard/verify.js";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
    if (responseIndex >= responses.length) {
      throw new Error(
        `Mock prompter ran out of responses at index ${responseIndex}. ` +
        `Calls so far: ${calls.map((c) => c.method).join(", ")}`,
      );
    }
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
// Tests — cloud providers (API key flow)
//
// Mock keys fail verification → hits "verification failed" prompt →
// user selects "use-anyway" to proceed.
// ---------------------------------------------------------------------------

describe("runOnboarding", () => {
  test("Anthropic provider with API key (use-anyway on verify fail)", async () => {
    const { prompter } = createMockPrompter([
      "anthropic",              // select provider
      "sk-test-key-1234567890", // password (API key)
      "use-anyway",             // verification fails → use anyway
    ]);

    const result = await runOnboarding(prompter, "2.0.0");

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("anthropic");
    expect(result!.model).toBe("claude");
    expect(result!.apiKey).toBe("sk-test-key-1234567890");
    expect(result!.envKey).toBe("ANTHROPIC_API_KEY");
  });

  test("OpenAI provider with API key (use-anyway on verify fail)", async () => {
    const { prompter } = createMockPrompter([
      "openai",                    // select provider
      "sk-openai-test-key-12345",  // password (API key)
      "use-anyway",                // verification fails → use anyway
    ]);

    const result = await runOnboarding(prompter, "2.0.0");

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("openai");
    expect(result!.model).toBe("gpt4");
    expect(result!.apiKey).toBe("sk-openai-test-key-12345");
    expect(result!.envKey).toBe("OPENAI_API_KEY");
  });

  test("API key verification failure — user retries with new key", async () => {
    const { prompter } = createMockPrompter([
      "anthropic",              // select provider
      "bad-key-1234567890",     // first API key
      "retry",                  // verification fails → retry
      "sk-good-key-1234567890", // second API key
      "use-anyway",             // verification fails again (mock) → use anyway
    ]);

    const result = await runOnboarding(prompter, "2.0.0");

    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe("sk-good-key-1234567890");
  });

  test("API key verification failure — user cancels", async () => {
    const { prompter } = createMockPrompter([
      "anthropic",              // select provider
      "bad-key-1234567890",     // API key
      "cancel",                 // verification fails → cancel
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  // ── Local provider ──────────────────────────────────────────────

  test("local provider — Ollama not running, user goes back to pick Anthropic", async () => {
    // Mock verifyOllamaRunning to return false regardless of environment
    const ollamaSpy = mock.module("../../../../src/cli/wizard/verify.js", () => ({
      ...verify,
      verifyOllamaRunning: async () => false,
    }));

    const { prompter } = createMockPrompter([
      "local",                    // 1. select local provider
      "back",                     // 2. Ollama not detected → go back
      "anthropic",                // 3. re-select provider
      "sk-test-key-1234567890",   // 4. enter API key
      "use-anyway",               // 5. verification fails → use anyway
    ]);

    const result = await runOnboarding(prompter, "2.0.0");

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("anthropic");
    expect(result!.apiKey).toBe("sk-test-key-1234567890");

    mock.restore();
  });

  test("local provider — Ollama not running, user cancels", async () => {
    const ollamaSpy = mock.module("../../../../src/cli/wizard/verify.js", () => ({
      ...verify,
      verifyOllamaRunning: async () => false,
    }));

    const { prompter } = createMockPrompter([
      "local",              // select local provider
      Symbol("cancel"),     // cancel at "Ollama not detected" prompt
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();

    mock.restore();
  });

  // ── Cancellation ────────────────────────────────────────────────

  test("returns null when user cancels at provider selection", async () => {
    const { prompter } = createMockPrompter([
      Symbol("cancel"), // cancel at provider select
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  test("returns null when user cancels at API key input", async () => {
    const { prompter } = createMockPrompter([
      "anthropic",       // select provider
      Symbol("cancel"),  // cancel at API key
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  // ── UI lifecycle ────────────────────────────────────────────────

  test("calls intro and outro", async () => {
    const { prompter, calls } = createMockPrompter([
      "anthropic",
      "sk-test-key-1234567890",
      "use-anyway",
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
      "openai",
      "sk-openai-test-key-12345",
      "use-anyway",
    ]);

    await runOnboarding(prompter, "2.0.0");

    const spinnerStart = calls.find(
      (c) => c.method === "spinner.start" && String(c.args[0]).includes("Verifying"),
    );
    expect(spinnerStart).toBeDefined();

    const spinnerStop = calls.find(
      (c) => c.method === "spinner.stop" && String(c.args[0]).includes("failed"),
    );
    expect(spinnerStop).toBeDefined();
  });

  test("result has no channels property (channels added post-setup)", async () => {
    const { prompter } = createMockPrompter([
      "anthropic",
      "sk-test-key-1234567890",
      "use-anyway",
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).not.toBeNull();
    expect("channels" in result!).toBe(false);
  });

  // ── Go-back flows ─────────────────────────────────────────────

  test("user goes back from API key verification failure to provider picker", async () => {
    const { prompter } = createMockPrompter([
      "anthropic",              // 1. select anthropic
      "bad-key-1234567890",     // 2. enter bad key
      "back",                   // 3. verification fails → go back to provider
      "openai",                 // 4. pick different provider
      "sk-openai-key-12345",    // 5. enter key
      "use-anyway",             // 6. verification fails → use anyway
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("openai");
    expect(result!.apiKey).toBe("sk-openai-key-12345");
  });

  test("user goes back multiple times before selecting a provider", async () => {
    const { prompter } = createMockPrompter([
      "anthropic",              // 1. select anthropic
      "bad-key-1234567890",     // 2. enter bad key
      "back",                   // 3. go back
      "openai",                 // 4. pick openai
      "bad-key-1234567890",     // 5. enter bad key
      "back",                   // 6. go back again
      "anthropic",              // 7. finally pick anthropic
      "sk-real-key-1234567890", // 8. enter key
      "use-anyway",             // 9. use anyway
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("anthropic");
    expect(result!.apiKey).toBe("sk-real-key-1234567890");
  });

  // ── API key retry flow ────────────────────────────────────────

  test("user retries API key multiple times before use-anyway", async () => {
    const { prompter } = createMockPrompter([
      "anthropic",
      "bad-key-attempt-1-xxxx",   // 1st attempt
      "retry",                     // retry
      "bad-key-attempt-2-xxxx",   // 2nd attempt
      "retry",                     // retry again
      "final-key-attempt-xxxx",   // 3rd attempt
      "use-anyway",                // give up verifying
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe("final-key-attempt-xxxx");
  });

  // ── Cancellation at every step ────────────────────────────────

  test("Ctrl+C at API key verification action prompt", async () => {
    const { prompter } = createMockPrompter([
      "anthropic",
      "bad-key-1234567890",
      Symbol("cancel"),           // Ctrl+C at retry/use-anyway/back prompt
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  // ── Provider not found edge case ──────────────────────────────

  test("unknown provider ID returns null", async () => {
    const { prompter } = createMockPrompter([
      "nonexistent-provider",     // provider not in list
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  // ── Result shape validation ────────────────────────────────────

  test("result contains all required fields", async () => {
    const { prompter } = createMockPrompter([
      "anthropic",
      "sk-test-key-1234567890",
      "use-anyway",
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).not.toBeNull();
    expect(typeof result!.provider).toBe("string");
    expect(typeof result!.model).toBe("string");
    expect(typeof result!.apiKey).toBe("string");
    expect(typeof result!.envKey).toBe("string");
    expect(result!.provider.length).toBeGreaterThan(0);
    expect(result!.model.length).toBeGreaterThan(0);
    expect(result!.apiKey.length).toBeGreaterThan(0);
    expect(result!.envKey.length).toBeGreaterThan(0);
  });

  test("outro message mentions /connect for channels", async () => {
    const { prompter, calls } = createMockPrompter([
      "anthropic",
      "sk-test-key-1234567890",
      "use-anyway",
    ]);

    await runOnboarding(prompter, "2.0.0");

    const outroCall = calls.find((c) => c.method === "outro");
    expect(outroCall).toBeDefined();
    expect(String(outroCall!.args[0])).toContain("/connect");
  });
});

// ---------------------------------------------------------------------------
// writeEnvBatch — atomic .env writes
// ---------------------------------------------------------------------------

describe("writeEnvBatch", () => {
  const testDir = join(tmpdir(), `jeriko-test-envbatch-${Date.now()}`);
  const envPath = join(testDir, ".env");

  // Clean up before each test
  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function setup(content?: string): void {
    mkdirSync(testDir, { recursive: true });
    if (content !== undefined) {
      writeFileSync(envPath, content);
    }
  }

  test("creates new .env file with all vars", () => {
    setup();
    writeEnvBatch(envPath, {
      API_KEY: "sk-123",
      SECRET: "s3cret",
    });
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("API_KEY=sk-123");
    expect(content).toContain("SECRET=s3cret");
    // Should end with newline
    expect(content.endsWith("\n")).toBe(true);
  });

  test("does not duplicate existing keys", () => {
    setup("API_KEY=old-value\n");
    writeEnvBatch(envPath, { API_KEY: "new-value" });
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("API_KEY=new-value");
    // Should NOT contain old value
    expect(content).not.toContain("old-value");
    // Should only have one occurrence of API_KEY=
    const matches = content.match(/API_KEY=/g);
    expect(matches).toHaveLength(1);
  });

  test("appends new keys without overwriting existing", () => {
    setup("EXISTING=value1\n");
    writeEnvBatch(envPath, { NEW_KEY: "value2" });
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("EXISTING=value1");
    expect(content).toContain("NEW_KEY=value2");
  });

  test("handles values containing = characters", () => {
    setup();
    writeEnvBatch(envPath, { DATABASE_URL: "postgres://user:pass@host/db?sslmode=require" });
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("DATABASE_URL=postgres://user:pass@host/db?sslmode=require");
  });

  test("handles empty vars (no-op)", () => {
    setup("EXISTING=value\n");
    writeEnvBatch(envPath, {});
    const content = readFileSync(envPath, "utf-8");
    expect(content).toBe("EXISTING=value\n");
  });

  test("handles missing file (creates it)", () => {
    setup(); // creates dir but not file
    writeEnvBatch(envPath, { KEY: "val" });
    expect(existsSync(envPath)).toBe(true);
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("KEY=val");
  });

  test("does not match substrings (MY_API_KEY vs MY_API_KEY_SECRET)", () => {
    setup("MY_API_KEY_SECRET=secret1\n");
    writeEnvBatch(envPath, { MY_API_KEY: "key1" });
    const content = readFileSync(envPath, "utf-8");
    // Should have both keys with their correct values
    expect(content).toContain("MY_API_KEY_SECRET=secret1");
    expect(content).toContain("MY_API_KEY=key1");
    // MY_API_KEY_SECRET should NOT be overwritten
    expect(content).not.toContain("MY_API_KEY_SECRET=key1");
  });
});
