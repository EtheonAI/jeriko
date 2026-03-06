/**
 * Error handling audit test suite.
 *
 * Verifies that critical error handling mechanisms exist and function correctly:
 * - Process-level exception/rejection handlers (daemon mode)
 * - Logger importability and functionality
 * - JSON.parse protection in critical paths
 * - Config loading resilience
 * - Key-value store resilience
 */

import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// 1. Logger tests
// ---------------------------------------------------------------------------

describe("Logger", () => {
  test("getLogger is importable and returns a Logger instance", async () => {
    const { getLogger, Logger } = await import("../../src/shared/logger.js");
    expect(getLogger).toBeFunction();
    const log = getLogger();
    expect(log).toBeInstanceOf(Logger);
  });

  test("Logger has all required methods", async () => {
    const { Logger } = await import("../../src/shared/logger.js");
    const tmpDir = mkdtempSync(join(tmpdir(), "jeriko-log-test-"));
    const logPath = join(tmpDir, "test.log");

    try {
      const log = new Logger({ filePath: logPath, level: "debug" });
      expect(log.debug).toBeFunction();
      expect(log.info).toBeFunction();
      expect(log.warn).toBeFunction();
      expect(log.error).toBeFunction();
      expect(log.audit).toBeFunction();
      expect(log.close).toBeFunction();

      // Should not throw
      log.debug("test debug");
      log.info("test info");
      log.warn("test warn");
      log.error("test error");
      log.audit("test audit");
      log.close();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("Logger writes structured JSONL entries", async () => {
    const { Logger } = await import("../../src/shared/logger.js");
    const { readFileSync } = await import("node:fs");
    const tmpDir = mkdtempSync(join(tmpdir(), "jeriko-log-test-"));
    const logPath = join(tmpDir, "test.log");

    try {
      const log = new Logger({ filePath: logPath, level: "debug" });
      log.info("test message", { extra: "data" });
      log.close();

      const content = readFileSync(logPath, "utf-8").trim();
      const entry = JSON.parse(content);
      expect(entry.level).toBe("info");
      expect(entry.message).toBe("test message");
      expect(entry.extra).toBe("data");
      expect(entry.ts).toBeTruthy();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("Logger survives write to non-existent directory (creates it)", async () => {
    const { Logger } = await import("../../src/shared/logger.js");
    const tmpDir = mkdtempSync(join(tmpdir(), "jeriko-log-test-"));
    const logPath = join(tmpDir, "deep", "nested", "test.log");

    try {
      const log = new Logger({ filePath: logPath });
      // Should not throw
      log.info("test");
      log.close();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Process handler existence tests (static analysis)
// ---------------------------------------------------------------------------

describe("Process error handlers", () => {
  test("kernel.ts contains uncaughtException handler", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/kernel.ts"),
      "utf-8",
    );
    expect(src).toContain('process.on("uncaughtException"');
  });

  test("kernel.ts contains unhandledRejection handler", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/kernel.ts"),
      "utf-8",
    );
    expect(src).toContain('process.on("unhandledRejection"');
  });

  test("uncaughtException handler logs error with stack trace", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/kernel.ts"),
      "utf-8",
    );
    // The handler should log using log.error and include stack
    expect(src).toMatch(/uncaughtException.*\n.*log\.error.*err\.message.*stack/s);
  });

  test("unhandledRejection handler does NOT crash the process", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/kernel.ts"),
      "utf-8",
    );
    // Should log but NOT call handler() which triggers shutdown
    const rejectionBlock = src.slice(
      src.indexOf('process.on("unhandledRejection"'),
    );
    const blockEnd = rejectionBlock.indexOf("});");
    const block = rejectionBlock.slice(0, blockEnd);
    // Should contain log.error but NOT handler() or process.exit
    expect(block).toContain("log.error");
    expect(block).not.toContain("process.exit");
  });
});

// ---------------------------------------------------------------------------
// 3. Hono app global error handler
// ---------------------------------------------------------------------------

describe("HTTP error handling", () => {
  test("app.ts has global onError handler", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/api/app.ts"),
      "utf-8",
    );
    expect(src).toContain("app.onError");
    expect(src).toContain("Internal server error");
  });

  test("app.ts has 404 handler", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/api/app.ts"),
      "utf-8",
    );
    expect(src).toContain("app.notFound");
  });
});

// ---------------------------------------------------------------------------
// 4. Config loading resilience
// ---------------------------------------------------------------------------

