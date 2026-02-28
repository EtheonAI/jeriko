// Unit + integration tests for the Claude Code driver.

import { describe, it, expect, beforeAll } from "bun:test";
import { ClaudeCodeDriver } from "../../src/daemon/agent/drivers/claude-code.js";
import type { DriverConfig, DriverMessage, StreamChunk } from "../../src/daemon/agent/drivers/index.js";
import { resolveModel, getCapabilities } from "../../src/daemon/agent/drivers/models.js";
import { getDriver } from "../../src/daemon/agent/drivers/index.js";

// ---------------------------------------------------------------------------
// Unit tests (no subprocess needed)
// ---------------------------------------------------------------------------

describe("claude-code driver registration", () => {
  it("resolves via getDriver('claude-code')", () => {
    const driver = getDriver("claude-code");
    expect(driver.name).toBe("claude-code");
  });

  it("resolves via getDriver('cc') alias", () => {
    const driver = getDriver("cc");
    expect(driver.name).toBe("claude-code");
  });

  it("resolves model alias 'claude-code' → claude-sonnet-4-6", () => {
    const resolved = resolveModel("claude-code", "claude-code");
    expect(resolved).toBe("claude-sonnet-4-6");
  });

  it("resolves model alias 'cc' → claude-sonnet-4-6", () => {
    const resolved = resolveModel("claude-code", "cc");
    expect(resolved).toBe("claude-sonnet-4-6");
  });

  it("has correct fallback capabilities", () => {
    const caps = getCapabilities("claude-code", "claude-sonnet-4-6");
    expect(caps.provider).toBe("claude-code");
    expect(caps.toolCall).toBe(false);
    expect(caps.reasoning).toBe(true);
    expect(caps.costInput).toBe(0);
    expect(caps.costOutput).toBe(0);
    expect(caps.context).toBe(200_000);
  });
});

describe("claude-code driver instance", () => {
  it("has name 'claude-code'", () => {
    const driver = new ClaudeCodeDriver();
    expect(driver.name).toBe("claude-code");
  });

  it("yields error + done when binary is missing", async () => {
    // Point to a nonexistent binary
    const origPath = process.env.CLAUDE_CODE_PATH;
    process.env.CLAUDE_CODE_PATH = "/nonexistent/claude-binary-that-does-not-exist";

    const driver = new ClaudeCodeDriver();
    const messages: DriverMessage[] = [
      { role: "user", content: "hello" },
    ];
    const config: DriverConfig = {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      temperature: 0.3,
    };

    const chunks: StreamChunk[] = [];
    for await (const chunk of driver.chat(messages, config)) {
      chunks.push(chunk);
    }

    // Should yield an error and a done
    const types = chunks.map((c) => c.type);
    expect(types).toContain("error");
    expect(types[types.length - 1]).toBe("done");

    // Restore
    if (origPath) {
      process.env.CLAUDE_CODE_PATH = origPath;
    } else {
      delete process.env.CLAUDE_CODE_PATH;
    }
  });
});

// ---------------------------------------------------------------------------
// Integration test (requires `claude` binary on PATH)
// ---------------------------------------------------------------------------

describe("claude-code driver integration", () => {
  let claudeAvailable = false;

  beforeAll(async () => {
    // Skip if running inside Claude Code (nested sessions are blocked)
    if (process.env.CLAUDECODE) {
      claudeAvailable = false;
      return;
    }
    try {
      const proc = Bun.spawn(["which", "claude"], { stdout: "pipe", stderr: "pipe" });
      const code = await proc.exited;
      claudeAvailable = code === 0;
    } catch {
      claudeAvailable = false;
    }
  });

  it("streams a real response from claude CLI", async () => {
    if (!claudeAvailable) {
      console.log("  ⏭ Skipping: claude binary not on PATH");
      return;
    }

    // Strip CLAUDECODE so we can spawn a nested session
    const origClaudeCode = process.env.CLAUDECODE;
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_ENTRYPOINT;

    try {
      const driver = new ClaudeCodeDriver();
      const messages: DriverMessage[] = [
        { role: "user", content: "Respond with exactly: JERIKO_TEST_OK" },
      ];
      const config: DriverConfig = {
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        temperature: 0,
      };

      const chunks: StreamChunk[] = [];
      let fullText = "";

      for await (const chunk of driver.chat(messages, config)) {
        chunks.push(chunk);
        if (chunk.type === "text") fullText += chunk.content;
      }

      const types = chunks.map((c) => c.type);

      // Must have at least one text chunk and end with done
      expect(types).toContain("text");
      expect(types[types.length - 1]).toBe("done");

      // Should NOT have tool_call — Claude Code handles tools internally
      expect(types).not.toContain("tool_call");

      // The response should contain our test string
      expect(fullText).toContain("JERIKO_TEST_OK");

      console.log(`  ✓ Got response: "${fullText.trim().slice(0, 80)}"`);
    } finally {
      if (origClaudeCode) process.env.CLAUDECODE = origClaudeCode;
    }
  }, 60_000); // 60s timeout for CLI response
});
