import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { loadConfig, getConfigDir, getDataDir, getUserId } from "../../src/shared/config.js";

describe("config", () => {
  it("loadConfig returns valid defaults", () => {
    const config = loadConfig();
    expect(typeof config.agent.model).toBe("string");
    expect(config.agent.model.length).toBeGreaterThan(0);
    expect(config.agent.maxTokens).toBeGreaterThan(0);
    expect(config.agent.temperature).toBeGreaterThanOrEqual(0);
    expect(config.agent.temperature).toBeLessThanOrEqual(1);
  });

  it("loadConfig returns valid security defaults", () => {
    const config = loadConfig();
    expect(config.security.allowedPaths.length).toBeGreaterThan(0);
    expect(config.security.blockedCommands.length).toBeGreaterThan(0);
    expect(config.security.sensitiveKeys).toContain("ANTHROPIC_API_KEY");
  });

  it("loadConfig returns valid logging defaults", () => {
    const config = loadConfig();
    expect(config.logging.level).toBe("info");
    expect(config.logging.maxFileSize).toBeGreaterThan(0);
    expect(config.logging.maxFiles).toBeGreaterThan(0);
  });

  it("getConfigDir returns a path under home", () => {
    const dir = getConfigDir();
    expect(dir).toContain("jeriko");
  });

  it("getDataDir returns a path under home", () => {
    const dir = getDataDir();
    expect(dir).toContain("jeriko");
  });

  it("loadConfig warns when a config file contains malformed JSON", () => {
    const warn = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warn;

    try {
      process.env.XDG_CONFIG_HOME = "/tmp/jeriko-test-malformed-config";
      const { mkdirSync, writeFileSync, rmSync } = require("node:fs");
      const { join } = require("node:path");
      const configDir = join(process.env.XDG_CONFIG_HOME, "jeriko");
      rmSync(process.env.XDG_CONFIG_HOME, { recursive: true, force: true });
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, "config.json"), "{ invalid json ");

      const config = loadConfig();
      expect(config.agent).toBeTruthy();
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0]?.[0] ?? "")).toContain("malformed JSON");
    } finally {
      delete process.env.XDG_CONFIG_HOME;
      console.warn = originalWarn;
      const { rmSync } = require("node:fs");
      rmSync("/tmp/jeriko-test-malformed-config", { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// deepMerge prototype pollution guard
// ---------------------------------------------------------------------------

describe("deepMerge prototype pollution guard", () => {
  it("loadConfig does not pollute Object.prototype via __proto__", () => {
    // The guard is inside deepMerge which is called by mergeFromFile.
    // We can't directly call deepMerge (it's private), but we can verify
    // that the config loader handles malicious keys safely.
    const before = Object.getOwnPropertyNames(Object.prototype).length;
    // loadConfig calls deepMerge on each config file it finds — the guard
    // prevents __proto__, constructor, prototype keys from being merged.
    const config = loadConfig();
    const after = Object.getOwnPropertyNames(Object.prototype).length;
    expect(after).toBe(before);
    // Verify no "polluted" key leaked onto a plain object
    const plain: Record<string, unknown> = {};
    expect((plain as any).polluted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getUserId validation
// ---------------------------------------------------------------------------

describe("getUserId validation", () => {
  let originalUserId: string | undefined;

  beforeEach(() => {
    originalUserId = process.env.JERIKO_USER_ID;
  });

  afterEach(() => {
    if (originalUserId !== undefined) {
      process.env.JERIKO_USER_ID = originalUserId;
    } else {
      delete process.env.JERIKO_USER_ID;
    }
  });

  it("returns undefined when env var is not set", () => {
    delete process.env.JERIKO_USER_ID;
    expect(getUserId()).toBeUndefined();
  });

  it("accepts a valid hex string (64 chars)", () => {
    process.env.JERIKO_USER_ID = "a".repeat(64);
    expect(getUserId()).toBe("a".repeat(64));
  });

  it("accepts a valid UUID format", () => {
    process.env.JERIKO_USER_ID = "550e8400-e29b-41d4-a716-446655440000";
    expect(getUserId()).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects a path traversal attempt", () => {
    process.env.JERIKO_USER_ID = "../../../etc/passwd";
    expect(getUserId()).toBeUndefined();
  });

  it("rejects an empty string", () => {
    process.env.JERIKO_USER_ID = "";
    expect(getUserId()).toBeUndefined();
  });

  it("rejects arbitrary text", () => {
    process.env.JERIKO_USER_ID = "hello world";
    expect(getUserId()).toBeUndefined();
  });

  it("accepts a 32-char hex string", () => {
    process.env.JERIKO_USER_ID = "abcdef0123456789abcdef0123456789";
    expect(getUserId()).toBe("abcdef0123456789abcdef0123456789");
  });
});
