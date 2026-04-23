// spawn-safe tests — use real POSIX binaries to verify outcome branches.

import { describe, it, expect } from "bun:test";
import { safeSpawn, safeSpawnSuccess } from "../../../src/shared/spawn-safe.js";

describe("safeSpawn", () => {
  it("returns status=exited with code 0 and stdout on success", async () => {
    const out = await safeSpawn({
      command: "/bin/sh",
      args: ["-c", "echo hello"],
      timeoutMs: 5000,
    });
    expect(out.status).toBe("exited");
    if (out.status === "exited") {
      expect(out.code).toBe(0);
      expect(out.stdout.trim()).toBe("hello");
    }
  });

  it("captures stderr separately from stdout", async () => {
    const out = await safeSpawn({
      command: "/bin/sh",
      args: ["-c", "echo ok; echo nope 1>&2"],
      timeoutMs: 5000,
    });
    if (out.status !== "exited") throw new Error("expected exited");
    expect(out.stdout.trim()).toBe("ok");
    expect(out.stderr.trim()).toBe("nope");
  });

  it("returns status=exited with non-zero code on failure", async () => {
    const out = await safeSpawn({
      command: "/bin/sh",
      args: ["-c", "exit 7"],
      timeoutMs: 5000,
    });
    expect(out.status).toBe("exited");
    if (out.status === "exited") expect(out.code).toBe(7);
  });

  it("returns status=timeout after the configured ms", async () => {
    const start = Date.now();
    const out = await safeSpawn({
      command: "/bin/sh",
      args: ["-c", "sleep 5"],
      timeoutMs: 150,
      gracefulKillDelayMs: 50,
    });
    const elapsed = Date.now() - start;
    expect(out.status).toBe("timeout");
    expect(elapsed).toBeLessThan(1500);
  });

  it("returns status=error when the command does not exist", async () => {
    const out = await safeSpawn({
      command: "/this/really/does/not/exist-" + Math.random(),
      timeoutMs: 2000,
    });
    expect(out.status).toBe("error");
  });

  it("honors an externally provided abort signal", async () => {
    const controller = new AbortController();
    const promise = safeSpawn({
      command: "/bin/sh",
      args: ["-c", "sleep 5"],
      timeoutMs: 10_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    const out = await promise;
    expect(out.status).toBe("aborted");
  });

  it("feeds stdin to the child and reads stdout", async () => {
    const out = await safeSpawn({
      command: "/usr/bin/env",
      args: ["cat"],
      stdin: "piped-input",
      timeoutMs: 5000,
    });
    if (out.status !== "exited") throw new Error("expected exited");
    expect(out.stdout).toBe("piped-input");
  });

  it("truncates excessive stdout at the configured limit", async () => {
    const out = await safeSpawn({
      command: "/bin/sh",
      args: ["-c", "yes x | head -c 5000"],
      stdoutLimit: 256,
      timeoutMs: 5000,
    });
    if (out.status !== "exited") throw new Error("expected exited");
    expect(out.stdout.length).toBe(256);
    expect(out.stdoutTruncated).toBe(true);
  });
});

describe("safeSpawnSuccess", () => {
  it("resolves on exit code 0", async () => {
    const result = await safeSpawnSuccess({
      command: "/bin/sh",
      args: ["-c", "echo ok"],
      timeoutMs: 5000,
    });
    expect(result.stdout.trim()).toBe("ok");
  });

  it("throws on non-zero exit", async () => {
    await expect(
      safeSpawnSuccess({
        command: "/bin/sh",
        args: ["-c", "echo bad 1>&2; exit 2"],
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/exited with code 2/);
  });

  it("throws on timeout", async () => {
    await expect(
      safeSpawnSuccess({
        command: "/bin/sh",
        args: ["-c", "sleep 5"],
        timeoutMs: 100,
        gracefulKillDelayMs: 50,
      }),
    ).rejects.toThrow(/timed out/);
  });
});
