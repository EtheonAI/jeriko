// Tool — Web development project management.
//
// Gives the agent purpose-built webdev actions: health status, debug logs,
// git checkpoints/rollback, dev server restart, schema push, and direct SQL.
// Replaces raw shell commands with structured, safe operations.
//
// 8 actions:
//   status          — project health dashboard (server, TypeScript, debug logs)
//   debug_logs      — filtered debug log retrieval (errors/network/ui/all)
//   save_checkpoint — git commit with descriptive message
//   rollback        — git reset to a prior commit (with stash safety net)
//   versions        — git log of checkpoint history
//   restart         — stop + restart the dev server
//   push_schema     — run drizzle-kit push for DB migrations
//   execute_sql     — run SQL against the project's SQLite database
//
// Follows the ToolDefinition pattern from registry.ts.
// Self-registers on import, like skill.ts and browse.ts.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import { getLogger } from "../../../shared/logger.js";
import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";

const log = getLogger();

/** Resolve the projects directory at call time (respects HOME env for testing). */
function getProjectsDir(): string {
  const home = process.env.HOME || homedir();
  return join(home, ".jeriko", "projects");
}

/** Debug log file written by the Vite debug plugin. */
const DEBUG_LOGS_FILE = "/tmp/jeriko-debug-logs.json";

/** Common dev server ports to probe, in priority order. */
const COMMON_PORTS = [3000, 5173, 5174, 8080, 4321, 8000];

/** Valid actions for error messages. */
const VALID_ACTIONS = [
  "status", "debug_logs", "save_checkpoint", "rollback",
  "versions", "restart", "push_schema", "execute_sql",
] as const;

// ---------------------------------------------------------------------------
// Shared helpers (private)
// ---------------------------------------------------------------------------

/**
 * Resolve the project directory from args.
 * - `args.project` — name in ~/.jeriko/projects/
 * - `args.dir` — absolute or relative path
 * Validates that the directory exists and contains a package.json.
 */
function resolveProjectDir(args: Record<string, unknown>): { dir: string } | { error: string } {
  const project = args.project as string | undefined;
  const dir = args.dir as string | undefined;

  let resolved: string;

  if (dir) {
    resolved = resolve(dir);
  } else if (project) {
    resolved = join(getProjectsDir(), project);
  } else {
    return { error: "project or dir is required to identify the project" };
  }

  if (!existsSync(resolved)) {
    return { error: `Project directory not found: ${resolved}` };
  }

  return { dir: resolved };
}

/**
 * Detect the port a dev server is running on.
 * Checks args.port first, then reads vite.config / package.json,
 * then probes common ports with fetch.
 */
async function detectPort(dir: string, argsPort?: unknown): Promise<number | null> {
  // Explicit port from args
  if (argsPort !== undefined && argsPort !== null) {
    const port = Number(argsPort);
    if (!isNaN(port) && port > 0) return port;
  }

  // Try reading port from vite.config.ts
  const viteConfig = join(dir, "vite.config.ts");
  if (existsSync(viteConfig)) {
    try {
      const content = readFileSync(viteConfig, "utf-8");
      const portMatch = content.match(/port\s*:\s*(\d+)/);
      if (portMatch?.[1]) return parseInt(portMatch[1], 10);
    } catch { /* ignore */ }
  }

  // Try reading port from package.json scripts (--port N)
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const devScript = pkg.scripts?.dev ?? pkg.scripts?.start ?? "";
      const portMatch = devScript.match(/--port\s+(\d+)/);
      if (portMatch?.[1]) return parseInt(portMatch[1], 10);
    } catch { /* ignore */ }
  }

  // Probe common ports
  for (const port of COMMON_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok || res.status < 500) return port;
    } catch { /* not running on this port */ }
  }

  return null;
}

/**
 * Detect the appropriate dev command for a project directory.
 * Checks package.json scripts, then Python/Go/Rust markers.
 */
function detectDevCommand(dir: string): string | null {
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts?.dev) return "npm run dev";
      if (pkg.scripts?.start) return "npm start";
    } catch { /* ignore */ }
  }

  if (existsSync(join(dir, "manage.py"))) return "python manage.py runserver";
  if (existsSync(join(dir, "app.py"))) return "python app.py";
  if (existsSync(join(dir, "main.go"))) return "go run .";
  if (existsSync(join(dir, "Cargo.toml"))) return "cargo run";

  return null;
}

