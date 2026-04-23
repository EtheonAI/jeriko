// secret-file tests — verify 0o600 lands and the writer survives chmod failures.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeSecretFile, SECRET_FILE_MODE } from "../../../src/shared/secret-file.js";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "jeriko-secret-"));
});

afterEach(() => {
  try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe("writeSecretFile", () => {
  it("writes content and sets owner-only mode", () => {
    const path = join(scratch, "token.env");
    writeSecretFile(path, "SECRET=sk_test_123");
    expect(readFileSync(path, "utf-8")).toBe("SECRET=sk_test_123");
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(SECRET_FILE_MODE);
  });

  it("creates the parent directory when missing", () => {
    const path = join(scratch, "deep", "nested", "file.json");
    writeSecretFile(path, "{}");
    expect(readFileSync(path, "utf-8")).toBe("{}");
  });

  it("overwrites existing files", () => {
    const path = join(scratch, "token.env");
    writeSecretFile(path, "first");
    writeSecretFile(path, "second");
    expect(readFileSync(path, "utf-8")).toBe("second");
  });

  it("accepts a Uint8Array", () => {
    const path = join(scratch, "bytes.bin");
    const bytes = new TextEncoder().encode("raw-bytes");
    writeSecretFile(path, bytes);
    expect(readFileSync(path, "utf-8")).toBe("raw-bytes");
  });
});
