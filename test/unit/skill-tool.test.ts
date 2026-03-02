import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { clearTools, registerTool, getTool } from "../../src/daemon/agent/tools/registry.js";
import { SKILL_FILENAME } from "../../src/shared/skill.js";

// ---------------------------------------------------------------------------
// Test fixtures — temp directory for isolated skill operations
// ---------------------------------------------------------------------------

let testDir: string;
let originalHome: string | undefined;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "jeriko-skill-tool-test-"));
  originalHome = process.env.HOME;
  process.env.HOME = testDir;
  clearTools();
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

/** Create a skill directory with SKILL.md for testing. */
function createTestSkill(
  name: string,
  frontmatter: string,
  body = "",
  opts?: { scripts?: Record<string, string>; references?: Record<string, string> },
): string {
  const dir = path.join(testDir, ".jeriko", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\n${frontmatter}\n---\n${body}`;
  fs.writeFileSync(path.join(dir, SKILL_FILENAME), content, "utf-8");

  if (opts?.scripts) {
    const scriptsDir = path.join(dir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    for (const [filename, scriptContent] of Object.entries(opts.scripts)) {
      const scriptPath = path.join(scriptsDir, filename);
      fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
    }
  }

  if (opts?.references) {
    const refsDir = path.join(dir, "references");
    fs.mkdirSync(refsDir, { recursive: true });
    for (const [filename, refContent] of Object.entries(opts.references)) {
      fs.writeFileSync(path.join(refsDir, filename), refContent, "utf-8");
    }
  }

  return dir;
}

/**
 * Load the skill tool definition and ensure it's in the registry.
 *
 * Bun caches dynamic imports — the module-level registerTool() call only
 * runs once (on first import). Since we clearTools() in beforeEach, we
 * must re-register the exported ToolDefinition each time. On the very
 * first call, the module-level registration may have already fired, so
 * we check before registering to avoid the duplicate error.
 */
async function loadSkillTool() {
  const { skillTool } = await import("../../src/daemon/agent/tools/skill.js");
  if (!getTool(skillTool.id)) {
    registerTool(skillTool);
  }
  return skillTool;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

describe("skill tool registration", () => {
  it("registers with correct id and aliases", async () => {
    const tool = await loadSkillTool();

    expect(tool.id).toBe("use_skill");
    expect(tool.name).toBe("use_skill");
    expect(tool.aliases).toContain("skill");
    expect(tool.aliases).toContain("skills");
    expect(tool.aliases).toContain("load_skill");
  });

  it("has required parameter fields", async () => {
    const tool = await loadSkillTool();

    expect(tool.parameters.properties).toBeDefined();
    expect(tool.parameters.properties!.action).toBeDefined();
    expect(tool.parameters.properties!.name).toBeDefined();
    expect(tool.parameters.required).toContain("action");
  });
});

// ---------------------------------------------------------------------------
// list action
// ---------------------------------------------------------------------------

describe("skill tool — list action", () => {
  it("returns empty list when no skills installed", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "list" }));

    expect(result.ok).toBe(true);
    expect(result.data.skills).toEqual([]);
    expect(result.data.count).toBe(0);
  });

  it("lists installed skills", async () => {
    createTestSkill("alpha", "name: alpha\ndescription: Alpha skill for testing");
    createTestSkill("beta", "name: beta\ndescription: Beta skill for testing\nuser-invocable: true");

    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "list" }));

    expect(result.ok).toBe(true);
    expect(result.data.count).toBe(2);
    expect(result.data.skills[0].name).toBe("alpha");
    expect(result.data.skills[1].name).toBe("beta");
    expect(result.data.skills[1].userInvocable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// load action
// ---------------------------------------------------------------------------

describe("skill tool — load action", () => {
  it("loads full skill instructions", async () => {
    createTestSkill(
      "nextjs",
      "name: nextjs\ndescription: Build Next.js apps with App Router\nallowed-tools: [bash, read_file]",
      "\n## Instructions\n\nUse `npx create-next-app` to scaffold.\n\n## Examples\n\n```bash\nnpx create-next-app my-app\n```",
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "load", name: "nextjs" }));

    expect(result.ok).toBe(true);
    expect(result.data.name).toBe("nextjs");
    expect(result.data.description).toBe("Build Next.js apps with App Router");
    expect(result.data.allowedTools).toEqual(["bash", "read_file"]);
    expect(result.data.instructions).toContain("## Instructions");
    expect(result.data.instructions).toContain("create-next-app");
  });

  it("returns error for missing skill", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "load", name: "nonexistent" }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when name is missing", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "load" }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("name is required");
  });
});

// ---------------------------------------------------------------------------
// read_reference action
// ---------------------------------------------------------------------------

describe("skill tool — read_reference action", () => {
  it("reads a reference file", async () => {
    createTestSkill(
      "docker",
      "name: docker\ndescription: Docker containerization skill",
      "",
      { references: { "dockerfile-guide.md": "# Dockerfile Guide\n\nUse multi-stage builds." } },
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "read_reference", name: "docker", path: "dockerfile-guide.md" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.content).toContain("Dockerfile Guide");
    expect(result.data.content).toContain("multi-stage builds");
  });

  it("returns error for missing reference", async () => {
    createTestSkill("docker", "name: docker\ndescription: Docker containerization skill");

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "read_reference", name: "docker", path: "nonexistent.md" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("prevents path traversal", async () => {
    createTestSkill("docker", "name: docker\ndescription: Docker containerization skill");

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "read_reference", name: "docker", path: "../../etc/passwd" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("traversal");
  });

  it("returns error when name is missing", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "read_reference", path: "file.md" }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("name is required");
  });

  it("returns error when path is missing", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "read_reference", name: "docker" }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("path is required");
  });
});

// ---------------------------------------------------------------------------
// run_script action
// ---------------------------------------------------------------------------

describe("skill tool — run_script action", () => {
  it("executes a skill script", async () => {
    createTestSkill(
      "test-runner",
      "name: test-runner\ndescription: Test runner skill for verification",
      "",
      { scripts: { "hello.sh": "#!/bin/sh\necho 'hello from skill'" } },
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "run_script", name: "test-runner", script: "hello.sh" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.output).toBe("hello from skill");
  });

  it("returns error for missing script", async () => {
    createTestSkill("test-runner", "name: test-runner\ndescription: Test runner skill for verification");

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "run_script", name: "test-runner", script: "missing.sh" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("prevents path traversal in scripts", async () => {
    createTestSkill("test-runner", "name: test-runner\ndescription: Test runner skill for verification");

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "run_script", name: "test-runner", script: "../../etc/passwd" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("traversal");
  });

  it("passes SKILL_NAME and SKILL_DIR env vars", async () => {
    createTestSkill(
      "env-test",
      "name: env-test\ndescription: Environment variable test skill",
      "",
      { scripts: { "env.sh": '#!/bin/sh\necho "$SKILL_NAME"' } },
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "run_script", name: "env-test", script: "env.sh" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.output).toBe("env-test");
  });
});

// ---------------------------------------------------------------------------
// list_files action
// ---------------------------------------------------------------------------

describe("skill tool — list_files action", () => {
  it("lists files in a skill directory", async () => {
    createTestSkill(
      "full-skill",
      "name: full-skill\ndescription: Skill with all resource types",
      "\nBody here.",
      {
        scripts: { "run.sh": "#!/bin/sh\necho hi" },
        references: { "guide.md": "# Guide" },
      },
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "list_files", name: "full-skill" }),
    );

    expect(result.ok).toBe(true);
    expect(result.data.files).toContain(SKILL_FILENAME);
    expect(result.data.files).toContain(path.join("scripts", "run.sh"));
    expect(result.data.files).toContain(path.join("references", "guide.md"));
  });

  it("returns error for missing skill", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "list_files", name: "nonexistent" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("skill tool — error handling", () => {
  it("returns error for missing action", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({}));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("action is required");
  });

  it("returns error for unknown action", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "invalid_action" }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown action");
  });
});