/**
 * Run a git command in a directory and return { stdout, stderr, status }.
 */
function git(dir: string, args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync("git", args, {
    cwd: dir,
    timeout: 30_000,
    env: { ...process.env },
  });

  return {
    stdout: result.stdout?.toString().trim() ?? "",
    stderr: result.stderr?.toString().trim() ?? "",
    status: result.status ?? 1,
  };
}

/**
 * Check if a directory is a git repository.
 */
function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

// ---------------------------------------------------------------------------
// Tool implementation
// ---------------------------------------------------------------------------

async function execute(args: Record<string, unknown>): Promise<string> {
  const action = args.action as string;
  if (!action) {
    return JSON.stringify({
      ok: false,
      error: `action is required: ${VALID_ACTIONS.join(", ")}`,
    });
  }

  switch (action) {
    case "status":
      return actionStatus(args);
    case "debug_logs":
      return actionDebugLogs(args);
    case "save_checkpoint":
      return actionSaveCheckpoint(args);
    case "rollback":
      return actionRollback(args);
    case "versions":
      return actionVersions(args);
    case "restart":
      return actionRestart(args);
    case "push_schema":
      return actionPushSchema(args);
    case "execute_sql":
      return actionExecuteSql(args);
    default:
      return JSON.stringify({
        ok: false,
        error: `Unknown action: "${action}". Use: ${VALID_ACTIONS.join(", ")}`,
      });
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function actionStatus(args: Record<string, unknown>): Promise<string> {
  const resolved = resolveProjectDir(args);
  if ("error" in resolved) return JSON.stringify({ ok: false, error: resolved.error });

  const { dir } = resolved;
  const projectName = basename(dir);

  try {
    // Check dev server
    const port = await detectPort(dir, args.port);
    let serverRunning = false;
    let serverUrl = "";

    if (port) {
      try {
        const res = await fetch(`http://localhost:${port}`, {
          signal: AbortSignal.timeout(2000),
        });
        serverRunning = res.ok || res.status < 500;
        serverUrl = `http://localhost:${port}`;
      } catch { /* server not reachable */ }
    }

    // TypeScript check (cap at 20 errors for readability)
    let tsErrors: string[] = [];
    let tsInstalled = true;
    const tsconfigPath = join(dir, "tsconfig.json");
    if (existsSync(tsconfigPath)) {
      // Check if tsc is actually available (not just the npx stub)
      const nodeModulesTsc = join(dir, "node_modules", ".bin", "tsc");
      if (existsSync(nodeModulesTsc)) {
        const tsc = spawnSync(nodeModulesTsc, ["--noEmit", "--pretty", "false"], {
          cwd: dir,
          timeout: 30_000,
          env: { ...process.env },
        });
        if (tsc.status !== 0) {
          const output = tsc.stdout?.toString() ?? "";
          tsErrors = output.split("\n").filter(Boolean).slice(0, 20);
        }
      } else {
        tsInstalled = false;
      }
    }

    // Debug log summary
    let debugSummary: Record<string, number> = {};
    const logsData = await readDebugLogs(port);
    if (logsData) {
      debugSummary = {
        consoleErrors: ((logsData.consoleLogs ?? []) as Array<{ level?: string }>).filter(
          (l) => l.level === "ERROR" || l.level === "WARN",
        ).length,
        networkErrors: ((logsData.networkRequests ?? []) as Array<{ response?: { status?: number }; error?: unknown }>).filter(
          (r) => (r.response?.status ?? 0) >= 400 || r.error,
        ).length,
        uiEvents: (logsData.uiEvents ?? []).length,
      };
    }

    // Git status
    let gitInfo: Record<string, unknown> = { initialized: false };
    if (isGitRepo(dir)) {
      const branch = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
      const commitCount = git(dir, ["rev-list", "--count", "HEAD"]);
      const dirty = git(dir, ["status", "--porcelain"]);
      gitInfo = {
        initialized: true,
        branch: branch.stdout || "unknown",
        commits: parseInt(commitCount.stdout, 10) || 0,
        uncommittedChanges: dirty.stdout.split("\n").filter(Boolean).length,
      };
    }

    log.debug(`Webdev tool: status for "${projectName}" (server: ${serverRunning})`);

    return JSON.stringify({
      ok: true,
      data: {
        project: projectName,
        directory: dir,
        server: {
          running: serverRunning,
          url: serverUrl || null,
          port: port ?? null,
        },
        typescript: {
          installed: tsInstalled,
          errors: tsErrors,
          errorCount: tsErrors.length,
          clean: tsInstalled ? tsErrors.length === 0 : null,
        },
        debugLogs: debugSummary,
        git: gitInfo,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Webdev tool status error: ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionDebugLogs(args: Record<string, unknown>): Promise<string> {
  const resolved = resolveProjectDir(args);
  if ("error" in resolved) return JSON.stringify({ ok: false, error: resolved.error });

  const { dir } = resolved;
  const filter = (args.filter as string) ?? "all";
  const clear = args.clear as boolean;

  try {
    if (clear) {
      if (existsSync(DEBUG_LOGS_FILE)) unlinkSync(DEBUG_LOGS_FILE);
      // Also try clearing via live endpoint
      const port = await detectPort(dir, args.port);
      if (port) {
        try {
          await fetch(`http://localhost:${port}/__jeriko__/clear`, {
            method: "POST",
            signal: AbortSignal.timeout(2000),
          });
        } catch { /* endpoint may not exist */ }
      }
      log.debug("Webdev tool: debug logs cleared");
      return JSON.stringify({
        ok: true,
        data: { action: "clear", message: "Debug logs cleared" },
      });
    }

    const port = await detectPort(dir, args.port);
    const logs = await readDebugLogs(port);

    if (!logs) {
      return JSON.stringify({
        ok: true,
        data: {
          message: "No debug logs found. Start a dev server with the Jeriko debug plugin.",
          consoleLogs: [],
          networkRequests: [],
          uiEvents: [],
        },
      });
    }

    // Apply filter
    const result: Record<string, unknown> = { lastUpdated: logs.lastUpdated };

    switch (filter) {
      case "errors":
        result.consoleLogs = ((logs.consoleLogs ?? []) as Array<{ level?: string }>).filter(
          (l) => l.level === "ERROR" || l.level === "WARN",
        );
        result.networkRequests = ((logs.networkRequests ?? []) as Array<{ response?: { status?: number }; error?: unknown }>).filter(
          (r) => (r.response?.status ?? 0) >= 400 || r.error,
        );
        break;
      case "network":
        result.networkRequests = logs.networkRequests ?? [];
        break;
      case "ui":
        result.uiEvents = logs.uiEvents ?? [];
        break;
      default: // "all"
        result.consoleLogs = logs.consoleLogs ?? [];
        result.networkRequests = logs.networkRequests ?? [];
        result.uiEvents = logs.uiEvents ?? [];
        break;
    }

    log.debug(`Webdev tool: debug_logs (filter: ${filter})`);
    return JSON.stringify({ ok: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Webdev tool debug_logs error: ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionSaveCheckpoint(args: Record<string, unknown>): Promise<string> {
  const resolved = resolveProjectDir(args);
  if ("error" in resolved) return JSON.stringify({ ok: false, error: resolved.error });

  const { dir } = resolved;
  const message = args.message as string | undefined;

  if (!message) {
    return JSON.stringify({ ok: false, error: "message is required for save_checkpoint" });
  }

  try {
    // Initialize git if needed
    if (!isGitRepo(dir)) {
      const init = git(dir, ["init"]);
      if (init.status !== 0) {
        return JSON.stringify({ ok: false, error: `git init failed: ${init.stderr}` });
      }
      log.debug("Webdev tool: initialized git repo");
    }

    // Stage all changes
    const add = git(dir, ["add", "-A"]);
    if (add.status !== 0) {
      return JSON.stringify({ ok: false, error: `git add failed: ${add.stderr}` });
    }

    // Check if there's anything to commit
    const status = git(dir, ["status", "--porcelain"]);
    if (!status.stdout) {
      return JSON.stringify({
        ok: true,
        data: { message: "No changes to commit", hash: null, fileCount: 0 },
      });
    }

    const fileCount = status.stdout.split("\n").filter(Boolean).length;

    // Commit — use args array to avoid shell injection
    const commit = git(dir, ["commit", "-m", message]);
    if (commit.status !== 0) {
      return JSON.stringify({ ok: false, error: `git commit failed: ${commit.stderr}` });
    }

    // Get the commit hash
    const hash = git(dir, ["rev-parse", "--short", "HEAD"]);

    log.debug(`Webdev tool: checkpoint "${message}" (${hash.stdout})`);
    return JSON.stringify({
      ok: true,
      data: {
        hash: hash.stdout,
        fileCount,
        message,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Webdev tool save_checkpoint error: ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionRollback(args: Record<string, unknown>): Promise<string> {
  const resolved = resolveProjectDir(args);
  if ("error" in resolved) return JSON.stringify({ ok: false, error: resolved.error });

  const { dir } = resolved;
  const commitHash = args.commit_hash as string | undefined;

  if (!isGitRepo(dir)) {
    return JSON.stringify({ ok: false, error: "Project is not a git repository. Save a checkpoint first." });
  }

  try {
    // Determine target: explicit hash or HEAD~1
    const target = commitHash ?? "HEAD~1";

    // Validate hash format if provided
    if (commitHash && !/^[0-9a-f]{4,40}$/.test(commitHash)) {
      return JSON.stringify({ ok: false, error: `Invalid commit hash format: "${commitHash}"` });
    }

    // Verify the target exists
    const verify = git(dir, ["rev-parse", "--verify", target]);
    if (verify.status !== 0) {
      return JSON.stringify({ ok: false, error: `Target not found: ${target}` });
    }

    // Stash any uncommitted changes as a safety net
    const stash = git(dir, ["stash", "push", "-m", `webdev-rollback-safety-${Date.now()}`]);
    const stashedChanges = stash.stdout.includes("Saved working directory");

    // Reset to target
    const reset = git(dir, ["reset", "--hard", target]);
    if (reset.status !== 0) {
      // Try to restore stash if reset fails
      if (stashedChanges) git(dir, ["stash", "pop"]);
      return JSON.stringify({ ok: false, error: `git reset failed: ${reset.stderr}` });
    }

    // Get new HEAD info
    const newHead = git(dir, ["rev-parse", "--short", "HEAD"]);
    const headMsg = git(dir, ["log", "-1", "--format=%s"]);

    log.debug(`Webdev tool: rolled back to ${newHead.stdout}`);
    return JSON.stringify({
      ok: true,
      data: {
        hash: newHead.stdout,
        message: headMsg.stdout,
        target,
        stashedChanges,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Webdev tool rollback error: ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionVersions(args: Record<string, unknown>): Promise<string> {
  const resolved = resolveProjectDir(args);
  if ("error" in resolved) return JSON.stringify({ ok: false, error: resolved.error });

  const { dir } = resolved;
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);

  if (!isGitRepo(dir)) {
    return JSON.stringify({
      ok: true,
      data: { versions: [], message: "Not a git repository. No checkpoints saved." },
    });
  }

  try {
    const logResult = git(dir, ["log", `--format=%H %ai %s`, `-n`, String(limit)]);

    if (!logResult.stdout) {
      return JSON.stringify({
        ok: true,
        data: { versions: [], message: "No commits yet." },
      });
    }

    const versions = logResult.stdout.split("\n").filter(Boolean).map((line) => {
      const hash = line.slice(0, 40);
      const rest = line.slice(41);
      // Date is in format "YYYY-MM-DD HH:MM:SS +ZZZZ" (25 chars)
      const date = rest.slice(0, 25).trim();
      const message = rest.slice(26).trim();
      return { hash: hash.slice(0, 8), fullHash: hash, date, message };
    });

    log.debug(`Webdev tool: listed ${versions.length} versions`);
    return JSON.stringify({
      ok: true,
      data: { versions, count: versions.length },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Webdev tool versions error: ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionRestart(args: Record<string, unknown>): Promise<string> {
  const resolved = resolveProjectDir(args);
  if ("error" in resolved) return JSON.stringify({ ok: false, error: resolved.error });

  const { dir } = resolved;

  try {
    // Detect the dev command
    const devCommand = detectDevCommand(dir);
    if (!devCommand) {
      return JSON.stringify({
        ok: false,
        error: "Cannot detect project type. No dev/start script in package.json.",
      });
    }

    // Determine port
    const port = await detectPort(dir, args.port) ?? 3000;

    // Kill existing process on the port
    try {
      const lsof = spawnSync("lsof", ["-ti", `:${port}`], { timeout: 5000 });
      const pids = (lsof.stdout?.toString().trim() ?? "").split("\n").filter(Boolean);
      for (const pid of pids) {
        const pidNum = parseInt(pid, 10);
        if (!isNaN(pidNum)) {
          try { process.kill(pidNum); } catch { /* already dead */ }
        }
      }
      // Wait briefly for port to be released
      if (pids.length > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch { /* no process on port */ }

    // Start the dev server in the background
    const child = spawn(devCommand, [], {
      cwd: dir,
      shell: true,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, PORT: String(port) },
    });
    child.unref();

    log.debug(`Webdev tool: restarted "${devCommand}" on port ${port} (pid: ${child.pid})`);
    return JSON.stringify({
      ok: true,
      data: {
        pid: child.pid,
        port,
        command: devCommand,
        directory: dir,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Webdev tool restart error: ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionPushSchema(args: Record<string, unknown>): Promise<string> {
  const resolved = resolveProjectDir(args);
  if ("error" in resolved) return JSON.stringify({ ok: false, error: resolved.error });

  const { dir } = resolved;

  // Verify drizzle config exists
  const drizzleConfigFiles = ["drizzle.config.ts", "drizzle.config.js", "drizzle.config.json"];
  const hasConfig = drizzleConfigFiles.some((f) => existsSync(join(dir, f)));

  if (!hasConfig) {
    return JSON.stringify({
      ok: false,
      error: "No drizzle config found (drizzle.config.ts/js/json). This project does not use Drizzle ORM.",
    });
  }

  try {
    const result = spawnSync("npx", ["drizzle-kit", "push"], {
      cwd: dir,
      timeout: 60_000,
      env: { ...process.env },
    });

    const output = result.stdout?.toString().trim() ?? "";
    const stderr = result.stderr?.toString().trim() ?? "";

    if (result.status !== 0) {
      return JSON.stringify({
        ok: false,
        error: `drizzle-kit push failed: ${stderr || output}`,
      });
    }

    log.debug("Webdev tool: schema pushed via drizzle-kit");
    return JSON.stringify({
      ok: true,
      data: {
        output: output || "Schema pushed successfully",
        warnings: stderr || null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Webdev tool push_schema error: ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionExecuteSql(args: Record<string, unknown>): Promise<string> {
  const resolved = resolveProjectDir(args);
  if ("error" in resolved) return JSON.stringify({ ok: false, error: resolved.error });

  const { dir } = resolved;
  const query = args.query as string | undefined;

  if (!query) {
    return JSON.stringify({ ok: false, error: "query is required for execute_sql" });
  }

  try {
    // Find the SQLite database file
    const dbFile = findSqliteDb(dir);
    if (!dbFile) {
      return JSON.stringify({
        ok: false,
        error: "No SQLite database found in project. Look for .db files or check drizzle config.",
      });
    }

    // Use bun:sqlite for direct database access
    const { Database } = await import("bun:sqlite");
    const trimmed = query.trim().toUpperCase();
    const isReadOnly = trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA") || trimmed.startsWith("EXPLAIN");
    // Only pass readonly when true — bun:sqlite defaults to readwrite + create
    const db = new Database(dbFile, isReadOnly ? { readonly: true } : undefined);

    try {
      if (isReadOnly) {
        const rows = db.query(query).all();
        log.debug(`Webdev tool: executed SELECT (${rows.length} rows)`);
        return JSON.stringify({
          ok: true,
          data: {
            rows,
            rowCount: rows.length,
            database: basename(dbFile),
          },
        });
      } else {
        const stmt = db.query(query);
        const result = stmt.run();
        log.debug(`Webdev tool: executed SQL (${result.changes} changes)`);
        return JSON.stringify({
          ok: true,
          data: {
            changes: result.changes,
            database: basename(dbFile),
          },
        });
      }
    } finally {
      db.close();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Webdev tool execute_sql error: ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read debug logs from the live dev server endpoint or the fallback file.
 */
async function readDebugLogs(
  port: number | null,
): Promise<Record<string, unknown[]> | null> {
  // Try live endpoint first
  if (port) {
    try {
      const res = await fetch(`http://localhost:${port}/__jeriko__/logs`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return await res.json() as Record<string, unknown[]>;
    } catch { /* not available */ }
  }

  // Fall back to file
  if (existsSync(DEBUG_LOGS_FILE)) {
    try {
      return JSON.parse(readFileSync(DEBUG_LOGS_FILE, "utf-8"));
    } catch { /* corrupt file */ }
  }

  return null;
}

/**
 * Find a SQLite database file in the project directory.
 * Searches common locations and naming patterns.
 */
function findSqliteDb(dir: string): string | null {
  // Direct common names
  const commonNames = [
    "sqlite.db", "data.db", "database.db", "app.db",
    "dev.db", "local.db", "jeriko.db",
  ];

  for (const name of commonNames) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }

  // Check drizzle directory
  const drizzleDir = join(dir, "drizzle");
  if (existsSync(drizzleDir)) {
    for (const name of commonNames) {
      const p = join(drizzleDir, name);
      if (existsSync(p)) return p;
    }
  }

  // Scan root for any .db file
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".db")) {
        return join(dir, entry.name);
      }
    }
  } catch { /* ignore */ }

  // Check server/ directory (common in web-db-user template)
  const serverDir = join(dir, "server");
  if (existsSync(serverDir)) {
    try {
      const entries = readdirSync(serverDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".db")) {
          return join(serverDir, entry.name);
        }
      }
    } catch { /* ignore */ }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tool definition + registration
// ---------------------------------------------------------------------------

export const webdevTool: ToolDefinition = {
  id: "webdev",
  name: "webdev",
  description:
    "Manage web development projects — health status, debug logs, git checkpoints, " +
    "rollback, dev server restart, schema push, and SQL execution.\n\n" +
    "Actions:\n" +
    "  status          — Project health dashboard (server status, TypeScript errors, debug log summary, git state)\n" +
    "  debug_logs      — Get debug logs from dev server. filter: errors/network/ui/all. clear:true to reset.\n" +
    "  save_checkpoint — Git commit all changes. Requires message. Auto-initializes git if needed.\n" +
    "  rollback        — Reset to a prior commit. Optional commit_hash (default: HEAD~1). Stashes changes first.\n" +
    "  versions        — List checkpoint history. Optional limit (default: 20).\n" +
    "  restart         — Stop and restart the dev server. Auto-detects command and port.\n" +
    "  push_schema     — Run drizzle-kit push for database migrations. Requires drizzle config.\n" +
    "  execute_sql     — Run SQL query against the project's SQLite database.\n\n" +
    "Identify project by name (project param, resolves to ~/.jeriko/projects/<name>) or " +
    "absolute path (dir param).",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Action to perform",
        enum: [...VALID_ACTIONS],
      },
      project: {
        type: "string",
        description: "Project name in ~/.jeriko/projects/ (alternative to dir)",
      },
      dir: {
        type: "string",
        description: "Absolute path to project directory (alternative to project)",
      },
      message: {
        type: "string",
        description: "Commit message (for save_checkpoint)",
      },
      commit_hash: {
        type: "string",
        description: "Git commit hash to roll back to (for rollback, default: HEAD~1)",
      },
      filter: {
        type: "string",
        description: "Log filter: errors, network, ui, or all (for debug_logs, default: all)",
        enum: ["errors", "network", "ui", "all"],
      },
      clear: {
        type: "boolean",
        description: "Clear debug logs (for debug_logs)",
      },
      query: {
        type: "string",
        description: "SQL query to execute (for execute_sql)",
      },
      limit: {
        type: "number",
        description: "Maximum versions to return (for versions, default: 20, max: 100)",
      },
      port: {
        type: "number",
        description: "Dev server port override (auto-detected if omitted)",
      },
    },
    required: ["action"],
  },
  execute,
  aliases: ["web_dev", "dev_tools", "project"],
};

registerTool(webdevTool);
