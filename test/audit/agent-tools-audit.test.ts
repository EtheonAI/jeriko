/**
 * Agent Tools System Audit Tests
 *
 * Tests tool registration, schemas, execution, parameter validation,
 * error handling, and security for all 16 agent tools.
 *
 * Strategy: Import tool modules once (triggers self-registration). Use the
 * exported ToolDefinition objects directly for execution tests. Registry tests
 * use clearTools/registerTool for isolation.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

import {
  registerTool,
  getTool,
  listTools,
  clearTools,
  toAnthropicFormat,
  toOpenAIFormat,
  toDriverFormat,
  type ToolDefinition,
} from "../../src/daemon/agent/tools/registry.js";

// Import tool definitions directly (self-register on first import)
import { bashTool } from "../../src/daemon/agent/tools/bash.js";
import { readTool } from "../../src/daemon/agent/tools/read.js";
import { writeTool } from "../../src/daemon/agent/tools/write.js";
import { editTool } from "../../src/daemon/agent/tools/edit.js";
import { listTool } from "../../src/daemon/agent/tools/list.js";
import { searchTool } from "../../src/daemon/agent/tools/search.js";
import { webTool } from "../../src/daemon/agent/tools/web.js";
import { screenshotTool } from "../../src/daemon/agent/tools/screenshot.js";
import { cameraTool } from "../../src/daemon/agent/tools/camera.js";
import { browserTool } from "../../src/daemon/agent/tools/browse.js";
import { connectorTool } from "../../src/daemon/agent/tools/connector.js";
import { skillTool } from "../../src/daemon/agent/tools/skill.js";
import { webdevTool } from "../../src/daemon/agent/tools/webdev.js";
import { memoryTool } from "../../src/daemon/agent/tools/memory-tool.js";

// parallel and delegate import orchestrator which has heavy deps — mock them
const parallelToolMock: ToolDefinition = {
  id: "parallel_tasks",
  name: "parallel_tasks",
  description: "Run multiple tasks in parallel using typed sub-agents.",
  parameters: {
    type: "object",
    properties: {
      tasks: { type: "array", items: { type: "string" }, description: "Tasks" },
    },
    required: ["tasks"],
  },
  execute: async () => JSON.stringify({ ok: true, results: [] }),
  aliases: ["parallel", "multi_task", "fan_out"],
};

const delegateToolMock: ToolDefinition = {
  id: "delegate",
  name: "delegate",
  description: "Delegate a task to a sub-agent.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Task prompt" },
    },
    required: ["prompt"],
  },
  execute: async () => JSON.stringify({ ok: true, response: "done" }),
  aliases: ["delegate_task", "sub_agent", "spawn_agent"],
};

/** All 16 tool definitions. */
const ALL_TOOLS: ToolDefinition[] = [
  bashTool, readTool, writeTool, editTool, listTool,
  searchTool, webTool, screenshotTool, cameraTool,
  parallelToolMock, browserTool, delegateToolMock, connectorTool,
  skillTool, webdevTool, memoryTool,
];

/** Register all 16 tools into the registry. */
function registerAll(): void {
  for (const tool of ALL_TOOLS) {
    registerTool(tool);
  }
}

// ---------------------------------------------------------------------------
// Global test fixtures
// ---------------------------------------------------------------------------

let testDir: string;
let originalHome: string | undefined;

beforeEach(() => {
  // Use /tmp directly (not os.tmpdir() which may be /var/folders on macOS)
  // so file tools pass isPathBlocked() checks (ALLOWED_ROOTS includes /tmp).
  testDir = fs.mkdtempSync(path.join("/tmp", "jeriko-audit-tools-"));
  originalHome = process.env.HOME;
  process.env.HOME = testDir;
  // Git env vars
  process.env.GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME ?? "Test";
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL ?? "test@test.com";
  process.env.GIT_COMMITTER_NAME = process.env.GIT_COMMITTER_NAME ?? "Test";
  process.env.GIT_COMMITTER_EMAIL = process.env.GIT_COMMITTER_EMAIL ?? "test@test.com";
});

