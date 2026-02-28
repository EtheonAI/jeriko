import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

export const command: CommandHandler = {
  name: "dev",
  description: "Dev server management (start, stop, status)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko dev <action> [options]");
      console.log("\nActions:");
      console.log("  start             Start dev server (detects framework)");
      console.log("  stop              Stop dev server");
      console.log("  status            Show running dev servers");
      console.log("  logs              Show debug logs (console, network, UI events)");
      console.log("  logs --clear      Clear debug logs");
      console.log("\nFlags:");
      console.log("  --port <n>        Port number (default: 3000)");
      console.log("  --dir <path>      Project directory (default: .)");
      console.log("  --cmd <command>   Custom start command");
      console.log("  --errors          Show only errors (with logs)");
      console.log("  --network         Show only network requests (with logs)");
      console.log("  --ui              Show only UI events (with logs)");
      process.exit(0);
    }

    const action = parsed.positional[0] ?? "status";
    const dir = resolve(flagStr(parsed, "dir", "."));
    const port = flagStr(parsed, "port", "3000");

    switch (action) {
      case "start": {
        const customCmd = flagStr(parsed, "cmd", "");
        const startCmd = customCmd || detectDevCommand(dir);

        if (!startCmd) {
          fail("Cannot detect project type. Use --cmd to specify the start command.");
        }

        // Start in background
        const child = spawn(startCmd, [], {
          cwd: dir,
          shell: true,
          detached: true,
          stdio: "ignore",
          env: { ...process.env, PORT: port },
        });
        child.unref();

        ok({
          action: "start",
          command: startCmd,
          port: parseInt(port, 10),
          pid: child.pid,
          directory: dir,
        });
        break;
      }
      case "stop": {
        try {
          const output = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
          if (output) {
            const pids = output.split("\n");
            for (const pid of pids) {
              process.kill(parseInt(pid, 10));
            }
            ok({ action: "stop", port: parseInt(port, 10), killed: pids.map(Number) });
          } else {
            ok({ action: "stop", message: `No process on port ${port}` });
          }
        } catch {
          ok({ action: "stop", message: `No process on port ${port}` });
        }
        break;
      }
      case "status": {
        try {
          const output = execSync(`lsof -i :${port} -P -n | head -20`, { encoding: "utf-8" });
          ok({ action: "status", port: parseInt(port, 10), output: output.trim() });
        } catch {
          ok({ action: "status", port: parseInt(port, 10), running: false });
        }
        break;
      }
      case "logs": {
        const clear = flagBool(parsed, "clear");
        const errorsOnly = flagBool(parsed, "errors");
        const networkOnly = flagBool(parsed, "network");
        const uiOnly = flagBool(parsed, "ui");

        const logsFile = "/tmp/jeriko-debug-logs.json";

        if (clear) {
          try {
            const { unlinkSync } = await import("node:fs");
            if (existsSync(logsFile)) unlinkSync(logsFile);
            ok({ action: "logs-clear", message: "Debug logs cleared" });
          } catch (e: any) {
            fail(`Failed to clear logs: ${e.message}`);
          }
          break;
        }

        // Try reading from dev server first (live), fall back to file
        let logs: any = null;

        try {
          const res = await fetch(`http://localhost:${port}/__jeriko__/logs`);
          if (res.ok) logs = await res.json();
        } catch {
          // Dev server not running or no debug plugin — try file
        }

        if (!logs && existsSync(logsFile)) {
          try {
            logs = JSON.parse(readFileSync(logsFile, "utf-8"));
          } catch { /* corrupt */ }
        }

        if (!logs) {
          ok({
            action: "logs",
            message: "No debug logs found. Start a dev server with the jeriko debug plugin enabled.",
            consoleLogs: [],
            networkRequests: [],
            uiEvents: [],
          });
          break;
        }

        // Filter by category if requested
        const result: any = { action: "logs", lastUpdated: logs.lastUpdated };

        if (errorsOnly) {
          result.consoleLogs = (logs.consoleLogs ?? []).filter((l: any) => l.level === "ERROR" || l.level === "WARN");
          result.networkRequests = (logs.networkRequests ?? []).filter((r: any) => r.response?.status >= 400 || r.error);
        } else if (networkOnly) {
          result.networkRequests = logs.networkRequests ?? [];
        } else if (uiOnly) {
          result.uiEvents = logs.uiEvents ?? [];
        } else {
          result.consoleLogs = logs.consoleLogs ?? [];
          result.networkRequests = logs.networkRequests ?? [];
          result.uiEvents = logs.uiEvents ?? [];
        }

        ok(result);
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use start, stop, status, or logs.`);
    }
  },
};

/** Detect the right dev command based on project files. */
function detectDevCommand(dir: string): string | null {
  // Check package.json for scripts.dev
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts?.dev) return "npm run dev";
      if (pkg.scripts?.start) return "npm start";
    } catch { /* ignore */ }
  }

  // Python
  if (existsSync(join(dir, "manage.py"))) return "python manage.py runserver";
  if (existsSync(join(dir, "app.py"))) return "python app.py";

  // Go
  if (existsSync(join(dir, "main.go"))) return "go run .";

  // Rust
  if (existsSync(join(dir, "Cargo.toml"))) return "cargo run";

  return null;
}
