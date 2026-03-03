// Install user ID tests — setupUserId() generation and idempotency.
//
// Note: CONFIG_DIR is a module-level constant evaluated at import time,
// so file-based tests use the real config directory. We test the logic
// through process.env which is the runtime interface.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { setupUserId } from "../../src/cli/commands/automation/install-utils.js";

describe("setupUserId", () => {
  let savedUserId: string | undefined;

  beforeEach(() => {
    savedUserId = process.env.JERIKO_USER_ID;
    delete process.env.JERIKO_USER_ID;
  });

  afterEach(() => {
    if (savedUserId !== undefined) {
      process.env.JERIKO_USER_ID = savedUserId;
    } else {
      delete process.env.JERIKO_USER_ID;
    }
  });

  it("generates a valid UUID when no user ID exists", () => {
    // Clear any existing value
    delete process.env.JERIKO_USER_ID;
    setupUserId();

    const userId = process.env.JERIKO_USER_ID;
    expect(userId).toBeDefined();
    expect(userId!.length).toBe(36);

    // Verify UUID format: 8-4-4-4-12 hex chars
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(uuidRegex.test(userId!)).toBe(true);
  });

  it("preserves existing user ID from env", () => {
    process.env.JERIKO_USER_ID = "already-set-id";
    setupUserId();
    expect(process.env.JERIKO_USER_ID).toBe("already-set-id");
  });

  it("is idempotent — returns same ID on repeated calls", () => {
    setupUserId();
    const id1 = process.env.JERIKO_USER_ID;

    // Clear env but the .env file still has the ID
    delete process.env.JERIKO_USER_ID;
    setupUserId();
    const id2 = process.env.JERIKO_USER_ID;

    // Should return the same ID (persisted to .env file)
    expect(id1).toBe(id2);
  });
});
