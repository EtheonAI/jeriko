/**
 * Shared modules audit test suite.
 *
 * Tests pure logic in src/shared/ — no external dependencies, no filesystem,
 * no network. Verifies contracts documented in the analysis.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { parseArgs, flagStr, flagBool, requireFlag } from "../../src/shared/args.js";
import {
  setOutputFormat,
  getOutputFormat,
  okResult,
  failResult,
  EXIT,
} from "../../src/shared/output.js";
import { ExitCode, LOG_LEVEL_WEIGHT } from "../../src/shared/types.js";
import { escapeAppleScript, escapeShellArg, escapeDoubleQuoted, stripAnsi } from "../../src/shared/escape.js";
import { resolveEnvRef, isEnvRef } from "../../src/shared/env-ref.js";
import {
  buildCompositeState,
  parseCompositeState,
  DEFAULT_RELAY_URL,
  RELAY_HEARTBEAT_INTERVAL_MS,
  RELAY_MAX_BACKOFF_MS,
  RELAY_INITIAL_BACKOFF_MS,
  RELAY_AUTH_TIMEOUT_MS,
} from "../../src/shared/relay-protocol.js";
import {
  SKILL_NAME_PATTERN,
  MIN_DESCRIPTION_LENGTH,
} from "../../src/shared/skill.js";
import { parseFrontmatter, formatSkillSummaries } from "../../src/shared/skill-loader.js";
import {
  getConnectorDef,
  resolveMethod,
  collectFlags,
  CONNECTOR_DEFS,
  primaryVarName,
  slotLabel,
} from "../../src/shared/connector.js";
import { TOKEN_EXCHANGE_PROVIDERS } from "../../src/shared/oauth-exchange.js";

// ---------------------------------------------------------------------------
// 1. Config defaults and structure
// ---------------------------------------------------------------------------

describe("config", () => {
  test("loadConfig returns a valid JerikoConfig shape with all required sections", async () => {
    // loadConfig reads real config files + env, so we only verify the shape
    // and structural invariants, not specific default values.
    const { loadConfig } = await import("../../src/shared/config.js");
    const config = loadConfig();

    // All top-level sections must exist
    expect(config.agent).toBeDefined();
    expect(typeof config.agent.model).toBe("string");
    expect(typeof config.agent.maxTokens).toBe("number");
    expect(typeof config.agent.temperature).toBe("number");
    expect(typeof config.agent.extendedThinking).toBe("boolean");

    expect(config.channels).toBeDefined();
    expect(typeof config.channels.telegram.token).toBe("string");
    expect(Array.isArray(config.channels.telegram.adminIds)).toBe(true);
    expect(typeof config.channels.whatsapp.enabled).toBe("boolean");

    expect(config.connectors).toBeDefined();
    expect(typeof config.connectors.stripe.webhookSecret).toBe("string");
    expect(typeof config.connectors.paypal.webhookId).toBe("string");
    expect(typeof config.connectors.github.webhookSecret).toBe("string");
    expect(typeof config.connectors.twilio.accountSid).toBe("string");
    expect(typeof config.connectors.twilio.authToken).toBe("string");

    expect(config.security).toBeDefined();
    expect(Array.isArray(config.security.allowedPaths)).toBe(true);
    expect(Array.isArray(config.security.blockedCommands)).toBe(true);
    expect(Array.isArray(config.security.sensitiveKeys)).toBe(true);
    // These defaults should always be present (not overridden by config files)
    expect(config.security.blockedCommands).toContain("rm -rf /");
    expect(config.security.sensitiveKeys).toContain("ANTHROPIC_API_KEY");

    expect(config.storage).toBeDefined();
    expect(config.storage.dbPath).toContain("jeriko.db");
    expect(config.storage.memoryPath).toContain("memory.jsonl");

    expect(config.logging).toBeDefined();
    expect(typeof config.logging.level).toBe("string");
    expect(typeof config.logging.maxFileSize).toBe("number");
    expect(typeof config.logging.maxFiles).toBe("number");
  });

  test("getUserId returns undefined when env var is not set", async () => {
    const saved = process.env.JERIKO_USER_ID;
    delete process.env.JERIKO_USER_ID;
    try {
      const { getUserId } = await import("../../src/shared/config.js");
      expect(getUserId()).toBeUndefined();
    } finally {
      if (saved !== undefined) process.env.JERIKO_USER_ID = saved;
    }
  });

  test("getUserId returns the value when set", async () => {
    const saved = process.env.JERIKO_USER_ID;
    process.env.JERIKO_USER_ID = "test-user-123";
    try {
      const { getUserId } = await import("../../src/shared/config.js");
      expect(getUserId()).toBe("test-user-123");
    } finally {
      if (saved !== undefined) {
        process.env.JERIKO_USER_ID = saved;
      } else {
        delete process.env.JERIKO_USER_ID;
      }
    }
  });

  test("getUserId returns undefined for empty string", async () => {
    const saved = process.env.JERIKO_USER_ID;
    process.env.JERIKO_USER_ID = "";
    try {
      const { getUserId } = await import("../../src/shared/config.js");
      expect(getUserId()).toBeUndefined();
    } finally {
      if (saved !== undefined) {
        process.env.JERIKO_USER_ID = saved;
      } else {
        delete process.env.JERIKO_USER_ID;
      }
    }
  });

  test("getConfigDir respects XDG_CONFIG_HOME", async () => {
    const saved = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = "/tmp/xdg-config";
    try {
      const { getConfigDir } = await import("../../src/shared/config.js");
      expect(getConfigDir()).toBe("/tmp/xdg-config/jeriko");
    } finally {
      if (saved !== undefined) {
        process.env.XDG_CONFIG_HOME = saved;
      } else {
        delete process.env.XDG_CONFIG_HOME;
      }
    }
  });

  test("getDataDir respects XDG_DATA_HOME", async () => {
    const saved = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = "/tmp/xdg-data";
    try {
      const { getDataDir } = await import("../../src/shared/config.js");
      expect(getDataDir()).toBe("/tmp/xdg-data/jeriko");
    } finally {
      if (saved !== undefined) {
        process.env.XDG_DATA_HOME = saved;
      } else {
        delete process.env.XDG_DATA_HOME;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Args parsing
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  test("parses --flag value pairs", () => {
    const { flags, positional } = parseArgs(["--name", "alice", "--age", "30"]);
    expect(flags.name).toBe("alice");
    expect(flags.age).toBe("30");
    expect(positional).toEqual([]);
  });

  test("parses --flag=value syntax", () => {
    const { flags } = parseArgs(["--name=bob", "--count=5"]);
    expect(flags.name).toBe("bob");
    expect(flags.count).toBe("5");
  });

  test("parses boolean flags", () => {
    const { flags } = parseArgs(["--verbose", "--debug"]);
    expect(flags.verbose).toBe(true);
    expect(flags.debug).toBe(true);
  });

  test("parses --no- negation prefix", () => {
    const { flags } = parseArgs(["--no-color", "--no-cache"]);
    expect(flags.color).toBe(false);
    expect(flags.cache).toBe(false);
  });

  test("parses short flags with values", () => {
    const { flags } = parseArgs(["-f", "json", "-n", "10"]);
    expect(flags.f).toBe("json");
    expect(flags.n).toBe("10");
  });

  test("parses short boolean flags", () => {
    const { flags } = parseArgs(["-v"]);
    expect(flags.v).toBe(true);
  });

  test("collects positional arguments", () => {
    const { positional } = parseArgs(["hello", "world"]);
    expect(positional).toEqual(["hello", "world"]);
  });

  test("-- terminates flag parsing", () => {
    const { flags, positional } = parseArgs(["--verbose", "--", "--not-a-flag", "value"]);
    expect(flags.verbose).toBe(true);
    expect(positional).toEqual(["--not-a-flag", "value"]);
  });

  test("handles mixed flags and positionals", () => {
    const { flags, positional } = parseArgs(["cmd", "--format", "json", "arg1"]);
    expect(flags.format).toBe("json");
    expect(positional).toEqual(["cmd", "arg1"]);
  });

  test("empty argv returns empty results", () => {
    const { flags, positional } = parseArgs([]);
    expect(Object.keys(flags)).toEqual([]);
    expect(positional).toEqual([]);
  });

  test("--flag followed by another flag is treated as boolean", () => {
    const { flags } = parseArgs(["--verbose", "--format", "json"]);
    expect(flags.verbose).toBe(true);
    expect(flags.format).toBe("json");
  });

  test("--flag= with empty value produces empty string", () => {
    const { flags } = parseArgs(["--name="]);
    expect(flags.name).toBe("");
  });
});

describe("flagStr", () => {
  test("extracts string value", () => {
    const args = parseArgs(["--format", "json"]);
    expect(flagStr(args, "format")).toBe("json");
  });

  test("returns default for missing flag", () => {
    const args = parseArgs([]);
    expect(flagStr(args, "format", "json")).toBe("json");
  });

  test("returns default for boolean-typed flag (no value)", () => {
    const args = parseArgs(["--verbose"]);
    expect(flagStr(args, "verbose", "fallback")).toBe("fallback");
  });

  test("returns empty string as default when not specified", () => {
    const args = parseArgs([]);
    expect(flagStr(args, "missing")).toBe("");
  });
});

describe("flagBool", () => {
  test("returns true for present flag", () => {
    const args = parseArgs(["--verbose"]);
    expect(flagBool(args, "verbose")).toBe(true);
  });

  test("returns false for --no-flag", () => {
    const args = parseArgs(["--no-verbose"]);
    expect(flagBool(args, "verbose")).toBe(false);
  });

  test("returns false for absent flag", () => {
    const args = parseArgs([]);
    expect(flagBool(args, "verbose")).toBe(false);
  });

  test("returns true when flag has a string value", () => {
    const args = parseArgs(["--format", "json"]);
    expect(flagBool(args, "format")).toBe(true);
  });
});

describe("requireFlag", () => {
  test("returns string value for present flag", () => {
    const args = parseArgs(["--id", "abc123"]);
    expect(requireFlag(args, "id")).toBe("abc123");
  });

  test("throws for missing flag", () => {
    const args = parseArgs([]);
    expect(() => requireFlag(args, "id")).toThrow("Missing required flag: --id");
  });

  test("throws for boolean flag (no value)", () => {
    const args = parseArgs(["--id"]);
    expect(() => requireFlag(args, "id")).toThrow("Missing required flag: --id");
  });
});

// ---------------------------------------------------------------------------
// 3. Output formatting
// ---------------------------------------------------------------------------

describe("output", () => {
  test("EXIT constants match ExitCode enum", () => {
    expect(EXIT.OK).toBe(ExitCode.OK);
    expect(EXIT.GENERAL).toBe(ExitCode.GENERAL);
    expect(EXIT.NETWORK).toBe(ExitCode.NETWORK);
    expect(EXIT.AUTH).toBe(ExitCode.AUTH);
    expect(EXIT.NOT_FOUND).toBe(ExitCode.NOT_FOUND);
    expect(EXIT.TIMEOUT).toBe(ExitCode.TIMEOUT);
  });

  test("EXIT values are correct numbers", () => {
    expect(EXIT.OK).toBe(0);
    expect(EXIT.GENERAL).toBe(1);
    expect(EXIT.NETWORK).toBe(2);
    expect(EXIT.AUTH).toBe(3);
    expect(EXIT.NOT_FOUND).toBe(5);
    expect(EXIT.TIMEOUT).toBe(7);
  });

  test("okResult creates success envelope", () => {
    const result = okResult({ count: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ count: 5 });
    }
  });

  test("failResult creates error envelope", () => {
    const result = failResult("not found", ExitCode.NOT_FOUND);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("not found");
      expect(result.code).toBe(5);
    }
  });

  test("failResult uses GENERAL as default code", () => {
    const result = failResult("something broke");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(ExitCode.GENERAL);
    }
  });

  test("setOutputFormat / getOutputFormat roundtrip", () => {
    const saved = getOutputFormat();
    try {
      setOutputFormat("text");
      expect(getOutputFormat()).toBe("text");
      setOutputFormat("logfmt");
      expect(getOutputFormat()).toBe("logfmt");
      setOutputFormat("json");
      expect(getOutputFormat()).toBe("json");
    } finally {
      setOutputFormat(saved);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Types
// ---------------------------------------------------------------------------

describe("types", () => {
  test("LOG_LEVEL_WEIGHT ordering is correct", () => {
    expect(LOG_LEVEL_WEIGHT.debug).toBeLessThan(LOG_LEVEL_WEIGHT.info);
    expect(LOG_LEVEL_WEIGHT.info).toBeLessThan(LOG_LEVEL_WEIGHT.warn);
    expect(LOG_LEVEL_WEIGHT.warn).toBeLessThan(LOG_LEVEL_WEIGHT.error);
  });
});

// ---------------------------------------------------------------------------
// 5. Escape functions
// ---------------------------------------------------------------------------

describe("escapeAppleScript", () => {
  test("escapes backslashes", () => {
    expect(escapeAppleScript("a\\b")).toBe("a\\\\b");
  });

  test("escapes double quotes", () => {
    expect(escapeAppleScript('He said "hello"')).toBe('He said \\"hello\\"');
  });

  test("escapes both backslashes and quotes together", () => {
    expect(escapeAppleScript('path\\to\\"file"')).toBe('path\\\\to\\\\\\"file\\"');
  });

  test("handles empty string", () => {
    expect(escapeAppleScript("")).toBe("");
  });

  test("passes through safe strings unchanged", () => {
    expect(escapeAppleScript("hello world")).toBe("hello world");
  });

  test("handles multiple consecutive quotes", () => {
    expect(escapeAppleScript('""')).toBe('\\"\\"');
  });

  test("handles multiple consecutive backslashes", () => {
    expect(escapeAppleScript("\\\\")).toBe("\\\\\\\\");
  });
});

describe("escapeShellArg", () => {
  test("wraps in single quotes", () => {
    expect(escapeShellArg("hello")).toBe("'hello'");
  });

  test("escapes embedded single quotes", () => {
    expect(escapeShellArg("it's")).toBe("'it'\\''s'");
  });

  test("handles spaces and special characters", () => {
    expect(escapeShellArg("hello world && rm -rf /")).toBe("'hello world && rm -rf /'");
  });

  test("handles empty string", () => {
    expect(escapeShellArg("")).toBe("''");
  });

  test("handles string with only single quotes", () => {
    expect(escapeShellArg("'")).toBe("''\\'''");
  });

  test("handles dollar signs and backticks (no escaping needed in single quotes)", () => {
    expect(escapeShellArg("$HOME `whoami`")).toBe("'$HOME `whoami`'");
  });
});

describe("escapeDoubleQuoted", () => {
  test("escapes dollar signs", () => {
    expect(escapeDoubleQuoted("$HOME")).toBe("\\$HOME");
  });

  test("escapes backticks", () => {
    expect(escapeDoubleQuoted("`whoami`")).toBe("\\`whoami\\`");
  });

  test("escapes double quotes", () => {
    expect(escapeDoubleQuoted('"hello"')).toBe('\\"hello\\"');
  });

  test("escapes backslashes", () => {
    expect(escapeDoubleQuoted("a\\b")).toBe("a\\\\b");
  });

  test("escapes exclamation marks", () => {
    expect(escapeDoubleQuoted("hello!")).toBe("hello\\!");
  });

  test("handles empty string", () => {
    expect(escapeDoubleQuoted("")).toBe("");
  });
});

describe("stripAnsi", () => {
  test("strips color codes", () => {
    expect(stripAnsi("\x1B[31mred\x1B[0m")).toBe("red");
  });

  test("strips bold/underline", () => {
    expect(stripAnsi("\x1B[1mbold\x1B[22m")).toBe("bold");
  });

  test("passes plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  test("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 6. Env ref resolution
// ---------------------------------------------------------------------------

describe("resolveEnvRef", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.TEST_API_KEY = process.env.TEST_API_KEY;
    savedEnv.EMPTY_VAR = process.env.EMPTY_VAR;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v !== undefined) {
        process.env[k] = v;
      } else {
        delete process.env[k];
      }
    }
  });

  test("resolves env var reference", () => {
    process.env.TEST_API_KEY = "sk-secret-123";
    expect(resolveEnvRef("{env:TEST_API_KEY}")).toBe("sk-secret-123");
  });

  test("passes through literal values", () => {
    expect(resolveEnvRef("literal-value")).toBe("literal-value");
  });

  test("throws for unset env var", () => {
    delete process.env.TEST_API_KEY;
    expect(() => resolveEnvRef("{env:TEST_API_KEY}")).toThrow(
      "Environment variable TEST_API_KEY is not set",
    );
  });

  test("throws for empty env var", () => {
    process.env.EMPTY_VAR = "";
    expect(() => resolveEnvRef("{env:EMPTY_VAR}")).toThrow(
      "Environment variable EMPTY_VAR is not set",
    );
  });

  test("does not resolve partial env ref", () => {
    expect(resolveEnvRef("prefix-{env:VAR}-suffix")).toBe("prefix-{env:VAR}-suffix");
  });

  test("handles underscores in var names", () => {
    process.env.TEST_API_KEY = "value";
    expect(resolveEnvRef("{env:TEST_API_KEY}")).toBe("value");
  });
});

describe("isEnvRef", () => {
  test("detects valid env refs", () => {
    expect(isEnvRef("{env:MY_KEY}")).toBe(true);
    expect(isEnvRef("{env:X}")).toBe(true);
    expect(isEnvRef("{env:A_B_C_123}")).toBe(true);
  });

  test("rejects non-env-ref strings", () => {
    expect(isEnvRef("plain")).toBe(false);
    expect(isEnvRef("{env:}")).toBe(false);
    expect(isEnvRef("{env:123}")).toBe(false);
    expect(isEnvRef("prefix{env:VAR}")).toBe(false);
    expect(isEnvRef("{env:VAR}suffix")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. URL builders
// ---------------------------------------------------------------------------

describe("URL builders", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    "JERIKO_PUBLIC_URL",
    "JERIKO_USER_ID",
    "JERIKO_RELAY_URL",
    "JERIKO_PORT",
    "JERIKO_SHARE_URL",
  ];

  beforeEach(() => {
    for (const k of envKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v !== undefined) {
        process.env[k] = v;
      } else {
        delete process.env[k];
      }
    }
  });

  test("buildWebhookUrl in relay mode (with userId)", async () => {
    process.env.JERIKO_USER_ID = "user-abc";
    const { buildWebhookUrl } = await import("../../src/shared/urls.js");
    const url = buildWebhookUrl("trigger-123");
    expect(url).toBe("https://bot.jeriko.ai/hooks/user-abc/trigger-123");
  });

  test("buildWebhookUrl in self-hosted mode", async () => {
    process.env.JERIKO_PUBLIC_URL = "https://my-tunnel.example.com";
    const { buildWebhookUrl } = await import("../../src/shared/urls.js");
    const url = buildWebhookUrl("trigger-123");
    expect(url).toBe("https://my-tunnel.example.com/hooks/trigger-123");
  });

  test("buildWebhookUrl in local dev mode (no userId, no public URL)", async () => {
    const { buildWebhookUrl } = await import("../../src/shared/urls.js");
    const url = buildWebhookUrl("trigger-123", "http://127.0.0.1:4000");
    expect(url).toBe("http://127.0.0.1:4000/hooks/trigger-123");
  });

  test("buildWebhookUrl local dev uses JERIKO_PORT fallback", async () => {
    process.env.JERIKO_PORT = "5555";
    const { buildWebhookUrl } = await import("../../src/shared/urls.js");
    const url = buildWebhookUrl("trigger-123");
    expect(url).toBe("http://127.0.0.1:5555/hooks/trigger-123");
  });

  test("buildOAuthCallbackUrl", async () => {
    const { buildOAuthCallbackUrl } = await import("../../src/shared/urls.js");
    const url = buildOAuthCallbackUrl("github");
    expect(url).toBe("https://bot.jeriko.ai/oauth/github/callback");
  });

  test("buildOAuthStartUrl", async () => {
    const { buildOAuthStartUrl } = await import("../../src/shared/urls.js");
    const url = buildOAuthStartUrl("github", "user-123.token-abc");
    expect(url).toBe(
      "https://bot.jeriko.ai/oauth/github/start?state=user-123.token-abc",
    );
  });

  test("getPublicUrl strips trailing slashes", async () => {
    process.env.JERIKO_PUBLIC_URL = "https://example.com///";
    const { getPublicUrl } = await import("../../src/shared/urls.js");
    expect(getPublicUrl()).toBe("https://example.com");
  });

  test("isSelfHosted returns true when JERIKO_PUBLIC_URL is set", async () => {
    process.env.JERIKO_PUBLIC_URL = "https://example.com";
    const { isSelfHosted } = await import("../../src/shared/urls.js");
    expect(isSelfHosted()).toBe(true);
  });

  test("isSelfHosted returns false by default", async () => {
    const { isSelfHosted } = await import("../../src/shared/urls.js");
    expect(isSelfHosted()).toBe(false);
  });

  test("getRelayApiUrl converts ws to http", async () => {
    process.env.JERIKO_RELAY_URL = "ws://localhost:8080/relay";
    const { getRelayApiUrl } = await import("../../src/shared/urls.js");
    expect(getRelayApiUrl()).toBe("http://localhost:8080");
  });

  test("getRelayApiUrl converts wss to https", async () => {
    process.env.JERIKO_RELAY_URL = "wss://custom.relay.io/relay";
    const { getRelayApiUrl } = await import("../../src/shared/urls.js");
    expect(getRelayApiUrl()).toBe("https://custom.relay.io");
  });

  test("getRelayApiUrl default", async () => {
    const { getRelayApiUrl } = await import("../../src/shared/urls.js");
    expect(getRelayApiUrl()).toBe("https://bot.jeriko.ai");
  });

  test("buildShareLink in relay mode with userId", async () => {
    process.env.JERIKO_USER_ID = "user-abc";
    const { buildShareLink } = await import("../../src/shared/urls.js");
    const url = buildShareLink("share-xyz");
    expect(url).toBe("https://bot.jeriko.ai/s/user-abc/share-xyz");
  });

  test("buildShareLink in self-hosted mode", async () => {
    process.env.JERIKO_PUBLIC_URL = "https://my-site.com";
    const { buildShareLink } = await import("../../src/shared/urls.js");
    const url = buildShareLink("share-xyz");
    expect(url).toBe("https://my-site.com/s/share-xyz");
  });
});

// ---------------------------------------------------------------------------
// 8. Relay protocol
// ---------------------------------------------------------------------------

describe("relay-protocol", () => {
  test("DEFAULT_RELAY_URL is wss://bot.jeriko.ai/relay", () => {
    expect(DEFAULT_RELAY_URL).toBe("wss://bot.jeriko.ai/relay");
  });

  test("constants are sensible values", () => {
    expect(RELAY_HEARTBEAT_INTERVAL_MS).toBe(30_000);
    expect(RELAY_MAX_BACKOFF_MS).toBe(60_000);
    expect(RELAY_INITIAL_BACKOFF_MS).toBe(1_000);
    expect(RELAY_AUTH_TIMEOUT_MS).toBe(15_000);
  });

  test("buildCompositeState joins with dot", () => {
    const state = buildCompositeState("user-123", "random-token");
    expect(state).toBe("user-123.random-token");
  });

  test("parseCompositeState splits on first dot", () => {
    const result = parseCompositeState("user-123.random-token");
    expect(result).toEqual({ userId: "user-123", token: "random-token" });
  });

  test("parseCompositeState handles dots in token", () => {
    const result = parseCompositeState("user-123.token.with.dots");
    expect(result).toEqual({ userId: "user-123", token: "token.with.dots" });
  });

  test("parseCompositeState returns null for no dot", () => {
    expect(parseCompositeState("no-dot-here")).toBeNull();
  });

  test("parseCompositeState returns null for empty userId", () => {
    expect(parseCompositeState(".token-only")).toBeNull();
  });

  test("parseCompositeState returns null for empty token", () => {
    expect(parseCompositeState("user-only.")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. Skill system
// ---------------------------------------------------------------------------

describe("skill types", () => {
  test("SKILL_NAME_PATTERN accepts valid names", () => {
    expect(SKILL_NAME_PATTERN.test("deploy")).toBe(true);
    expect(SKILL_NAME_PATTERN.test("my-skill")).toBe(true);
    expect(SKILL_NAME_PATTERN.test("a1")).toBe(true);
    expect(SKILL_NAME_PATTERN.test("skill-123-test")).toBe(true);
  });

  test("SKILL_NAME_PATTERN rejects invalid names", () => {
    expect(SKILL_NAME_PATTERN.test("")).toBe(false);
    expect(SKILL_NAME_PATTERN.test("a")).toBe(false);          // too short
    expect(SKILL_NAME_PATTERN.test("-bad")).toBe(false);        // starts with hyphen
    expect(SKILL_NAME_PATTERN.test("UPPER")).toBe(false);       // uppercase
    expect(SKILL_NAME_PATTERN.test("has space")).toBe(false);   // space
    expect(SKILL_NAME_PATTERN.test("under_score")).toBe(false); // underscore
  });

  test("MIN_DESCRIPTION_LENGTH is 10", () => {
    expect(MIN_DESCRIPTION_LENGTH).toBe(10);
  });
});

describe("skill-loader parseFrontmatter", () => {
  test("parses basic frontmatter", () => {
    const raw = `---
name: my-skill
description: A useful skill for testing
---

# Instructions

Do things.`;

    const { meta, body } = parseFrontmatter(raw);
    expect(meta.name).toBe("my-skill");
    expect(meta.description).toBe("A useful skill for testing");
    expect(body).toBe("# Instructions\n\nDo things.");
  });

  test("parses boolean values", () => {
    const raw = `---
name: test-skill
description: Test skill for booleans
user-invocable: true
---

Body.`;

    const { meta } = parseFrontmatter(raw);
    expect(meta.userInvocable).toBe(true);
  });

  test("parses inline arrays", () => {
    const raw = `---
name: test-skill
description: Test skill for arrays
allowed-tools: [bash, read, write]
---

Body.`;

    const { meta } = parseFrontmatter(raw);
    expect(meta.allowedTools).toEqual(["bash", "read", "write"]);
  });

  test("parses nested metadata", () => {
    const raw = `---
name: test-skill
description: Test skill for metadata
metadata:
  author: john
  version: 1.0
---

Body.`;

    const { meta } = parseFrontmatter(raw);
    expect(meta.metadata).toEqual({ author: "john", version: "1.0" });
  });

  test("normalizes kebab-case to camelCase", () => {
    const raw = `---
name: test-skill
description: Test kebab conversion
user-invocable: yes
allowed-tools: [a, b]
---

Content.`;

    const { meta } = parseFrontmatter(raw);
    expect(meta.userInvocable).toBe(true);
    expect(meta.allowedTools).toEqual(["a", "b"]);
  });

  test("throws on missing frontmatter", () => {
    expect(() => parseFrontmatter("# No frontmatter")).toThrow(
      "SKILL.md must start with YAML frontmatter",
    );
  });

  test("throws on missing name", () => {
    const raw = `---
description: has description but no name
---

Body.`;

    expect(() => parseFrontmatter(raw)).toThrow("missing required field: name");
  });

  test("throws on missing description", () => {
    const raw = `---
name: test-skill
---

Body.`;

    expect(() => parseFrontmatter(raw)).toThrow("missing required field: description");
  });

  test("strips quotes from values", () => {
    const raw = `---
name: "test-skill"
description: 'A quoted description here'
---

Body.`;

    const { meta } = parseFrontmatter(raw);
    expect(meta.name).toBe("test-skill");
    expect(meta.description).toBe("A quoted description here");
  });

  test("unknown keys go to metadata", () => {
    const raw = `---
name: test-skill
description: Test with extra keys
author: alice
version: 2.0
---

Body.`;

    const { meta } = parseFrontmatter(raw);
    expect(meta.metadata).toBeDefined();
    expect(meta.metadata!.author).toBe("alice");
    expect(meta.metadata!.version).toBe("2.0");
  });
});

describe("formatSkillSummaries", () => {
  test("returns empty string for no skills", () => {
    expect(formatSkillSummaries([])).toBe("");
  });

  test("formats skills as markdown table", () => {
    const result = formatSkillSummaries([
      { name: "deploy", description: "Deploy to production", userInvocable: true },
      { name: "lint", description: "Run code linter", userInvocable: false },
    ]);
    expect(result).toContain("## Available Skills");
    expect(result).toContain("| deploy | Deploy to production | Yes |");
    expect(result).toContain("| lint | Run code linter | No |");
  });
});

// ---------------------------------------------------------------------------
// 10. Connector system
// ---------------------------------------------------------------------------

describe("connector", () => {
  test("CONNECTOR_DEFS has entries", () => {
    expect(CONNECTOR_DEFS.length).toBeGreaterThan(10);
  });

  test("all connector names are unique", () => {
    const names = CONNECTOR_DEFS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("getConnectorDef finds by name", () => {
    const def = getConnectorDef("stripe");
    expect(def).toBeDefined();
    expect(def!.label).toBe("Stripe");
  });

  test("getConnectorDef returns undefined for unknown", () => {
    expect(getConnectorDef("nonexistent")).toBeUndefined();
  });

  test("primaryVarName returns first for alternatives", () => {
    expect(primaryVarName(["GITHUB_TOKEN", "GH_TOKEN"])).toBe("GITHUB_TOKEN");
  });

  test("primaryVarName returns string for non-array", () => {
    expect(primaryVarName("STRIPE_SECRET_KEY")).toBe("STRIPE_SECRET_KEY");
  });

  test("slotLabel joins alternatives with 'or'", () => {
    expect(slotLabel(["GITHUB_TOKEN", "GH_TOKEN"])).toBe("GITHUB_TOKEN or GH_TOKEN");
  });

  test("slotLabel returns string for non-array", () => {
    expect(slotLabel("STRIPE_SECRET_KEY")).toBe("STRIPE_SECRET_KEY");
  });
});

describe("resolveMethod", () => {
  test("empty positionals returns empty method", () => {
    expect(resolveMethod([])).toEqual({ method: "", rest: [] });
  });

  test("single positional is the method", () => {
    expect(resolveMethod(["balance"])).toEqual({ method: "balance", rest: [] });
  });

  test("dot-notation passes through", () => {
    expect(resolveMethod(["customers.list"])).toEqual({
      method: "customers.list",
      rest: [],
    });
  });

  test("two positionals with action verb join with dot", () => {
    expect(resolveMethod(["customers", "list"])).toEqual({
      method: "customers.list",
      rest: [],
    });
  });

  test("action verb with additional args", () => {
    expect(resolveMethod(["customers", "get", "cus_123"])).toEqual({
      method: "customers.get",
      rest: ["cus_123"],
    });
  });

  test("non-action second positional stays in rest", () => {
    expect(resolveMethod(["post", "Hello world"])).toEqual({
      method: "post",
      rest: ["Hello world"],
    });
  });

  test("action verb matching is case-insensitive", () => {
    expect(resolveMethod(["customers", "LIST"])).toEqual({
      method: "customers.LIST",
      rest: [],
    });
  });
});

describe("collectFlags", () => {
  test("converts kebab-case to snake_case", () => {
    const result = collectFlags({ "my-flag": "value" });
    expect(result.my_flag).toBe("value");
  });

  test("strips help flag", () => {
    const result = collectFlags({ help: true, name: "test" });
    expect(result.help).toBeUndefined();
    expect(result.name).toBe("test");
  });

  test("preserves boolean values", () => {
    const result = collectFlags({ verbose: true });
    expect(result.verbose).toBe(true);
  });

  test("handles empty flags", () => {
    expect(collectFlags({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 11. OAuth exchange providers
// ---------------------------------------------------------------------------

describe("oauth-exchange", () => {
  test("TOKEN_EXCHANGE_PROVIDERS has entries", () => {
    expect(TOKEN_EXCHANGE_PROVIDERS.size).toBeGreaterThan(10);
  });

  test("stripe uses basic auth", () => {
    const stripe = TOKEN_EXCHANGE_PROVIDERS.get("stripe");
    expect(stripe).toBeDefined();
    expect(stripe!.tokenExchangeAuth).toBe("basic");
  });

  test("github uses body auth", () => {
    const github = TOKEN_EXCHANGE_PROVIDERS.get("github");
    expect(github).toBeDefined();
    expect(github!.tokenExchangeAuth).toBe("body");
  });

  test("notion uses basic auth", () => {
    const notion = TOKEN_EXCHANGE_PROVIDERS.get("notion");
    expect(notion).toBeDefined();
    expect(notion!.tokenExchangeAuth).toBe("basic");
  });

  test("google providers have extraTokenParams", () => {
    const gdrive = TOKEN_EXCHANGE_PROVIDERS.get("gdrive");
    expect(gdrive).toBeDefined();
    expect(gdrive!.extraTokenParams).toEqual({
      access_type: "offline",
      prompt: "consent",
    });

    const gmail = TOKEN_EXCHANGE_PROVIDERS.get("gmail");
    expect(gmail).toBeDefined();
    expect(gmail!.extraTokenParams).toEqual({
      access_type: "offline",
      prompt: "consent",
    });
  });

  test("all provider names match their key", () => {
    for (const [key, provider] of TOKEN_EXCHANGE_PROVIDERS) {
      expect(provider.name).toBe(key);
    }
  });

  test("every CONNECTOR_DEF with oauth has a TOKEN_EXCHANGE_PROVIDER", () => {
    const oauthConnectors = CONNECTOR_DEFS.filter((c) => c.oauth);
    for (const connector of oauthConnectors) {
      const provider = TOKEN_EXCHANGE_PROVIDERS.get(connector.name);
      expect(provider).toBeDefined();
    }
  });
});
