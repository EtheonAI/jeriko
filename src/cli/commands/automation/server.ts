import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  JERIKO_DIR,
  PID_FILE,
  SOCKET_PATH,
  LOG_FILE,
  readPid,
  isDaemonRunning,
  cleanupPidFile,
  spawnDaemon,
} from "../../lib/daemon.js";
import { JERIKO_DEFAULT_PORT } from "../../../shared/config.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

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
      console.log(`  --port <n>        HTTP port (default: ${JERIKO_DEFAULT_PORT})`);
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

        const port = flagStr(parsed, "port", String(JERIKO_DEFAULT_PORT));
        const foreground = flagBool(parsed, "foreground");
        const logLevel = flagStr(parsed, "log-level", "info");

        mkdirSync(join(JERIKO_DIR, "data"), { recursive: true });

        if (foreground) {
          writeFileSync(PID_FILE, String(process.pid));
          const { boot, onShutdown } = await import("../../../daemon/kernel.js");
          onShutdown(() => cleanupPidFile());
          await boot({ port: parseInt(port, 10) });
          await new Promise<void>(() => {});
          return;
        }

        const daemonPid = await spawnDaemon({ port, logLevel });
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
        if (isDaemonRunning()) {
          const pid = readPid();
          if (pid) {
            try { process.kill(pid); } catch { /* ignore */ }
            cleanupPidFile();
          }
        }

        await new Promise((r) => setTimeout(r, 500));
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
