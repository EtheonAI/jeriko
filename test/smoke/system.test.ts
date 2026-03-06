// Smoke tests — fast sanity checks for critical system paths.
//
// Run: bun run test:smoke
// Purpose: Quick validation (<10s) that core subsystems import and function.
// When: On every push, before full test suite, after deploys.
//
// Rules:
// - No side effects (no stdout, no DB writes to disk, no network)
// - Only test that modules import and pure functions return correct shapes
// - Each test must complete in <1s

import { describe, test, expect, afterAll } from "bun:test";

// ---------------------------------------------------------------------------
// 1. Shared — config, output, types
// ---------------------------------------------------------------------------
describe("smoke: shared", () => {
  test("loadConfig returns object", async () => {
    const { loadConfig } = await import("../../src/shared/config.js");
    const config = loadConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  test("EXIT codes are numbers", async () => {
    const { EXIT } = await import("../../src/shared/output.js");
    expect(EXIT.OK).toBe(0);
    expect(EXIT.GENERAL).toBe(1);
    expect(EXIT.NETWORK).toBe(2);
    expect(EXIT.AUTH).toBe(3);
  });

  test("connector defs export", async () => {
    const { CONNECTOR_DEFS } = await import("../../src/shared/connector.js");
    expect(CONNECTOR_DEFS.length).toBeGreaterThan(0);
  });

  test("relay-protocol exports constants", async () => {
    const proto = await import("../../src/shared/relay-protocol.js");
    expect(proto.DEFAULT_RELAY_URL).toBeDefined();
    expect(proto.RELAY_HEARTBEAT_INTERVAL_MS).toBeGreaterThan(0);
  });

  test("url builders are functions", async () => {
    const { buildWebhookUrl } = await import("../../src/shared/urls.js");
    expect(typeof buildWebhookUrl).toBe("function");
  });

  test("skill-loader exports", async () => {
    const { listSkills, loadSkill } = await import("../../src/shared/skill-loader.js");
    expect(typeof listSkills).toBe("function");
    expect(typeof loadSkill).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 2. Security — escape utilities
// ---------------------------------------------------------------------------
describe("smoke: security", () => {
  test("escapeAppleScript escapes quotes", async () => {
    const { escapeAppleScript } = await import("../../src/shared/escape.js");
    const result = escapeAppleScript('test"injection');
    // Should escape the double quote (backslash-escaped)
    expect(result).toContain('\\"');
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 3. Database — in-memory init + close
// ---------------------------------------------------------------------------
describe("smoke: database", () => {
  test("in-memory DB initializes and closes", async () => {
    const { initDatabase, closeDatabase } = await import("../../src/daemon/storage/db.js");
    const db = initDatabase(":memory:");
    expect(db).toBeDefined();
    closeDatabase();
  });
});

// ---------------------------------------------------------------------------
// 4. Billing — tier config resolves
// ---------------------------------------------------------------------------
describe("smoke: billing", () => {
  test("tier limits resolve for free and pro", async () => {
    const { TIER_LIMITS, isBillingTier } = await import("../../src/daemon/billing/config.js");
    expect(TIER_LIMITS.free).toBeDefined();
    expect(TIER_LIMITS.pro).toBeDefined();
    expect(isBillingTier("free")).toBe(true);
    expect(isBillingTier("invalid")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Agent — tool registry exports
// ---------------------------------------------------------------------------
describe("smoke: agent", () => {
  test("tool registry loads", async () => {
    const { registerTool, listTools, clearTools } = await import("../../src/daemon/agent/tools/registry.js");
    expect(typeof registerTool).toBe("function");
    expect(typeof listTools).toBe("function");
    expect(typeof clearTools).toBe("function");
  });
});
