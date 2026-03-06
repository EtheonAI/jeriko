import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import type { WizardPrompter } from "../../src/cli/wizard/prompter.js";
import type { OnboardingResult } from "../../src/cli/wizard/onboarding.js";

// ---------------------------------------------------------------------------
// Mock daemon module — must be before any imports that use it
// ---------------------------------------------------------------------------

mock.module("../../src/cli/lib/daemon.js", () => ({
  JERIKO_DIR: path.join(os.tmpdir(), "jeriko-mock-daemon"),
  PID_FILE: path.join(os.tmpdir(), "jeriko-mock-daemon", "daemon.pid"),
  SOCKET_PATH: path.join(os.tmpdir(), "jeriko-mock-daemon", "daemon.sock"),
  LOG_FILE: path.join(os.tmpdir(), "jeriko-mock-daemon", "data", "daemon.log"),
  readPid: () => null,
  isDaemonRunning: () => false,
  cleanupPidFile: () => {},
  spawnDaemon: async () => null,
}));

// ---------------------------------------------------------------------------
// Test fixtures — temp directory for isolated file operations
// ---------------------------------------------------------------------------

let testDir: string;
let savedEnv: Record<string, string | undefined>;

/** Env vars that must be saved/restored between tests. */
const ENV_KEYS = [
  "HOME",
  "XDG_CONFIG_HOME",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "ADMIN_TELEGRAM_IDS",
  "WHATSAPP_ENABLED",
  "STRIPE_WEBHOOK_SECRET",
  "GITHUB_WEBHOOK_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "NODE_AUTH_SECRET",
];

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "jeriko-onboard-test-"));
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  // Point config dir to test temp
  process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");
  process.env.HOME = testDir;
  // Clear API key env vars so needsSetup() returns true
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.ADMIN_TELEGRAM_IDS;
  delete process.env.WHATSAPP_ENABLED;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.GITHUB_WEBHOOK_SECRET;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.NODE_AUTH_SECRET;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Mock prompter — records calls, replays scripted answers
// ---------------------------------------------------------------------------

interface PromptCall {
  method: string;
  args: unknown[];
}

function createMockPrompter(answers: unknown[]): WizardPrompter & { calls: PromptCall[] } {
  const calls: PromptCall[] = [];
  let answerIndex = 0;

  function nextAnswer() {
    if (answerIndex >= answers.length) {
      throw new Error(`MockPrompter: no more answers (asked ${answerIndex + 1} questions)`);
    }
    return answers[answerIndex++];
  }

  return {
    calls,

    intro(title: string): void {
      calls.push({ method: "intro", args: [title] });
    },

    outro(message: string): void {
      calls.push({ method: "outro", args: [message] });
    },

    note(message: string, title?: string): void {
      calls.push({ method: "note", args: [message, title] });
    },

    async select(opts: { message: string; options: unknown[] }): Promise<any> {
      calls.push({ method: "select", args: [opts] });
      return nextAnswer();
    },

    async text(opts: { message: string }): Promise<any> {
      calls.push({ method: "text", args: [opts] });
      return nextAnswer();
    },

    async password(opts: { message: string }): Promise<any> {
      calls.push({ method: "password", args: [opts] });
      return nextAnswer();
    },

    async confirm(opts: { message: string }): Promise<any> {
      calls.push({ method: "confirm", args: [opts] });
      return nextAnswer();
    },

    spinner(): { start(msg: string): void; stop(msg?: string): void } {
      return {
        start(_msg: string) {},
        stop(_msg?: string) {},
      };
    },
  };
}

// ---------------------------------------------------------------------------
// needsSetup() tests
// ---------------------------------------------------------------------------

