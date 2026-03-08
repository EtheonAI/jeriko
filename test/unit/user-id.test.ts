// User ID system tests — generation, persistence, and retrieval.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { getUserId } from "../../src/shared/config.js";

describe("getUserId", () => {
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

  it("returns undefined when JERIKO_USER_ID is not set", () => {
    delete process.env.JERIKO_USER_ID;
    expect(getUserId()).toBeUndefined();
  });

  it("returns undefined when JERIKO_USER_ID is empty string", () => {
    process.env.JERIKO_USER_ID = "";
    expect(getUserId()).toBeUndefined();
  });

  it("returns the user ID when set to a valid hex string", () => {
    const hexId = "abcdef0123456789abcdef0123456789";
    process.env.JERIKO_USER_ID = hexId;
    expect(getUserId()).toBe(hexId);
  });

  it("returns undefined for non-hex/non-UUID format", () => {
    process.env.JERIKO_USER_ID = "test-user-id-123";
    expect(getUserId()).toBeUndefined();
  });

  it("returns a UUID-format string when set to UUID", () => {
    const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    process.env.JERIKO_USER_ID = uuid;
    expect(getUserId()).toBe(uuid);
    expect(getUserId()!.length).toBe(36);
  });
});
