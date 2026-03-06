/**
 * Daemon lifecycle utilities — shared between server.ts, init.ts, and onboarding.ts.
 *
 * Centralizes PID file management, process detection, and background spawning
 * so the daemonize logic isn't duplicated across commands.
 */

import { existsSync, readFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const JERIKO_DIR = join(homedir(), ".jeriko");
const PID_FILE = join(JERIKO_DIR, "daemon.pid");
const SOCKET_PATH = join(JERIKO_DIR, "daemon.sock");
const LOG_FILE = join(JERIKO_DIR, "data", "daemon.log");

export { JERIKO_DIR, PID_FILE, SOCKET_PATH, LOG_FILE };

// ---------------------------------------------------------------------------
// PID management
// ---------------------------------------------------------------------------

export function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function isDaemonRunning(): boolean {
  const pid = readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    cleanupPidFile();
    return false;
  }
}

export function cleanupPidFile(): void {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Spawn daemon in background
// ---------------------------------------------------------------------------

export interface SpawnDaemonOptions {
  port?: string;
  logLevel?: string;
}

/**
 * Spawn the daemon as a detached background process.
 * Returns the PID if the daemon starts within the timeout, null otherwise.
 *
 * Uses `process.execPath` (not `process.argv[0]`) because in compiled Bun
 * binaries argv[0] is "bun" — the internal runtime name, not the binary path.
 */
export async function spawnDaemon(opts: SpawnDaemonOptions = {}): Promise<number | null> {
  if (isDaemonRunning()) {
    return readPid();
  }

  // Clean stale PID file
  cleanupPidFile();

  // Ensure data directory exists
  mkdirSync(join(JERIKO_DIR, "data"), { recursive: true });

  // Detect execution mode:
  //   Compiled binary: argv[1] starts with "/$bunfs/"
  //   Dev mode: argv[1] ends with .ts or .js
  const isBunVFS = process.argv[1]?.startsWith("/$bunfs/");
  const isDevMode = !isBunVFS
    && (process.argv[1]?.endsWith(".ts") || process.argv[1]?.endsWith(".js"));

  const cmd = process.execPath;
  const cmdArgs = isDevMode
    ? [process.argv[1]!, "server", "start", "--foreground"]
    : ["server", "start", "--foreground"];

  const { spawn: nodeSpawn } = await import("node:child_process");
  const { openSync: fsOpen, closeSync: fsClose } = await import("node:fs");
  const logFd = fsOpen(LOG_FILE, "a");

  const child = nodeSpawn(cmd, cmdArgs, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      ...(opts.port ? { JERIKO_PORT: opts.port } : {}),
      ...(opts.logLevel ? { LOG_LEVEL: opts.logLevel } : {}),
    },
  });
  child.unref();
  fsClose(logFd);

  return waitForDaemonPid(5000);
}

/**
 * Poll for the PID file to appear (written by the daemon on boot).
 */
async function waitForDaemonPid(timeoutMs: number): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pid = readPid();
    if (pid) return pid;
    await Bun.sleep(50);
  }
  return null;
}