describe("needsSetup()", () => {
  it("returns true when no config and no API keys", () => {
    const { needsSetup } = require("../../src/cli/lib/setup.js");
    expect(needsSetup()).toBe(true);
  });

  it("returns false when config.json exists", () => {
    const configDir = path.join(testDir, ".config", "jeriko");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{}");
    const { needsSetup } = require("../../src/cli/lib/setup.js");
    expect(needsSetup()).toBe(false);
  });

  it("returns false when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-1234567890";
    const { needsSetup } = require("../../src/cli/lib/setup.js");
    expect(needsSetup()).toBe(false);
  });

  it("returns false when OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test-key-1234567890";
    const { needsSetup } = require("../../src/cli/lib/setup.js");
    expect(needsSetup()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateApiKey() tests
// ---------------------------------------------------------------------------

describe("validateApiKey()", () => {
  it("rejects keys shorter than 10 chars", () => {
    const { validateApiKey } = require("../../src/cli/lib/setup.js");
    expect(validateApiKey("short")).toBe(false);
  });

  it("rejects keys with whitespace", () => {
    const { validateApiKey } = require("../../src/cli/lib/setup.js");
    expect(validateApiKey("sk-ant-key with space")).toBe(false);
  });

  it("accepts valid API keys", () => {
    const { validateApiKey } = require("../../src/cli/lib/setup.js");
    expect(validateApiKey("sk-ant-1234567890abcdef")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wizard flow — Anthropic path
// ---------------------------------------------------------------------------

describe("runOnboarding() — Anthropic path", () => {
  it("returns correct OnboardingResult for Claude provider", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const prompter = createMockPrompter([
      "skip",                           // channel selection
      "anthropic",                       // provider selection
      "sk-ant-test-1234567890abcdef",    // API key
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("anthropic");
    expect(result!.model).toBe("claude");
    expect(result!.apiKey).toBe("sk-ant-test-1234567890abcdef");
    expect(result!.envKey).toBe("ANTHROPIC_API_KEY");
    expect(result!.channel).toBe("skip");
  });

  it("shows intro with version", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const prompter = createMockPrompter([
      "skip",
      "anthropic",
      "sk-ant-test-1234567890abcdef",
    ]);

    await runOnboarding(prompter, "3.5.0");
    const introCall = prompter.calls.find((c) => c.method === "intro");
    expect(introCall).toBeDefined();
    expect(introCall!.args[0]).toContain("3.5.0");
  });
});

// ---------------------------------------------------------------------------
// Wizard flow — OpenAI path
// ---------------------------------------------------------------------------

describe("runOnboarding() — OpenAI path", () => {
  it("returns correct OnboardingResult for GPT provider", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const prompter = createMockPrompter([
      "skip",                           // channel selection
      "openai",                         // provider selection
      "sk-openai-test-1234567890abc",   // API key
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("openai");
    expect(result!.model).toBe("gpt4");
    expect(result!.apiKey).toBe("sk-openai-test-1234567890abc");
    expect(result!.envKey).toBe("OPENAI_API_KEY");
  });
});

// ---------------------------------------------------------------------------
// Wizard flow — Local/Ollama path
// ---------------------------------------------------------------------------

describe("runOnboarding() — Local/Ollama path", () => {
  it("returns correct OnboardingResult with no API key", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const prompter = createMockPrompter([
      "skip",                           // channel selection
      "local",                          // provider selection
      // No API key prompt for local
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("local");
    expect(result!.model).toBe("local");
    expect(result!.apiKey).toBe("");
    expect(result!.envKey).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Wizard flow — Telegram channel
// ---------------------------------------------------------------------------

describe("runOnboarding() — Telegram channel", () => {
  it("captures telegram token from user input", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const prompter = createMockPrompter([
      "telegram",                                // channel selection
      "123456789:ABCdefGHIjklMNOpqrSTU-xyz",     // telegram token
      "anthropic",                               // provider selection
      "sk-ant-test-1234567890abcdef",            // API key
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("telegram");
    expect(result!.telegramToken).toBe("123456789:ABCdefGHIjklMNOpqrSTU-xyz");
  });
});

// ---------------------------------------------------------------------------
// Wizard flow — WhatsApp channel
// ---------------------------------------------------------------------------

describe("runOnboarding() — WhatsApp channel", () => {
  it("sets whatsappEnabled flag", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const prompter = createMockPrompter([
      "whatsapp",                       // channel selection
      "anthropic",                      // provider selection
      "sk-ant-test-1234567890abcdef",   // API key
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).not.toBeNull();
    expect(result!.channel).toBe("whatsapp");
    expect(result!.whatsappEnabled).toBe(true);
  });

  it("shows WhatsApp QR note", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const prompter = createMockPrompter([
      "whatsapp",
      "anthropic",
      "sk-ant-test-1234567890abcdef",
    ]);

    await runOnboarding(prompter, "2.0.0");
    const noteCall = prompter.calls.find(
      (c) => c.method === "note" && String(c.args[0]).includes("QR"),
    );
    expect(noteCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Wizard flow — User cancellation
// ---------------------------------------------------------------------------

describe("runOnboarding() — cancellation", () => {
  it("returns null when user cancels at channel select", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const cancelSymbol = Symbol("cancel");
    const prompter = createMockPrompter([cancelSymbol]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  it("returns null when user cancels at provider select", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const cancelSymbol = Symbol("cancel");
    const prompter = createMockPrompter([
      "skip",         // channel
      cancelSymbol,   // cancel at provider
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  it("returns null when user cancels at API key", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const cancelSymbol = Symbol("cancel");
    const prompter = createMockPrompter([
      "skip",         // channel
      "anthropic",    // provider
      cancelSymbol,   // cancel at API key
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });

  it("returns null when user cancels at telegram token", async () => {
    const { runOnboarding } = await import("../../src/cli/wizard/onboarding.js");
    const cancelSymbol = Symbol("cancel");
    const prompter = createMockPrompter([
      "telegram",     // channel
      cancelSymbol,   // cancel at telegram token
    ]);

    const result = await runOnboarding(prompter, "2.0.0");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// persistSetup() — config writing
// ---------------------------------------------------------------------------

describe("persistSetup() — config writing", () => {
  it("writes config.json with correct structure", async () => {
    const { persistSetup } = await import("../../src/cli/wizard/onboarding.js");

    const result: OnboardingResult = {
      provider: "anthropic",
      model: "claude",
      apiKey: "sk-ant-test-1234567890abcdef",
      envKey: "ANTHROPIC_API_KEY",
      channel: "skip",
    };

    await persistSetup(result);

    const configDir = path.join(testDir, ".config", "jeriko");
    const configPath = path.join(configDir, "config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.agent).toEqual({ model: "claude" });
    expect(config.channels.telegram).toEqual({ token: "", adminIds: [] });
    expect(config.channels.whatsapp).toEqual({ enabled: false });
    expect(config.connectors).toEqual({});
    expect(config.logging).toEqual({ level: "info" });
  });

  it("writes telegram token when provided", async () => {
    const { persistSetup } = await import("../../src/cli/wizard/onboarding.js");

    const result: OnboardingResult = {
      provider: "anthropic",
      model: "claude",
      apiKey: "sk-ant-test-1234567890abcdef",
      envKey: "ANTHROPIC_API_KEY",
      channel: "telegram",
      telegramToken: "123456789:ABCdef",
    };

    await persistSetup(result);

    const configDir = path.join(testDir, ".config", "jeriko");
    const config = JSON.parse(
      fs.readFileSync(path.join(configDir, "config.json"), "utf-8"),
    );
    expect(config.channels.telegram.token).toBe("123456789:ABCdef");
  });

  it("sets whatsapp enabled when chosen", async () => {
    const { persistSetup } = await import("../../src/cli/wizard/onboarding.js");

    const result: OnboardingResult = {
      provider: "anthropic",
      model: "claude",
      apiKey: "sk-ant-test-1234567890abcdef",
      envKey: "ANTHROPIC_API_KEY",
      channel: "whatsapp",
      whatsappEnabled: true,
    };

    await persistSetup(result);

    const configDir = path.join(testDir, ".config", "jeriko");
    const config = JSON.parse(
      fs.readFileSync(path.join(configDir, "config.json"), "utf-8"),
    );
    expect(config.channels.whatsapp.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// persistSetup() — .env writing
// ---------------------------------------------------------------------------

describe("persistSetup() — .env writing", () => {
  it("writes API key to .env file", async () => {
    const { persistSetup } = await import("../../src/cli/wizard/onboarding.js");

    const result: OnboardingResult = {
      provider: "anthropic",
      model: "claude",
      apiKey: "sk-ant-secret-key-12345",
      envKey: "ANTHROPIC_API_KEY",
    };

    await persistSetup(result);

    const envPath = path.join(testDir, ".config", "jeriko", ".env");
    expect(fs.existsSync(envPath)).toBe(true);

    const envContent = fs.readFileSync(envPath, "utf-8");
    expect(envContent).toContain("ANTHROPIC_API_KEY=sk-ant-secret-key-12345");
  });

  it("does not duplicate existing env keys", async () => {
    const { persistSetup } = await import("../../src/cli/wizard/onboarding.js");

    // Pre-create .env with existing key
    const configDir = path.join(testDir, ".config", "jeriko");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, ".env"),
      "ANTHROPIC_API_KEY=existing-key\n",
    );

    const result: OnboardingResult = {
      provider: "anthropic",
      model: "claude",
      apiKey: "sk-ant-new-key-12345",
      envKey: "ANTHROPIC_API_KEY",
    };

    await persistSetup(result);

    const envContent = fs.readFileSync(path.join(configDir, ".env"), "utf-8");
    // Should NOT have the new key appended (existing key takes precedence)
    const matches = envContent.match(/ANTHROPIC_API_KEY=/g);
    expect(matches).toHaveLength(1);
  });

  it("does not write .env when no API key (local provider)", async () => {
    const { persistSetup } = await import("../../src/cli/wizard/onboarding.js");

    const result: OnboardingResult = {
      provider: "local",
      model: "local",
      apiKey: "",
      envKey: "",
    };

    await persistSetup(result);

    const envPath = path.join(testDir, ".config", "jeriko", ".env");
    // .env should not be created when there's no API key
    expect(fs.existsSync(envPath)).toBe(false);
  });

  it("sets API key in process.env for current session", async () => {
    const { persistSetup } = await import("../../src/cli/wizard/onboarding.js");

    const result: OnboardingResult = {
      provider: "openai",
      model: "gpt4",
      apiKey: "sk-openai-session-key-123",
      envKey: "OPENAI_API_KEY",
    };

    await persistSetup(result);
    expect(process.env.OPENAI_API_KEY).toBe("sk-openai-session-key-123");
  });
});

// ---------------------------------------------------------------------------
// Non-interactive init (--non-interactive / --yes)
// ---------------------------------------------------------------------------

describe("Non-interactive init", () => {
  it("needsSetup false when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-noninteractive";
    const { needsSetup } = require("../../src/cli/lib/setup.js");
    expect(needsSetup()).toBe(false);
  });

  it("needsSetup false when only OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test-noninteractive";
    const { needsSetup } = require("../../src/cli/lib/setup.js");
    expect(needsSetup()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// daemon.ts: readPid, isDaemonRunning, cleanupPidFile (mocked)
// ---------------------------------------------------------------------------

describe("daemon.ts — PID management (mocked)", () => {
  it("readPid returns null from mock", () => {
    const { readPid } = require("../../src/cli/lib/daemon.js");
    expect(readPid()).toBeNull();
  });

  it("isDaemonRunning returns false from mock", () => {
    const { isDaemonRunning } = require("../../src/cli/lib/daemon.js");
    expect(isDaemonRunning()).toBe(false);
  });

  it("cleanupPidFile does not throw", () => {
    const { cleanupPidFile } = require("../../src/cli/lib/daemon.js");
    expect(() => cleanupPidFile()).not.toThrow();
  });

  it("spawnDaemon returns null from mock", async () => {
    const { spawnDaemon } = require("../../src/cli/lib/daemon.js");
    const result = await spawnDaemon();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// daemon.ts: spawnDaemon uses process.execPath (source verification)
// ---------------------------------------------------------------------------

describe("daemon.ts — spawnDaemon source verification", () => {
  it("process.execPath is defined and a string", () => {
    // This verifies the assumption that spawnDaemon relies on
    expect(typeof process.execPath).toBe("string");
    expect(process.execPath.length).toBeGreaterThan(0);
  });

  it("source code uses process.execPath not process.argv[0]", async () => {
    const daemonSource = fs.readFileSync(
      path.join(import.meta.dirname, "../../src/cli/lib/daemon.ts"),
      "utf-8",
    );
    // Should use process.execPath for the command
    expect(daemonSource).toContain("process.execPath");
    // The cmd variable should be set to process.execPath
    expect(daemonSource).toContain("const cmd = process.execPath");
  });
});

// ---------------------------------------------------------------------------
// getProviderOptions() — provider list
// ---------------------------------------------------------------------------

describe("getProviderOptions()", () => {
  it("always includes anthropic, openai, local", () => {
    const { getProviderOptions } = require("../../src/cli/lib/setup.js");
    const options = getProviderOptions();
    const ids = options.map((o: any) => o.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).toContain("local");
  });

  it("anthropic provider has correct metadata", () => {
    const { getProviderOptions } = require("../../src/cli/lib/setup.js");
    const options = getProviderOptions();
    const anthropic = options.find((o: any) => o.id === "anthropic");
    expect(anthropic.envKey).toBe("ANTHROPIC_API_KEY");
    expect(anthropic.needsApiKey).toBe(true);
    expect(anthropic.model).toBe("claude");
  });

  it("openai provider has correct metadata", () => {
    const { getProviderOptions } = require("../../src/cli/lib/setup.js");
    const options = getProviderOptions();
    const openai = options.find((o: any) => o.id === "openai");
    expect(openai.envKey).toBe("OPENAI_API_KEY");
    expect(openai.needsApiKey).toBe(true);
    expect(openai.model).toBe("gpt4");
  });

  it("local provider does not need API key", () => {
    const { getProviderOptions } = require("../../src/cli/lib/setup.js");
    const options = getProviderOptions();
    const local = options.find((o: any) => o.id === "local");
    expect(local.needsApiKey).toBe(false);
    expect(local.envKey).toBe("");
    expect(local.model).toBe("local");
  });
});

// ---------------------------------------------------------------------------
// CHANNEL_OPTIONS
// ---------------------------------------------------------------------------

describe("CHANNEL_OPTIONS", () => {
  it("has telegram, whatsapp, skip options", () => {
    const { CHANNEL_OPTIONS } = require("../../src/cli/lib/setup.js");
    const ids = CHANNEL_OPTIONS.map((o: any) => o.id);
    expect(ids).toContain("telegram");
    expect(ids).toContain("whatsapp");
    expect(ids).toContain("skip");
  });
});

// ---------------------------------------------------------------------------
// Backend persistSetup (separate function in backend.ts)
// ---------------------------------------------------------------------------

describe("backend.ts — persistSetup()", () => {
  it("writes config with correct JerikoConfig shape", async () => {
    const { persistSetup } = await import("../../src/cli/backend.js");

    await persistSetup(
      { envKey: "ANTHROPIC_API_KEY", model: "claude" },
      "sk-ant-backend-test-key-12345",
    );

    const configDir = path.join(testDir, ".config", "jeriko");
    const configPath = path.join(configDir, "config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.agent.model).toBe("claude");
    expect(config.channels.telegram).toEqual({ token: "", adminIds: [] });
    expect(config.channels.whatsapp).toEqual({ enabled: false });
    expect(config.connectors).toEqual({});
    expect(config.logging).toEqual({ level: "info" });
  });

  it("writes .env with API key", async () => {
    const { persistSetup } = await import("../../src/cli/backend.js");

    await persistSetup(
      { envKey: "OPENAI_API_KEY", model: "gpt4" },
      "sk-openai-backend-test-12345",
    );

    const envPath = path.join(testDir, ".config", "jeriko", ".env");
    expect(fs.existsSync(envPath)).toBe(true);
    const envContent = fs.readFileSync(envPath, "utf-8");
    expect(envContent).toContain("OPENAI_API_KEY=sk-openai-backend-test-12345");
  });
});

// ---------------------------------------------------------------------------
// verifyApiKey / verifyOllamaRunning
// ---------------------------------------------------------------------------

describe("verify.ts", () => {
  it("verifyApiKey returns true for unknown providers", async () => {
    const { verifyApiKey } = await import("../../src/cli/wizard/verify.js");
    const result = await verifyApiKey("unknown-provider", "any-key-12345");
    expect(result).toBe(true);
  });

  it("verifyOllamaRunning returns boolean", async () => {
    const { verifyOllamaRunning } = await import("../../src/cli/wizard/verify.js");
    const result = await verifyOllamaRunning();
    expect(typeof result).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// Config directory creation
// ---------------------------------------------------------------------------

describe("persistSetup() — directory creation", () => {
  it("creates config dir if it does not exist", async () => {
    const { persistSetup } = await import("../../src/cli/wizard/onboarding.js");

    const result: OnboardingResult = {
      provider: "local",
      model: "local",
      apiKey: "",
      envKey: "",
    };

    await persistSetup(result);

    const configDir = path.join(testDir, ".config", "jeriko");
    expect(fs.existsSync(configDir)).toBe(true);
    expect(fs.existsSync(path.join(configDir, "config.json"))).toBe(true);
  });
});
