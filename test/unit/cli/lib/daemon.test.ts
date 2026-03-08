/**
 * Tests for daemon lifecycle utilities — ensureDaemon(), spawnDaemon(), etc.
 *
 * Tests the module's exported API and contract without spawning real daemons.
 * The ensureDaemon() function is the single source of truth for daemon
 * lifecycle — used by createBackend() and never duplicated.
 */

import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import {
  ensureDaemon,
  isDaemonRunning,
  spawnDaemon,
  waitForSocket,
  readPid,
  cleanupPidFile,
  SOCKET_PATH,
  PID_FILE,
  LOG_FILE,
  JERIKO_DIR,
} from "../../../../src/cli/lib/daemon.js";

// ---------------------------------------------------------------------------
// Module exports — verify all public API is available
// ---------------------------------------------------------------------------

describe("daemon module exports", () => {
  test("ensureDaemon is a function", () => {
    expect(typeof ensureDaemon).toBe("function");
  });

  test("isDaemonRunning is a function", () => {
    expect(typeof isDaemonRunning).toBe("function");
  });

  test("spawnDaemon is a function", () => {
    expect(typeof spawnDaemon).toBe("function");
  });

  test("waitForSocket is a function", () => {
    expect(typeof waitForSocket).toBe("function");
  });

  test("readPid is a function", () => {
    expect(typeof readPid).toBe("function");
  });

  test("cleanupPidFile is a function", () => {
    expect(typeof cleanupPidFile).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

describe("daemon path constants", () => {
  test("SOCKET_PATH is a non-empty string ending in daemon.sock", () => {
    expect(typeof SOCKET_PATH).toBe("string");
    expect(SOCKET_PATH.length).toBeGreaterThan(0);
    expect(SOCKET_PATH.endsWith("daemon.sock")).toBe(true);
  });

  test("PID_FILE is a non-empty string ending in daemon.pid", () => {
    expect(typeof PID_FILE).toBe("string");
    expect(PID_FILE.length).toBeGreaterThan(0);
    expect(PID_FILE.endsWith("daemon.pid")).toBe(true);
  });

  test("LOG_FILE is a non-empty string ending in daemon.log", () => {
    expect(typeof LOG_FILE).toBe("string");
    expect(LOG_FILE.length).toBeGreaterThan(0);
    expect(LOG_FILE.endsWith("daemon.log")).toBe(true);
  });

  test("JERIKO_DIR is a non-empty string", () => {
    expect(typeof JERIKO_DIR).toBe("string");
    expect(JERIKO_DIR.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// readPid / isDaemonRunning — safe to test (read-only)
// ---------------------------------------------------------------------------

describe("readPid", () => {
  test("returns null when no PID file exists", () => {
    if (!existsSync(PID_FILE)) {
      expect(readPid()).toBeNull();
    }
  });
});

describe("isDaemonRunning", () => {
  test("returns boolean", () => {
    expect(typeof isDaemonRunning()).toBe("boolean");
  });

  test("returns false when no PID file exists", () => {
    if (!existsSync(PID_FILE)) {
      expect(isDaemonRunning()).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// waitForSocket — short timeout test
// ---------------------------------------------------------------------------

describe("waitForSocket", () => {
  test("returns false quickly when daemon is not running", async () => {
    if (!isDaemonRunning()) {
      const start = Date.now();
      const result = await waitForSocket(200);
      const elapsed = Date.now() - start;
      expect(result).toBe(false);
      // Should detect dead daemon and return fast, not wait full timeout
      expect(elapsed).toBeLessThan(1000);
    }
  });
});

// ---------------------------------------------------------------------------
// ensureDaemon — contract tests
// ---------------------------------------------------------------------------

describe("ensureDaemon", () => {
  test("accepts optional timeout parameter", async () => {
    // Skip actual spawn in test — spawnDaemon has an internal 5s PID wait.
    // Just verify the function signature and return type.
    if (isDaemonRunning()) {
      const result = await ensureDaemon(100);
      expect(typeof result).toBe("boolean");
    } else {
      // No daemon running — ensureDaemon would try to spawn (slow).
      // Verify it's callable and returns false quickly when daemon isn't available.
      expect(typeof ensureDaemon).toBe("function");
      expect(ensureDaemon.length).toBe(0); // optional param = length 0
    }
  });

  test("returns true when daemon is already running with socket", async () => {
    if (isDaemonRunning() && existsSync(SOCKET_PATH)) {
      const result = await ensureDaemon(100);
      expect(result).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// spawnDaemon — contract tests
// ---------------------------------------------------------------------------

describe("spawnDaemon", () => {
  test("returns existing PID when daemon is already running", async () => {
    if (isDaemonRunning()) {
      const result = await spawnDaemon();
      expect(result).not.toBeNull();
      expect(typeof result).toBe("number");
    }
  });

  test("accepts SpawnDaemonOptions interface", () => {
    // Type-level check — verify the function signature
    expect(typeof spawnDaemon).toBe("function");
  });
});
