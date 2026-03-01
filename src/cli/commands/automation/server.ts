import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const JERIKO_DIR = join(homedir(), ".jeriko");

/** Ensure ~/.jeriko and ~/.jeriko/data exist on first run. */
function ensureDirs(): void {
  mkdirSync(join(JERIKO_DIR, "data"), { recursive: true });
}
const PID_FILE = join(JERIKO_DIR, "daemon.pid");
const SOCKET_PATH = join(JERIKO_DIR, "daemon.sock");
const LOG_FILE = join(JERIKO_DIR, "data", "daemon.log");

export const command: CommandHandler = {
  name: "server",
  description: "Daemon lifecycle (start, stop, restart, status)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko server <action> [options]");
      console.log("\nActions:");
      console.log("  start             Start the daemon");
      console.log("  stop              Stop the daemon");
      console.log("  restart           Restart the daemon");
      console.log("  status            Show daemon status");
      console.log("  logs              Tail daemon logs");
      console.log("\nFlags:");
      console.log("  --port <n>        HTTP port (default: 3000)");
      console.log("  --foreground      Run in foreground (don't daemonize)");
      console.log("  --log-level <l>   Log level (debug|info|warn|error)");
      process.exit(0);
    }

    const action = parsed.positional[0] ?? "status";

    switch (action) {
      case "start": {
        if (isDaemonRunning()) {
          const pid = readPid();
          ok({ status: "already_running", pid });
          return;
        }

        const port = flagStr(parsed, "port", "3000");
        const foreground = flagBool(parsed, "foreground");
        const logLevel = flagStr(parsed, "log-level", "info");

        ensureDirs();

        if (foreground) {
          // Run in foreground — blocks until signal
          writeFileSync(PID_FILE, String(process.pid));
          const { boot, onShutdown } = await import("../../../daemon/kernel.js");
          // Register PID cleanup with kernel so it runs during graceful shutdown
          // before process.exit(). This avoids race conditions with competing signal handlers.
          onShutdown(() => cleanupPidFile());
          await boot({ port: parseInt(port, 10) });
          // Keep process alive; kernel signal handlers perform graceful shutdown.
          await new Promise<void>(() => {});
          return;
        }

        // Daemonize using node:child_process.spawn with detached + unref.
        // Bun.spawn detached:true does not survive parent exit on macOS.
        //
        // In compiled Bun binaries:
        //   process.execPath = "/path/to/jeriko"  (the binary itself)
        //   process.argv[0]  = "bun"              (NOT the binary — internal Bun runtime name)
        //   process.argv[1]  = "/$bunfs/root/..."  (internal VFS path)
        // In dev mode (bun run src/index.ts):
        //   process.execPath = "/path/to/.bun/bin/bun"
        //   process.argv[1]  = "src/index.ts"
        //
        // So: always use process.execPath as the binary. For dev mode, pass the
        // script as first arg. For compiled, execPath IS the binary.
        cleanupPidFile();

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
          env: { ...process.env, JERIKO_PORT: port, LOG_LEVEL: logLevel },
        });
        child.unref();
        fsClose(logFd);

        const daemonPid = await waitForDaemonPid(5000);
        if (daemonPid) {
          ok({ status: "started", pid: daemonPid, port: parseInt(port, 10) });
        } else {
          fail("Failed to start daemon — check logs: jeriko server logs");
        }
        break;
      }
      case "stop": {
        if (!isDaemonRunning()) {
          ok({ status: "not_running" });
          return;
        }

        const pid = readPid();
        if (pid) {
          try {
            process.kill(pid);
            cleanupPidFile();
            ok({ status: "stopped", pid });
          } catch (err: unknown) {
            cleanupPidFile();
            const msg = err instanceof Error ? err.message : String(err);
            fail(`Failed to stop daemon (PID ${pid}): ${msg}`);
          }
        } else {
          cleanupPidFile();
          ok({ status: "not_running" });
        }
        break;
      }
      case "restart": {
        // Stop then start
        if (isDaemonRunning()) {
          const pid = readPid();
          if (pid) {
            try { process.kill(pid); } catch { /* ignore */ }
            cleanupPidFile();
          }
        }

        // Brief delay for cleanup
        await new Promise((r) => setTimeout(r, 500));

        // Re-invoke start
        await command.run(["start", ...args.slice(1)]);
        break;
      }
      case "status": {
        const running = isDaemonRunning();
        const pid = readPid();
        const socketExists = existsSync(SOCKET_PATH);

        ok({
          status: running ? "running" : "stopped",
          pid: running ? pid : null,
          socket: socketExists,
          pid_file: existsSync(PID_FILE),
        });
        break;
      }
      case "logs": {
        if (!existsSync(LOG_FILE)) {
          ok({ message: "No daemon log found" });
          return;
        }
        const content = readFileSync(LOG_FILE, "utf-8");
        const lines = content.trim().split("\n").slice(-50);
        ok({ lines, count: lines.length });
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use start, stop, restart, status, or logs.`);
    }
  },
};

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isDaemonRunning(): boolean {
  const pid = readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0); // Signal 0 = check existence
    return true;
  } catch {
    cleanupPidFile();
    return false;
  }
}

function cleanupPidFile(): void {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
  } catch { /* ignore */ }
}

async function waitForDaemonPid(timeoutMs: number): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pid = readPid();
    if (pid) return pid;
    await Bun.sleep(50);
  }
  return null;
}
