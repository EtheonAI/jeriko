import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

import { clearTools, registerTool, getTool } from "../../src/daemon/agent/tools/registry.js";

// ---------------------------------------------------------------------------
// Test fixtures — temp directory for isolated webdev operations
// ---------------------------------------------------------------------------

let testDir: string;
let originalHome: string | undefined;

/** Debug log file path — must match webdev.ts constant. */
const DEBUG_LOGS_FILE = "/tmp/jeriko-debug-logs.json";

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "jeriko-webdev-tool-test-"));
  originalHome = process.env.HOME;
  process.env.HOME = testDir;
  clearTools();
  // Ensure no stale debug logs from prior tests
  try { fs.unlinkSync(DEBUG_LOGS_FILE); } catch { /* not found */ }
});

afterEach(() => {
  if (originalHome !== undefined) {
    process.env.HOME = originalHome;
  } else {
    delete process.env.HOME;
  }
  clearTools();
  // Clean up debug logs
  try { fs.unlinkSync(DEBUG_LOGS_FILE); } catch { /* not found */ }
  fs.rmSync(testDir, { recursive: true, force: true });
});

/**
 * Create a minimal test project with package.json and optional git init.
 * Returns the project directory path.
 */
function createTestProject(
  name: string,
  opts?: {
    scripts?: Record<string, string>;
    gitInit?: boolean;
    files?: Record<string, string>;
    tsconfig?: boolean;
    drizzleConfig?: boolean;
    sqliteDb?: { name: string; init?: string };
  },
): string {
  const projectDir = path.join(testDir, ".jeriko", "projects", name);
  fs.mkdirSync(projectDir, { recursive: true });

  // Create package.json
  const pkg: Record<string, unknown> = {
    name,
    version: "1.0.0",
    scripts: opts?.scripts ?? { dev: "vite --port 59999" },
  };
  fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify(pkg, null, 2));

  // Create additional files
  if (opts?.files) {
    for (const [filePath, content] of Object.entries(opts.files)) {
      const fullPath = path.join(projectDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }
  }

  // Create tsconfig.json
  if (opts?.tsconfig) {
    fs.writeFileSync(
      path.join(projectDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true, noEmit: true } }),
    );
  }

  // Create drizzle config
  if (opts?.drizzleConfig) {
    fs.writeFileSync(
      path.join(projectDir, "drizzle.config.ts"),
      'export default { schema: "./drizzle/schema.ts", driver: "better-sqlite" };',
    );
  }

  // Create SQLite database
  if (opts?.sqliteDb) {
    const dbPath = path.join(projectDir, opts.sqliteDb.name);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    // Use bun:sqlite to create a real database file
    const { Database } = require("bun:sqlite");
    const db = new Database(dbPath);
    if (opts.sqliteDb.init) {
      db.exec(opts.sqliteDb.init);
    }
    db.close();
  }

  // Initialize git
  if (opts?.gitInit) {
    spawnSync("git", ["init"], { cwd: projectDir });
    spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: projectDir });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: projectDir });
    spawnSync("git", ["add", "-A"], { cwd: projectDir });
    spawnSync("git", ["commit", "-m", "Initial commit"], { cwd: projectDir });
  }

  return projectDir;
}

/**
 * Load the webdev tool definition and ensure it's in the registry.
 *
 * Bun caches dynamic imports — the module-level registerTool() call only
 * runs once (on first import). Since we clearTools() in beforeEach, we
 * must re-register the exported ToolDefinition each time.
 */