describe("Config loading", () => {
  test("loadConfig returns valid defaults when no config file exists", async () => {
    const { loadConfig } = await import("../../src/shared/config.js");
    // loadConfig should not throw even without a config file
    const config = loadConfig();
    expect(config).toBeTruthy();
    expect(config.agent).toBeTruthy();
    expect(config.agent.model).toBeTruthy();
    expect(config.logging).toBeTruthy();
    expect(config.security).toBeTruthy();
  });

  test("mergeFromFile silently handles malformed JSON", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/shared/config.ts"),
      "utf-8",
    );
    // mergeFromFile must have try-catch
    expect(src).toMatch(/function mergeFromFile[\s\S]*?try[\s\S]*?JSON\.parse[\s\S]*?catch/);
  });
});

// ---------------------------------------------------------------------------
// 5. parseArgs resilience
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  test("parseArgs handles empty args", async () => {
    const { parseArgs } = await import("../../src/shared/args.js");
    const result = parseArgs([]);
    expect(result).toBeTruthy();
    expect(result.flags).toBeTruthy();
    expect(result.positional).toBeArray();
  });

  test("parseArgs handles malformed flags gracefully", async () => {
    const { parseArgs } = await import("../../src/shared/args.js");
    // Should not throw
    const result = parseArgs(["--", "positional"]);
    expect(result).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 6. JSON.parse protection in streaming drivers
// ---------------------------------------------------------------------------

describe("Streaming driver JSON.parse protection", () => {
  test("openai-stream.ts protects JSON.parse with try-catch", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/agent/drivers/openai-stream.ts"),
      "utf-8",
    );
    // JSON.parse should be inside a try block
    const parseIndex = src.indexOf("JSON.parse(data)");
    const beforeParse = src.slice(Math.max(0, parseIndex - 100), parseIndex);
    expect(beforeParse).toContain("try");
  });

  test("anthropic-stream.ts protects JSON.parse with try-catch", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/agent/drivers/anthropic-stream.ts"),
      "utf-8",
    );
    const parseIndex = src.indexOf("JSON.parse(data)");
    const beforeParse = src.slice(Math.max(0, parseIndex - 100), parseIndex);
    expect(beforeParse).toContain("try");
  });

  test("claude-code.ts protects JSON.parse with try-catch", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/agent/drivers/claude-code.ts"),
      "utf-8",
    );
    const parseIndex = src.indexOf("JSON.parse(trimmed)");
    const beforeParse = src.slice(Math.max(0, parseIndex - 100), parseIndex);
    expect(beforeParse).toContain("try");
  });
});

// ---------------------------------------------------------------------------
// 7. Bus error boundaries
// ---------------------------------------------------------------------------

describe("Bus error boundaries", () => {
  test("Bus.emit catches handler errors and does not break emit loop", async () => {
    const { Bus } = await import("../../src/shared/bus.js");

    const bus = new Bus<{ test: string }>();
    const results: string[] = [];

    // First handler throws
    bus.on("test", () => {
      throw new Error("Handler 1 failed");
    });

    // Second handler should still run
    bus.on("test", (data) => {
      results.push(data);
    });

    // Suppress console.error from Bus
    const origError = console.error;
    console.error = () => {};
    try {
      // emit should not throw
      bus.emit("test", "hello");
      expect(results).toEqual(["hello"]);
    } finally {
      console.error = origError;
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Agent loop error handling (static analysis)
// ---------------------------------------------------------------------------

describe("Agent loop error handling", () => {
  test("agent.ts catches LLM streaming errors", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/agent/agent.ts"),
      "utf-8",
    );
    // The for-await loop over driver.chat() must be in a try-catch
    expect(src).toMatch(/for await.*driver\.chat[\s\S]*?catch.*err/);
  });

  test("agent.ts catches tool execution errors", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/agent/agent.ts"),
      "utf-8",
    );
    // tool.execute() must be in a try-catch
    expect(src).toMatch(/tool\.execute[\s\S]*?catch.*err/);
  });

  test("agent.ts has finally block for context cleanup", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/agent/agent.ts"),
      "utf-8",
    );
    expect(src).toContain("clearActiveContext()");
    expect(src).toMatch(/finally\s*\{[\s\S]*?clearActiveContext/);
  });
});

// ---------------------------------------------------------------------------
// 9. IPC socket error handling
// ---------------------------------------------------------------------------

describe("IPC socket error handling", () => {
  test("socket.ts handleMessage protects JSON.parse", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/api/socket.ts"),
      "utf-8",
    );
    // handleMessage should have try-catch around JSON.parse
    const fnIndex = src.indexOf("async function handleMessage");
    const fnBody = src.slice(fnIndex, fnIndex + 500);
    expect(fnBody).toMatch(/try[\s\S]*?JSON\.parse.*as IpcRequest/);
  });

  test("socket.ts stream handler catches errors", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/api/socket.ts"),
      "utf-8",
    );
    // Stream handler should catch errors from the handler function
    expect(src).toMatch(/streamHandler\([\s\S]*?catch.*err/);
  });
});

