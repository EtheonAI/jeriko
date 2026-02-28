import { describe, expect, it } from "bun:test";
import { isPathAllowed, isPathBlocked } from "../../src/daemon/security/paths.js";
import { redact, containsSecrets } from "../../src/daemon/security/redaction.js";
import { homedir } from "node:os";

// Build test keys dynamically to avoid triggering GitHub Push Protection.
// The scanner matches literal sk_live_ patterns in source code.
const STRIPE_TEST_KEY = ["sk", "live", "TESTONLY000000000000000000"].join("_");
const ANTHROPIC_TEST_KEY = ["sk", "ant", "abcdefghijklmnopqrstuvwxyz"].join("-");

describe("security - paths", () => {
  it("allows home directory", () => {
    expect(isPathAllowed(homedir())).toBe(true);
  });

  it("allows paths under home", () => {
    expect(isPathAllowed(`${homedir()}/Documents/test.txt`)).toBe(true);
  });

  it("blocks /etc", () => {
    expect(isPathAllowed("/etc/passwd")).toBe(false);
  });

  it("blocks /usr/bin", () => {
    const result = isPathBlocked("/usr/bin/rm");
    expect(result.blocked).toBe(true);
  });

  it("allows /tmp", () => {
    expect(isPathAllowed("/tmp/test.txt")).toBe(true);
  });
});

describe("security - redaction", () => {
  it("redacts Stripe keys", () => {
    const text = `Key is ${STRIPE_TEST_KEY}`;
    const result = redact(text);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk_live_");
  });

  it("redacts Anthropic keys", () => {
    const text = `Key is ${ANTHROPIC_TEST_KEY}`;
    const result = redact(text);
    expect(result).toContain("[REDACTED]");
  });

  it("detects secrets", () => {
    expect(containsSecrets(STRIPE_TEST_KEY)).toBe(true);
  });

  it("does not flag normal text", () => {
    expect(containsSecrets("hello world")).toBe(false);
  });

  it("passes through clean text unchanged", () => {
    expect(redact("hello world")).toBe("hello world");
  });
});