async function loadWebdevTool() {
  const { webdevTool } = await import("../../src/daemon/agent/tools/webdev.js");
  if (!getTool(webdevTool.id)) {
    registerTool(webdevTool);
  }
  return webdevTool;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

describe("webdev tool registration", () => {
  it("registers with correct id and aliases", async () => {
    const tool = await loadWebdevTool();

    expect(tool.id).toBe("webdev");
    expect(tool.name).toBe("webdev");
    expect(tool.aliases).toContain("web_dev");
    expect(tool.aliases).toContain("dev_tools");
    expect(tool.aliases).toContain("project");
  });

  it("has required parameter fields", async () => {
    const tool = await loadWebdevTool();

    expect(tool.parameters.properties).toBeDefined();
    expect(tool.parameters.properties!.action).toBeDefined();
    expect(tool.parameters.properties!.project).toBeDefined();
    expect(tool.parameters.properties!.dir).toBeDefined();
    expect(tool.parameters.properties!.message).toBeDefined();
    expect(tool.parameters.properties!.commit_hash).toBeDefined();
    expect(tool.parameters.properties!.filter).toBeDefined();
    expect(tool.parameters.properties!.clear).toBeDefined();
    expect(tool.parameters.properties!.query).toBeDefined();
    expect(tool.parameters.properties!.limit).toBeDefined();
    expect(tool.parameters.properties!.port).toBeDefined();
    expect(tool.parameters.required).toContain("action");
  });

  it("resolves via aliases", async () => {
    const tool = await loadWebdevTool();

    expect(getTool("webdev")).toBe(tool);
    expect(getTool("web_dev")).toBe(tool);
    expect(getTool("dev_tools")).toBe(tool);
    expect(getTool("project")).toBe(tool);
  });
});

// ---------------------------------------------------------------------------
// status action
// ---------------------------------------------------------------------------

describe("webdev tool — status action", () => {
  it("returns error for missing project", async () => {
    const tool = await loadWebdevTool();
    const result = JSON.parse(await tool.execute({ action: "status" }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("project or dir is required");
  });

  it("returns error for nonexistent project", async () => {
    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "status", project: "nonexistent-project" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("reports status for a project with no server running", async () => {
    createTestProject("my-app");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "status", project: "my-app" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.project).toBe("my-app");
    expect(result.data.server.running).toBe(false);
    expect(result.data.git.initialized).toBe(false);
  });

  it("reports git info for initialized project", async () => {
    createTestProject("git-app", { gitInit: true });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "status", project: "git-app" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.git.initialized).toBe(true);
    expect(result.data.git.commits).toBeGreaterThanOrEqual(1);
  });

  it("works with dir instead of project name", async () => {
    const dir = createTestProject("dir-test");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "status", dir }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.directory).toBe(dir);
  });
});

// ---------------------------------------------------------------------------
// debug_logs action
// ---------------------------------------------------------------------------

describe("webdev tool — debug_logs action", () => {
  it("returns empty when no logs available", async () => {
    createTestProject("no-logs-app");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "debug_logs", project: "no-logs-app" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.consoleLogs).toEqual([]);
    expect(result.data.networkRequests).toEqual([]);
    expect(result.data.uiEvents).toEqual([]);
  });

  it("reads from debug log file", async () => {
    createTestProject("log-app");

    // Write a debug log file
    const logs = {
      lastUpdated: Date.now(),
      consoleLogs: [
        { level: "ERROR", message: "Test error", timestamp: Date.now() },
        { level: "INFO", message: "Test info", timestamp: Date.now() },
      ],
      networkRequests: [
        { url: "/api/data", response: { status: 200 } },
        { url: "/api/fail", response: { status: 500 }, error: "Server Error" },
      ],
      uiEvents: [
        { type: "click", target: "button.submit" },
      ],
    };
    fs.writeFileSync(DEBUG_LOGS_FILE, JSON.stringify(logs));

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "debug_logs", project: "log-app" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.consoleLogs).toHaveLength(2);
    expect(result.data.networkRequests).toHaveLength(2);
    expect(result.data.uiEvents).toHaveLength(1);
  });

  it("filters by errors", async () => {
    createTestProject("error-filter-app");

    const logs = {
      lastUpdated: Date.now(),
      consoleLogs: [
        { level: "ERROR", message: "Real error" },
        { level: "WARN", message: "A warning" },
        { level: "INFO", message: "Just info" },
      ],
      networkRequests: [
        { url: "/ok", response: { status: 200 } },
        { url: "/fail", response: { status: 500 } },
      ],
      uiEvents: [],
    };
    fs.writeFileSync(DEBUG_LOGS_FILE, JSON.stringify(logs));

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "debug_logs", project: "error-filter-app", filter: "errors" }),
    );

    expect(result.ok).toBe(true);
    // Only ERROR and WARN console logs
    expect(result.data.consoleLogs).toHaveLength(2);
    // Only 500 network requests
    expect(result.data.networkRequests).toHaveLength(1);
  });

  it("clears logs", async () => {
    createTestProject("clear-app");
    fs.writeFileSync(DEBUG_LOGS_FILE, JSON.stringify({ consoleLogs: [] }));

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "debug_logs", project: "clear-app", clear: true }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.action).toBe("clear");
    expect(fs.existsSync(DEBUG_LOGS_FILE)).toBe(false);
  });

  it("filters by network", async () => {
    createTestProject("net-filter-app");

    const logs = {
      consoleLogs: [{ level: "INFO", message: "ignore" }],
      networkRequests: [{ url: "/api", response: { status: 200 } }],
      uiEvents: [{ type: "click" }],
    };
    fs.writeFileSync(DEBUG_LOGS_FILE, JSON.stringify(logs));

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "debug_logs", project: "net-filter-app", filter: "network" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.networkRequests).toHaveLength(1);
    // Should NOT have consoleLogs or uiEvents when filtering by network
    expect(result.data.consoleLogs).toBeUndefined();
    expect(result.data.uiEvents).toBeUndefined();
  });

  it("filters by ui", async () => {
    createTestProject("ui-filter-app");

    const logs = {
      consoleLogs: [{ level: "INFO", message: "ignore" }],
      networkRequests: [{ url: "/api", response: { status: 200 } }],
      uiEvents: [{ type: "click", target: "button" }],
    };
    fs.writeFileSync(DEBUG_LOGS_FILE, JSON.stringify(logs));

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "debug_logs", project: "ui-filter-app", filter: "ui" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.uiEvents).toHaveLength(1);
    expect(result.data.consoleLogs).toBeUndefined();
    expect(result.data.networkRequests).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// save_checkpoint action
// ---------------------------------------------------------------------------

describe("webdev tool — save_checkpoint action", () => {
  it("initializes git and commits on first checkpoint", async () => {
    createTestProject("fresh-app");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({
        action: "save_checkpoint",
        project: "fresh-app",
        message: "Initial setup",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.hash).toBeTruthy();
    expect(result.data.message).toBe("Initial setup");
    expect(result.data.fileCount).toBeGreaterThan(0);

    // Verify git repo was created
    const projectDir = path.join(testDir, ".jeriko", "projects", "fresh-app");
    expect(fs.existsSync(path.join(projectDir, ".git"))).toBe(true);
  });

  it("creates checkpoint with message on existing repo", async () => {
    const dir = createTestProject("existing-repo", { gitInit: true });

    // Add a new file to have something to commit
    fs.writeFileSync(path.join(dir, "new-file.txt"), "new content");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({
        action: "save_checkpoint",
        project: "existing-repo",
        message: "Add hero section",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.hash).toBeTruthy();
    expect(result.data.message).toBe("Add hero section");
  });

  it("returns error when message is missing", async () => {
    createTestProject("no-msg-app", { gitInit: true });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "save_checkpoint", project: "no-msg-app" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("message is required");
  });

  it("handles no changes gracefully", async () => {
    createTestProject("clean-app", { gitInit: true });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({
        action: "save_checkpoint",
        project: "clean-app",
        message: "Nothing changed",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.fileCount).toBe(0);
    expect(result.data.hash).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rollback action
// ---------------------------------------------------------------------------

describe("webdev tool — rollback action", () => {
  it("rolls back to HEAD~1", async () => {
    const dir = createTestProject("rollback-app", { gitInit: true });

    // Create a second commit
    fs.writeFileSync(path.join(dir, "feature.txt"), "feature");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-m", "Add feature"], { cwd: dir });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "rollback", project: "rollback-app" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.hash).toBeTruthy();
    expect(result.data.target).toBe("HEAD~1");

    // Feature file should be gone after rollback
    expect(fs.existsSync(path.join(dir, "feature.txt"))).toBe(false);
  });

  it("rolls back to specific commit hash", async () => {
    const dir = createTestProject("hash-rollback", { gitInit: true });

    // Get initial commit hash
    const initialHash = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
    }).stdout.toString().trim();

    // Create two more commits
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-m", "Add a"], { cwd: dir });

    fs.writeFileSync(path.join(dir, "b.txt"), "b");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-m", "Add b"], { cwd: dir });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({
        action: "rollback",
        project: "hash-rollback",
        commit_hash: initialHash.slice(0, 8),
      }),
    );

    expect(result.ok).toBe(true);
    // Should be back at initial — no a.txt or b.txt
    expect(fs.existsSync(path.join(dir, "a.txt"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "b.txt"))).toBe(false);
  });

  it("rejects invalid hash format", async () => {
    createTestProject("invalid-hash", { gitInit: true });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({
        action: "rollback",
        project: "invalid-hash",
        commit_hash: "not-a-hash!",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid commit hash");
  });

  it("returns error for non-git project", async () => {
    createTestProject("no-git-app");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "rollback", project: "no-git-app" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not a git repository");
  });
});

// ---------------------------------------------------------------------------
// versions action
// ---------------------------------------------------------------------------

describe("webdev tool — versions action", () => {
  it("lists commits", async () => {
    const dir = createTestProject("version-app", { gitInit: true });

    // Add more commits
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-m", "Add feature A"], { cwd: dir });

    fs.writeFileSync(path.join(dir, "b.txt"), "b");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-m", "Add feature B"], { cwd: dir });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "versions", project: "version-app" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.count).toBe(3);
    expect(result.data.versions[0].message).toBe("Add feature B");
    expect(result.data.versions[1].message).toBe("Add feature A");
    expect(result.data.versions[2].message).toBe("Initial commit");
  });

  it("returns empty for non-git project", async () => {
    createTestProject("no-git-versions");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "versions", project: "no-git-versions" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.versions).toEqual([]);
  });

  it("respects limit parameter", async () => {
    const dir = createTestProject("limited-versions", { gitInit: true });

    // Create 5 commits
    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(path.join(dir, `file${i}.txt`), `content ${i}`);
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-m", `Commit ${i}`], { cwd: dir });
    }

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "versions", project: "limited-versions", limit: 3 }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.count).toBe(3);
    expect(result.data.versions[0].message).toBe("Commit 5");
  });
});

// ---------------------------------------------------------------------------
// push_schema action
// ---------------------------------------------------------------------------

describe("webdev tool — push_schema action", () => {
  it("returns error when no drizzle config", async () => {
    createTestProject("no-drizzle");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "push_schema", project: "no-drizzle" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("No drizzle config");
  });

  it("detects drizzle.config.ts and attempts push", async () => {
    createTestProject("with-drizzle", { drizzleConfig: true });

    const tool = await loadWebdevTool();
    // Will fail because drizzle-kit isn't installed in test env, but it should
    // get past the config check and attempt to run the command.
    // The key assertion: error is NOT "No drizzle config" — it found the config.
    const result = JSON.parse(
      await tool.execute({ action: "push_schema", project: "with-drizzle" }),
    );

    // Either fails with drizzle-kit error (not "no drizzle config")
    // or succeeds — either way, it found the config
    if (!result.ok) {
      expect(result.error).not.toContain("No drizzle config");
    }
  }, 90_000); // drizzle-kit may be slow to resolve via npx
});

// ---------------------------------------------------------------------------
// execute_sql action
// ---------------------------------------------------------------------------

describe("webdev tool — execute_sql action", () => {
  it("runs SELECT on SQLite database", async () => {
    createTestProject("sql-app", {
      sqliteDb: {
        name: "sqlite.db",
        init: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob');",
      },
    });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({
        action: "execute_sql",
        project: "sql-app",
        query: "SELECT * FROM users",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.rowCount).toBe(2);
    expect(result.data.rows[0].name).toBe("Alice");
    expect(result.data.rows[1].name).toBe("Bob");
    expect(result.data.database).toBe("sqlite.db");
  });

  it("runs mutations and returns change count", async () => {
    createTestProject("sql-mutate", {
      sqliteDb: {
        name: "data.db",
        init: "CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO items VALUES (1, 'x'), (2, 'y');",
      },
    });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({
        action: "execute_sql",
        project: "sql-mutate",
        query: "UPDATE items SET value = 'updated' WHERE id = 1",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.changes).toBe(1);
  });

  it("returns error when no database found", async () => {
    createTestProject("no-db-app");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({
        action: "execute_sql",
        project: "no-db-app",
        query: "SELECT 1",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("No SQLite database found");
  });

  it("returns error when query is missing", async () => {
    createTestProject("no-query-app");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "execute_sql", project: "no-query-app" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("query is required");
  });

  it("handles PRAGMA queries as read-only", async () => {
    createTestProject("pragma-app", {
      sqliteDb: {
        name: "sqlite.db",
        init: "CREATE TABLE t (id INTEGER PRIMARY KEY);",
      },
    });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({
        action: "execute_sql",
        project: "pragma-app",
        query: "PRAGMA table_info(t)",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.rows).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// restart action
// ---------------------------------------------------------------------------

describe("webdev tool — restart action", () => {
  it("returns error when no dev command detected", async () => {
    createTestProject("no-scripts", { scripts: {} });

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "restart", project: "no-scripts" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Cannot detect project type");
  });

  it("detects dev command from package.json", async () => {
    createTestProject("has-dev", { scripts: { dev: "vite --port 9999" } });

    const tool = await loadWebdevTool();
    // This will attempt to start vite which isn't installed, but we can check
    // it recognized the project type (doesn't error with "cannot detect")
    const result = JSON.parse(
      await tool.execute({ action: "restart", project: "has-dev" }),
    );

    // It should either succeed with a PID or at least not say "cannot detect"
    if (result.ok) {
      expect(result.data.command).toBe("npm run dev");
      expect(result.data.pid).toBeDefined();
    } else {
      expect(result.error).not.toContain("Cannot detect");
    }
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("webdev tool — error handling", () => {
  it("returns error for missing action", async () => {
    const tool = await loadWebdevTool();
    const result = JSON.parse(await tool.execute({}));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("action is required");
  });

  it("returns error for unknown action", async () => {
    const tool = await loadWebdevTool();
    const result = JSON.parse(await tool.execute({ action: "invalid_action" }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown action");
    expect(result.error).toContain("invalid_action");
  });

  it("returns error when neither project nor dir provided", async () => {
    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "status" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("project or dir is required");
  });

  it("works with absolute dir path", async () => {
    const dir = createTestProject("abs-path-test");

    const tool = await loadWebdevTool();
    const result = JSON.parse(
      await tool.execute({ action: "versions", dir }),
    );

    expect(result.ok).toBe(true);
  });
});