afterEach(() => {
  if (originalHome !== undefined) {
    process.env.HOME = originalHome;
  } else {
    delete process.env.HOME;
  }
  clearTools();
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════
// 1. TOOL REGISTRATION
// ═══════════════════════════════════════════════════════════════

describe("tool registration — all 16 tools", () => {
  const EXPECTED_TOOL_IDS = [
    "bash", "read_file", "write_file", "edit_file", "list_files",
    "search_files", "web_search", "screenshot", "camera",
    "parallel_tasks", "browser", "delegate", "connector",
    "use_skill", "webdev", "memory",
  ];

  beforeEach(() => {
    clearTools();
    registerAll();
  });

  it("registers exactly 16 tools", () => {
    expect(listTools().length).toBe(16);
  });

  it("registers all expected tool IDs", () => {
    const ids = listTools().map((t) => t.id).sort();
    expect(ids).toEqual(EXPECTED_TOOL_IDS.sort());
  });

  it("every tool has required fields", () => {
    for (const tool of listTools()) {
      expect(tool.id).toBeTruthy();
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe("object");
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("every tool with aliases resolves via alias", () => {
    for (const tool of listTools()) {
      if (!tool.aliases) continue;
      for (const alias of tool.aliases) {
        const resolved = getTool(alias);
        expect(resolved).toBeDefined();
        expect(resolved!.id).toBe(tool.id);
      }
    }
  });

  it("converts all tools to Anthropic format", () => {
    const formatted = toAnthropicFormat(listTools());
    expect(formatted.length).toBe(16);
    for (const t of formatted) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.input_schema).toBeDefined();
    }
  });

  it("converts all tools to OpenAI format", () => {
    const formatted = toOpenAIFormat(listTools());
    expect(formatted.length).toBe(16);
    for (const t of formatted) {
      expect(t.type).toBe("function");
      expect(t.function.name).toBeTruthy();
    }
  });

  it("converts all tools to driver format", () => {
    const formatted = toDriverFormat(listTools());
    expect(formatted.length).toBe(16);
    for (const t of formatted) {
      expect(t.name).toBeTruthy();
      expect(t.parameters).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. BASH TOOL
// ═══════════════════════════════════════════════════════════════

describe("bash tool", () => {
  const execute = bashTool.execute;

  it("executes a simple command", async () => {
    const result = await execute({ command: "echo hello" });
    expect(result).toContain("hello");
  });

  it("returns error for missing command", async () => {
    const result = await execute({});
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("command is required");
  });

  it("captures stderr", async () => {
    const result = await execute({ command: "echo error >&2" });
    expect(result).toContain("error");
    expect(result).toContain("[stderr]");
  });

  it("respects cwd parameter", async () => {
    const result = await execute({ command: "pwd", cwd: testDir });
    expect(result).toContain(path.basename(testDir));
  });

  it("denies critical commands (sudo)", async () => {
    const result = await execute({ command: "sudo rm -rf /" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("denied");
  });

  it("denies critical commands (fork bomb pattern)", async () => {
    const result = await execute({ command: ":(){ :|:& }" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
  });

  it("returns output for failing command", async () => {
    const result = await execute({ command: "exit 42" });
    expect(result).toContain("exit code 42");
  });

  it("has correct aliases", () => {
    expect(bashTool.aliases).toContain("exec");
    expect(bashTool.aliases).toContain("shell");
    expect(bashTool.aliases).toContain("run");
    expect(bashTool.aliases).toContain("terminal");
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. READ FILE TOOL
// ═══════════════════════════════════════════════════════════════

describe("read_file tool", () => {
  const execute = readTool.execute;

  it("reads a file with numbered lines", async () => {
    const filePath = path.join(testDir, "test.txt");
    fs.writeFileSync(filePath, "line1\nline2\nline3\n");
    const result = await execute({ file_path: filePath });
    expect(result).toContain("1\tline1");
    expect(result).toContain("2\tline2");
    expect(result).toContain("3\tline3");
  });

  it("returns error for missing file_path", async () => {
    const result = await execute({});
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("file_path is required");
  });

  it("returns error for non-existent file", async () => {
    const result = await execute({ file_path: path.join(testDir, "nonexistent.txt") });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
  });

  it("returns error for directory path", async () => {
    const result = await execute({ file_path: testDir });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Not a file");
  });

  it("respects offset and limit", async () => {
    const filePath = path.join(testDir, "multi.txt");
    fs.writeFileSync(filePath, "a\nb\nc\nd\ne\n");
    const result = await execute({ file_path: filePath, offset: 1, limit: 2 });
    expect(result).toContain("2\tb");
    expect(result).toContain("3\tc");
    expect(result).not.toContain("1\ta");
    expect(result).not.toContain("4\td");
  });

  it("returns empty file marker for empty file", async () => {
    const filePath = path.join(testDir, "empty.txt");
    fs.writeFileSync(filePath, "");
    const result = await execute({ file_path: filePath });
    expect(result).toBe("(empty file)");
  });

  it("blocks paths outside allowed roots", async () => {
    const result = await execute({ file_path: "/etc/passwd" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("blocked");
  });

  it("has correct aliases", () => {
    expect(readTool.aliases).toContain("read");
    expect(readTool.aliases).toContain("cat");
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. WRITE FILE TOOL
// ═══════════════════════════════════════════════════════════════

describe("write_file tool", () => {
  const execute = writeTool.execute;

  it("writes a file and returns ok", async () => {
    const filePath = path.join(testDir, "out.txt");
    const result = await execute({ file_path: filePath, content: "hello world" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.bytes).toBe(11);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("hello world");
  });

  it("creates parent directories", async () => {
    const filePath = path.join(testDir, "a", "b", "c", "deep.txt");
    const result = await execute({ file_path: filePath, content: "deep" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("returns error for missing file_path", async () => {
    const result = await execute({ content: "hello" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("file_path is required");
  });

  it("returns error for missing content", async () => {
    const result = await execute({ file_path: path.join(testDir, "x.txt") });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("content is required");
  });

  it("allows empty string content", async () => {
    const filePath = path.join(testDir, "empty.txt");
    const result = await execute({ file_path: filePath, content: "" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.bytes).toBe(0);
  });

  it("blocks paths outside allowed roots", async () => {
    const result = await execute({ file_path: "/etc/evil.txt", content: "pwned" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("blocked");
  });

  it("has correct aliases", () => {
    expect(writeTool.aliases).toContain("write");
    expect(writeTool.aliases).toContain("create_file");
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. EDIT FILE TOOL
// ═══════════════════════════════════════════════════════════════

describe("edit_file tool", () => {
  const execute = editTool.execute;

  it("replaces a unique string", async () => {
    const filePath = path.join(testDir, "edit.txt");
    fs.writeFileSync(filePath, "hello world");
    const result = await execute({
      file_path: filePath,
      old_string: "world",
      new_string: "universe",
    });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("hello universe");
  });

  it("rejects non-unique old_string without replace_all", async () => {
    const filePath = path.join(testDir, "dup.txt");
    fs.writeFileSync(filePath, "aaa bbb aaa");
    const result = await execute({
      file_path: filePath,
      old_string: "aaa",
      new_string: "ccc",
    });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("not unique");
  });

  it("replace_all replaces all occurrences", async () => {
    const filePath = path.join(testDir, "replall.txt");
    fs.writeFileSync(filePath, "aaa bbb aaa");
    const result = await execute({
      file_path: filePath,
      old_string: "aaa",
      new_string: "ccc",
      replace_all: true,
    });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("ccc bbb ccc");
  });

  it("returns error when old_string not found", async () => {
    const filePath = path.join(testDir, "nofind.txt");
    fs.writeFileSync(filePath, "hello");
    const result = await execute({
      file_path: filePath,
      old_string: "missing",
      new_string: "x",
    });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("not found");
  });

  it("returns error for missing required params", async () => {
    const r1 = await execute({});
    expect(JSON.parse(r1).error).toContain("file_path is required");

    const r2 = await execute({ file_path: path.join(testDir, "x.txt") });
    expect(JSON.parse(r2).error).toContain("old_string is required");

    const r3 = await execute({ file_path: path.join(testDir, "x.txt"), old_string: "y" });
    expect(JSON.parse(r3).error).toContain("new_string is required");
  });

  it("blocks paths outside allowed roots", async () => {
    const result = await execute({
      file_path: "/etc/hosts",
      old_string: "x",
      new_string: "y",
    });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("blocked");
  });

  it("has correct aliases", () => {
    expect(editTool.aliases).toContain("edit");
    expect(editTool.aliases).toContain("replace");
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. LIST FILES TOOL
// ═══════════════════════════════════════════════════════════════

describe("list_files tool", () => {
  const execute = listTool.execute;

  it("lists files in a directory", async () => {
    fs.writeFileSync(path.join(testDir, "a.txt"), "");
    fs.writeFileSync(path.join(testDir, "b.txt"), "");
    const result = await execute({ path: testDir });
    expect(result).toContain("a.txt");
    expect(result).toContain("b.txt");
  });

  it("filters by glob pattern", async () => {
    fs.writeFileSync(path.join(testDir, "a.ts"), "");
    fs.writeFileSync(path.join(testDir, "b.js"), "");
    const result = await execute({ path: testDir, pattern: "*.ts" });
    expect(result).toContain("a.ts");
    expect(result).not.toContain("b.js");
  });

  it("recurses into subdirectories", async () => {
    fs.mkdirSync(path.join(testDir, "sub"), { recursive: true });
    fs.writeFileSync(path.join(testDir, "sub", "deep.txt"), "");
    const result = await execute({ path: testDir, pattern: "*.txt" });
    expect(result).toContain("deep.txt");
  });

  it("skips node_modules", async () => {
    fs.mkdirSync(path.join(testDir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(testDir, "node_modules", "pkg.js"), "");
    const result = await execute({ path: testDir });
    expect(result).not.toContain("pkg.js");
  });

  it("returns no-match message for empty results", async () => {
    const result = await execute({ path: testDir, pattern: "*.xyz" });
    expect(result).toContain("No files matching");
  });

  it("blocks paths outside allowed roots", async () => {
    const result = await execute({ path: "/etc" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("blocked");
  });

  it("has correct aliases", () => {
    expect(listTool.aliases).toContain("ls");
    expect(listTool.aliases).toContain("glob");
    expect(listTool.aliases).toContain("find");
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. SEARCH FILES TOOL
// ═══════════════════════════════════════════════════════════════

describe("search_files tool", () => {
  const execute = searchTool.execute;

  it("finds matching lines", async () => {
    fs.writeFileSync(path.join(testDir, "code.ts"), 'const x = "hello";\nconst y = "world";\n');
    const result = await execute({ pattern: "hello", path: testDir });
    expect(result).toContain("hello");
    expect(result).toContain("code.ts");
  });

  it("returns no matches message", async () => {
    fs.writeFileSync(path.join(testDir, "empty.ts"), "nothing here\n");
    const result = await execute({ pattern: "zzzzz", path: testDir });
    expect(result).toContain("No matches");
  });

  it("returns error for missing pattern", async () => {
    const result = await execute({});
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("pattern is required");
  });

  it("returns error for invalid regex", async () => {
    const result = await execute({ pattern: "[invalid", path: testDir });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Invalid regex");
  });

  it("respects glob filter", async () => {
    fs.writeFileSync(path.join(testDir, "a.ts"), "findme\n");
    fs.writeFileSync(path.join(testDir, "b.js"), "findme\n");
    const result = await execute({ pattern: "findme", path: testDir, glob: "*.ts" });
    expect(result).toContain("a.ts");
    expect(result).not.toContain("b.js");
  });

  it("blocks paths outside allowed roots", async () => {
    const result = await execute({ pattern: "root", path: "/etc" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("blocked");
  });

  it("has correct aliases", () => {
    expect(searchTool.aliases).toContain("grep");
    expect(searchTool.aliases).toContain("search");
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. WEB SEARCH TOOL
// ═══════════════════════════════════════════════════════════════

describe("web_search tool", () => {
  const execute = webTool.execute;

  it("returns error for missing query", async () => {
    const result = await execute({});
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("query is required");
  });

  it("has correct parameter schema", () => {
    expect(webTool.parameters.properties!.query).toBeDefined();
    expect(webTool.parameters.properties!.max_results).toBeDefined();
    expect(webTool.parameters.required).toContain("query");
  });

  it("has correct aliases", () => {
    expect(webTool.aliases).toContain("web");
    expect(webTool.aliases).toContain("internet_search");
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. SCREENSHOT TOOL
// ═══════════════════════════════════════════════════════════════

describe("screenshot tool", () => {
  it("has correct schema", () => {
    expect(screenshotTool.id).toBe("screenshot");
    expect(screenshotTool.parameters.properties!.region).toBeDefined();
  });

  it("has correct aliases", () => {
    expect(screenshotTool.aliases).toContain("capture_screen");
    expect(screenshotTool.aliases).toContain("take_screenshot");
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. CAMERA TOOL
// ═══════════════════════════════════════════════════════════════

describe("camera tool", () => {
  it("has correct schema", () => {
    expect(cameraTool.id).toBe("camera");
    expect(cameraTool.parameters.type).toBe("object");
  });

  it("has correct aliases", () => {
    expect(cameraTool.aliases).toContain("webcam");
    expect(cameraTool.aliases).toContain("take_photo");
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. BROWSER TOOL
// ═══════════════════════════════════════════════════════════════

describe("browser tool", () => {
  const execute = browserTool.execute;

  it("returns error for missing action", async () => {
    const result = await execute({});
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("action is required");
  });

  it("returns error for unknown action", async () => {
    const result = await execute({ action: "explode" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Unknown action");
  });

  it("has all action enums in schema", () => {
    const actionEnum = browserTool.parameters.properties!.action.enum as string[];
    expect(actionEnum).toContain("navigate");
    expect(actionEnum).toContain("view");
    expect(actionEnum).toContain("screenshot");
    expect(actionEnum).toContain("click");
    expect(actionEnum).toContain("type");
    expect(actionEnum).toContain("scroll");
    expect(actionEnum).toContain("evaluate");
    expect(actionEnum).toContain("get_text");
    expect(actionEnum).toContain("close");
    expect(actionEnum).toContain("select_option");
    expect(actionEnum).toContain("detect_captcha");
    expect(actionEnum).toContain("get_links");
    expect(actionEnum).toContain("key_press");
    expect(actionEnum).toContain("back");
    expect(actionEnum).toContain("forward");
  });

  it("has correct aliases", () => {
    expect(browserTool.aliases).toContain("browse");
    expect(browserTool.aliases).toContain("web_browser");
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. CONNECTOR TOOL
// ═══════════════════════════════════════════════════════════════

describe("connector tool", () => {
  const execute = connectorTool.execute;

  it("returns error for missing name", async () => {
    const result = await execute({ method: "messages.list" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("name is required");
  });

  it("returns error for missing method", async () => {
    const result = await execute({ name: "gmail" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("method is required");
  });

  it("returns error when connector manager is not set", async () => {
    const result = await execute({ name: "gmail", method: "messages.list" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("not available");
  });

  it("has service name aliases", () => {
    expect(connectorTool.aliases).toContain("gmail");
    expect(connectorTool.aliases).toContain("stripe");
    expect(connectorTool.aliases).toContain("github");
    expect(connectorTool.aliases).toContain("slack");
    expect(connectorTool.aliases).toContain("twilio");
    expect(connectorTool.aliases).toContain("discord");
    expect(connectorTool.aliases).toContain("notion");
    expect(connectorTool.aliases).toContain("linear");
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. SKILL TOOL
// ═══════════════════════════════════════════════════════════════

describe("use_skill tool", () => {
  const execute = skillTool.execute;

  it("returns error for missing action", async () => {
    const result = await execute({});
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("action is required");
  });

  it("returns error for unknown action", async () => {
    const result = await execute({ action: "explode" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Unknown action");
  });

  it("list action returns empty skills when none installed", async () => {
    const result = await execute({ action: "list" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.count).toBe(0);
  });

  it("list action finds installed skills", async () => {
    const skillDir = path.join(testDir, ".jeriko", "skills", "test-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: test-skill\ndescription: A test skill\n---\nBody here\n",
    );

    const result = await execute({ action: "list" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.count).toBe(1);
    expect(parsed.data.skills[0].name).toBe("test-skill");
  });

  it("load action requires name", async () => {
    const result = await execute({ action: "load" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("name is required");
  });

  it("load action loads a skill", async () => {
    const skillDir = path.join(testDir, ".jeriko", "skills", "my-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: My skill\n---\nInstructions here\n",
    );

    const result = await execute({ action: "load", name: "my-skill" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.name).toBe("my-skill");
    expect(parsed.data.instructions).toContain("Instructions here");
  });

  it("read_reference blocks path traversal", async () => {
    const skillDir = path.join(testDir, ".jeriko", "skills", "sec-skill");
    fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: sec-skill\ndescription: x\n---\n");
    fs.writeFileSync(path.join(skillDir, "references", "safe.txt"), "safe content");

    // Normal access works
    const ok = await execute({ action: "read_reference", name: "sec-skill", path: "safe.txt" });
    expect(JSON.parse(ok).ok).toBe(true);

    // Path traversal blocked
    const bad = await execute({ action: "read_reference", name: "sec-skill", path: "../../etc/passwd" });
    expect(JSON.parse(bad).ok).toBe(false);
    expect(JSON.parse(bad).error).toContain("traversal");
  });

  it("run_script blocks path traversal", async () => {
    const skillDir = path.join(testDir, ".jeriko", "skills", "trav-skill");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: trav-skill\ndescription: x\n---\n");

    const result = await execute({
      action: "run_script",
      name: "trav-skill",
      script: "../../etc/malicious.sh",
    });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("traversal");
  });

  it("list_files requires name", async () => {
    const result = await execute({ action: "list_files" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("name is required");
  });

  it("list_files lists skill contents", async () => {
    const skillDir = path.join(testDir, ".jeriko", "skills", "list-skill");
    fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: list-skill\ndescription: x\n---\n");
    fs.writeFileSync(path.join(skillDir, "scripts", "run.sh"), "#!/bin/bash\n");

    const result = await execute({ action: "list_files", name: "list-skill" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.count).toBeGreaterThanOrEqual(2);
  });

  it("has correct aliases", () => {
    expect(skillTool.aliases).toContain("skill");
    expect(skillTool.aliases).toContain("skills");
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. WEBDEV TOOL
// ═══════════════════════════════════════════════════════════════

describe("webdev tool", () => {
  const execute = webdevTool.execute;

  /** Create a minimal test project. */
  function createProject(name: string, opts?: { gitInit?: boolean; scripts?: Record<string, string> }): string {
    const dir = path.join(testDir, ".jeriko", "projects", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name, scripts: opts?.scripts ?? { dev: "echo dev" } }),
    );
    if (opts?.gitInit) {
      spawnSync("git", ["init"], { cwd: dir });
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "init"], { cwd: dir, env: { ...process.env } });
    }
    return dir;
  }

  it("returns error for missing action", async () => {
    const result = await execute({});
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("action is required");
  });

  it("returns error for unknown action", async () => {
    const result = await execute({ action: "explode", project: "x" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Unknown action");
  });

  it("returns error when project not found", async () => {
    const result = await execute({ action: "status", project: "nonexistent" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("not found");
  });

  it("returns error without project or dir", async () => {
    const result = await execute({ action: "status" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("project or dir is required");
  });

  it("status action returns project info", async () => {
    createProject("my-app");
    const result = await execute({ action: "status", project: "my-app" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.project).toBe("my-app");
    expect(parsed.data.server).toBeDefined();
    expect(parsed.data.git).toBeDefined();
  });

  it("status works with dir param", async () => {
    const dir = createProject("dir-app");
    const result = await execute({ action: "status", dir });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.project).toBe("dir-app");
  });

  it("save_checkpoint creates a git commit", async () => {
    const dir = createProject("checkpoint-app");
    fs.writeFileSync(path.join(dir, "hello.txt"), "world");

    const result = await execute({
      action: "save_checkpoint",
      project: "checkpoint-app",
      message: "Add hello",
    });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.hash).toBeTruthy();
    expect(parsed.data.message).toBe("Add hello");
  });

  it("save_checkpoint requires message", async () => {
    createProject("no-msg");
    const result = await execute({ action: "save_checkpoint", project: "no-msg" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("message is required");
  });

  it("versions lists checkpoints", async () => {
    const dir = createProject("version-app");
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    await execute({ action: "save_checkpoint", project: "version-app", message: "first" });
    fs.writeFileSync(path.join(dir, "b.txt"), "b");
    await execute({ action: "save_checkpoint", project: "version-app", message: "second" });

    const result = await execute({ action: "versions", project: "version-app" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.count).toBeGreaterThanOrEqual(2);
  });

  it("rollback requires git repo", async () => {
    createProject("no-git");
    const result = await execute({ action: "rollback", project: "no-git" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("not a git repository");
  });

  it("rollback validates commit hash format", async () => {
    const dir = createProject("hash-check");
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    await execute({ action: "save_checkpoint", project: "hash-check", message: "first" });

    const result = await execute({
      action: "rollback",
      project: "hash-check",
      commit_hash: "invalid!!hash",
    });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Invalid commit hash");
  });

  it("debug_logs returns empty when no logs", async () => {
    createProject("debug-app");
    const result = await execute({ action: "debug_logs", project: "debug-app" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
  });

  it("execute_sql requires query", async () => {
    createProject("sql-app");
    const result = await execute({ action: "execute_sql", project: "sql-app" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("query is required");
  });

  it("push_schema requires drizzle config", async () => {
    createProject("schema-app");
    const result = await execute({ action: "push_schema", project: "schema-app" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("drizzle config");
  });

  it("has all action enums", () => {
    const actions = webdevTool.parameters.properties!.action.enum as string[];
    expect(actions).toContain("status");
    expect(actions).toContain("debug_logs");
    expect(actions).toContain("save_checkpoint");
    expect(actions).toContain("rollback");
    expect(actions).toContain("versions");
    expect(actions).toContain("restart");
    expect(actions).toContain("push_schema");
    expect(actions).toContain("execute_sql");
  });

  it("has correct aliases", () => {
    expect(webdevTool.aliases).toContain("web_dev");
    expect(webdevTool.aliases).toContain("dev_tools");
    expect(webdevTool.aliases).toContain("project");
  });
});

// ═══════════════════════════════════════════════════════════════
// 15. MEMORY TOOL
// ═══════════════════════════════════════════════════════════════

describe("memory tool", () => {
  const execute = memoryTool.execute;

  // Note: memory tool captures HOME at module load time, so it uses the real
  // home directory's MEMORY.md. We save/restore content to avoid pollution.
  let savedMemory: string | null = null;

  beforeEach(async () => {
    // Save existing memory content
    const readResult = await execute({ action: "read" });
    const parsed = JSON.parse(readResult);
    savedMemory = parsed.content || null;
  });

  afterEach(async () => {
    // Restore original memory content
    if (savedMemory) {
      await execute({ action: "write", content: savedMemory });
    }
  });

  it("read returns ok with content field", async () => {
    const result = await execute({ action: "read" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.content).toBe("string");
  });

  it("write stores and read retrieves content", async () => {
    const marker = `audit-test-marker-${Date.now()}`;
    const writeResult = await execute({ action: "write", content: `# Memory\n${marker}` });
    expect(JSON.parse(writeResult).ok).toBe(true);

    const readResult = await execute({ action: "read" });
    const parsed = JSON.parse(readResult);
    expect(parsed.ok).toBe(true);
    expect(parsed.content).toContain(marker);
  });

  it("append adds to existing content", async () => {
    const marker1 = `append-line1-${Date.now()}`;
    const marker2 = `append-line2-${Date.now()}`;
    await execute({ action: "write", content: marker1 });
    await execute({ action: "append", content: marker2 });

    const result = await execute({ action: "read" });
    const parsed = JSON.parse(result);
    expect(parsed.content).toContain(marker1);
    expect(parsed.content).toContain(marker2);
  });

  it("search finds matching lines", async () => {
    const marker = `search-target-${Date.now()}`;
    await execute({ action: "write", content: `Prefers TypeScript\n${marker}\nLikes dark mode` });
    const result = await execute({ action: "search", query: marker });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.count).toBe(1);
    expect(parsed.results[0].text).toContain(marker);
  });

  it("search is case-insensitive", async () => {
    const marker = `CasEtEsT-${Date.now()}`;
    await execute({ action: "write", content: marker });
    const result = await execute({ action: "search", query: marker.toLowerCase() });
    expect(JSON.parse(result).count).toBe(1);
  });

  it("write requires content", async () => {
    const result = await execute({ action: "write" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("content is required");
  });

  it("append requires content", async () => {
    const result = await execute({ action: "append" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("content is required");
  });

  it("search requires query", async () => {
    const result = await execute({ action: "search" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("query is required");
  });

  it("returns error for unknown action", async () => {
    const result = await execute({ action: "delete" });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Unknown action");
  });

  it("enforces size limit", async () => {
    const bigContent = "x".repeat(65 * 1024);
    const result = await execute({ action: "write", content: bigContent });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("limit");
  });

  it("has correct aliases", () => {
    expect(memoryTool.aliases).toContain("remember");
    expect(memoryTool.aliases).toContain("save_memory");
    expect(memoryTool.aliases).toContain("recall");
  });
});

// ═══════════════════════════════════════════════════════════════
// 16. PARALLEL & DELEGATE (mock, schema-only)
// ═══════════════════════════════════════════════════════════════

describe("parallel_tasks tool (mock)", () => {
  it("has correct schema", () => {
    expect(parallelToolMock.id).toBe("parallel_tasks");
    expect(parallelToolMock.parameters.required).toContain("tasks");
  });

  it("has correct aliases", () => {
    expect(parallelToolMock.aliases).toContain("parallel");
    expect(parallelToolMock.aliases).toContain("fan_out");
  });
});

describe("delegate tool (mock)", () => {
  it("has correct schema", () => {
    expect(delegateToolMock.id).toBe("delegate");
    expect(delegateToolMock.parameters.required).toContain("prompt");
  });

  it("has correct aliases", () => {
    expect(delegateToolMock.aliases).toContain("sub_agent");
    expect(delegateToolMock.aliases).toContain("delegate_task");
  });
});

// ═══════════════════════════════════════════════════════════════
// 17. CROSS-CUTTING: PARAMETER VALIDATION
// ═══════════════════════════════════════════════════════════════

describe("parameter validation patterns", () => {
  const toolsToTest: Array<{ tool: ToolDefinition; expectedError: string }> = [
    { tool: bashTool, expectedError: "command is required" },
    { tool: readTool, expectedError: "file_path is required" },
    { tool: writeTool, expectedError: "file_path is required" },
    { tool: editTool, expectedError: "file_path is required" },
    { tool: searchTool, expectedError: "pattern is required" },
    { tool: webTool, expectedError: "query is required" },
    { tool: skillTool, expectedError: "action is required" },
    { tool: webdevTool, expectedError: "action is required" },
    { tool: browserTool, expectedError: "action is required" },
    { tool: connectorTool, expectedError: "name is required" },
  ];

  for (const { tool, expectedError } of toolsToTest) {
    it(`${tool.id}: returns error on empty args`, async () => {
      const result = await tool.execute({});
      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toContain(expectedError);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 18. ERROR HANDLING PATTERNS
// ═══════════════════════════════════════════════════════════════

describe("error handling patterns", () => {
  it("read_file handles non-existent file gracefully", async () => {
    const result = await readTool.execute({
      file_path: path.join(testDir, "no-such-file.txt"),
    });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeTruthy();
  });

  it("edit_file handles non-existent file", async () => {
    const result = await editTool.execute({
      file_path: path.join(testDir, "no-such.txt"),
      old_string: "x",
      new_string: "y",
    });
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeTruthy();
  });

  it("search_files handles non-existent directory", async () => {
    const result = await searchTool.execute({
      pattern: "test",
      path: path.join(testDir, "nonexistent-dir"),
    });
    expect(result).toContain("No matches");
  });

  it("write_file overwrites existing file", async () => {
    const filePath = path.join(testDir, "overwrite.txt");
    fs.writeFileSync(filePath, "original");
    const result = await writeTool.execute({ file_path: filePath, content: "replaced" });
    expect(JSON.parse(result).ok).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("replaced");
  });
});

// ═══════════════════════════════════════════════════════════════
// 19. ALIAS RESOLUTION (with registry)
// ═══════════════════════════════════════════════════════════════

describe("alias resolution via registry", () => {
  beforeEach(() => {
    clearTools();
    registerAll();
  });

  it("bash aliases resolve correctly", () => {
    for (const alias of ["exec", "shell", "run", "execute", "run_command", "terminal"]) {
      expect(getTool(alias)?.id).toBe("bash");
    }
  });

  it("connector service aliases resolve correctly", () => {
    for (const alias of ["gmail", "stripe", "github", "slack", "twilio", "discord"]) {
      expect(getTool(alias)?.id).toBe("connector");
    }
  });

  it("case-insensitive alias resolution", () => {
    expect(getTool("EXEC")?.id).toBe("bash");
    expect(getTool("Shell")?.id).toBe("bash");
    expect(getTool("GMAIL")?.id).toBe("connector");
  });

  it("unknown names return undefined", () => {
    expect(getTool("nonexistent")).toBeUndefined();
    expect(getTool("totally_fake_tool")).toBeUndefined();
  });
});
