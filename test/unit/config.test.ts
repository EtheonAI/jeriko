import { describe, expect, it } from "bun:test";
import { loadConfig, getConfigDir, getDataDir } from "../../src/shared/config.js";
import { homedir } from "node:os";

describe("config", () => {
  it("loadConfig returns valid defaults", () => {
    const config = loadConfig();
    expect(config.agent.model).toBe("claude");
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
});