// ---------------------------------------------------------------------------
// 10. Relay client error handling
// ---------------------------------------------------------------------------

describe("Relay client error handling", () => {
  test("relay client protects JSON.parse on incoming messages", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/services/relay/client.ts"),
      "utf-8",
    );
    // The private handleMessage method should have try-catch around JSON.parse
    const fnIndex = src.indexOf("private handleMessage(event: MessageEvent)");
    expect(fnIndex).toBeGreaterThan(-1);
    const fnBody = src.slice(fnIndex, fnIndex + 400);
    expect(fnBody).toMatch(/try[\s\S]*?JSON\.parse/);
  });

  test("relay client webhook handler has .catch()", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/services/relay/client.ts"),
      "utf-8",
    );
    expect(src).toMatch(/webhookHandler[\s\S]*?\.catch/);
  });

  test("relay client has exponential backoff reconnection", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/services/relay/client.ts"),
      "utf-8",
    );
    expect(src).toContain("RELAY_BACKOFF_MULTIPLIER");
    expect(src).toContain("RELAY_MAX_BACKOFF_MS");
    expect(src).toContain("scheduleReconnect");
  });
});

// ---------------------------------------------------------------------------
// 11. Database error handling
// ---------------------------------------------------------------------------

describe("Database error handling", () => {
  test("initDatabase creates directory if missing", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/storage/db.ts"),
      "utf-8",
    );
    expect(src).toContain("mkdirSync(dir, { recursive: true })");
  });

  test("kv.ts kvGet uses safe JSON.parse (via safeParseKV)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/storage/kv.ts"),
      "utf-8",
    );
    // Verify kvGet uses safeParseKV instead of raw JSON.parse
    expect(src).toContain("safeParseKV");
    // The safeParseKV function should have a try-catch
    const safeParseBlock = src.slice(src.indexOf("function safeParseKV"));
    expect(safeParseBlock).toContain("try");
    expect(safeParseBlock).toContain("catch");
  });
});

// ---------------------------------------------------------------------------
// 12. Output contract
// ---------------------------------------------------------------------------

describe("Output contract", () => {
  test("okResult produces {ok:true, data}", async () => {
    const { okResult } = await import("../../src/shared/output.js");
    const result = okResult({ test: 1 });
    expect(result).toEqual({ ok: true, data: { test: 1 } });
  });

  test("failResult produces {ok:false, error, code}", async () => {
    const { failResult } = await import("../../src/shared/output.js");
    const result = failResult("something broke", 1);
    expect(result).toEqual({ ok: false, error: "something broke", code: 1 });
  });

  test("EXIT codes are defined", async () => {
    const { EXIT } = await import("../../src/shared/output.js");
    expect(EXIT.OK).toBe(0);
    expect(EXIT.GENERAL).toBe(1);
    expect(EXIT.NETWORK).toBe(2);
    expect(EXIT.AUTH).toBe(3);
    expect(EXIT.NOT_FOUND).toBe(5);
    expect(EXIT.TIMEOUT).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 13. Webhook route error handling
// ---------------------------------------------------------------------------

describe("Webhook route error handling", () => {
  test("webhook route protects JSON.parse on body", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/api/routes/webhook.ts"),
      "utf-8",
    );
    expect(src).toMatch(/try[\s\S]*?JSON\.parse\(rawBody\)[\s\S]*?catch/);
  });

  test("webhook route catches handler errors", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/api/routes/webhook.ts"),
      "utf-8",
    );
    expect(src).toMatch(/try[\s\S]*?triggers\.handleWebhook[\s\S]*?catch/);
  });
});

// ---------------------------------------------------------------------------
// 14. Billing webhook JSON.parse protection
// ---------------------------------------------------------------------------

describe("Billing webhook", () => {
  test("billing webhook protects JSON.parse", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/billing/webhook.ts"),
      "utf-8",
    );
    expect(src).toMatch(/try[\s\S]*?JSON\.parse\(rawBody\)[\s\S]*?catch/);
  });
});

// ---------------------------------------------------------------------------
// 15. Trigger store uses safeParse
// ---------------------------------------------------------------------------

describe("Trigger store", () => {
  test("trigger store has safeParse wrapper for JSON.parse", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      join(import.meta.dir, "../../src/daemon/services/triggers/store.ts"),
      "utf-8",
    );
    expect(src).toContain("function safeParse");
    expect(src).toMatch(/function safeParse[\s\S]*?try[\s\S]*?JSON\.parse[\s\S]*?catch/);
  });
});
