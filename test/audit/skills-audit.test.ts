// Skills system audit test suite.
//
// Covers: skill-loader (parseFrontmatter, loadSkill, listSkills, scaffoldSkill,
// validateSkill, removeSkill, formatSkillSummaries) and agent tool (use_skill)
// actions (list, load, read_reference, run_script, list_files).
//
// Uses temp directories — no side effects on real ~/.jeriko/skills/.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  parseFrontmatter,
  loadSkill,
  listSkills,
  skillExists,
  validateSkill,
  scaffoldSkill,
  removeSkill,
  formatSkillSummaries,
  getSkillsDir,
} from "../../src/shared/skill-loader.js";
import type { SkillSummary } from "../../src/shared/skill.js";
import {
  SKILL_FILENAME,
  SKILL_NAME_PATTERN,
  MIN_DESCRIPTION_LENGTH,
} from "../../src/shared/skill.js";
import { clearTools, registerTool, getTool } from "../../src/daemon/agent/tools/registry.js";

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------

let testDir: string;
let originalHome: string | undefined;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "jeriko-skills-audit-"));
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

/** Helper to create a skill in the temp dir. */
function createSkill(
  name: string,
  frontmatter: string,
  body = "",
  opts?: {
    scripts?: Record<string, string>;
    references?: Record<string, string>;
    templates?: Record<string, string>;
  },
): string {
  const dir = path.join(testDir, ".jeriko", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\n${frontmatter}\n---\n${body}`;
  fs.writeFileSync(path.join(dir, SKILL_FILENAME), content, "utf-8");

  if (opts?.scripts) {
    const scriptsDir = path.join(dir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    for (const [filename, scriptContent] of Object.entries(opts.scripts)) {
      fs.writeFileSync(path.join(scriptsDir, filename), scriptContent, { mode: 0o755 });
    }
  }

  if (opts?.references) {
    const refsDir = path.join(dir, "references");
    fs.mkdirSync(refsDir, { recursive: true });
    for (const [filename, refContent] of Object.entries(opts.references)) {
      fs.writeFileSync(path.join(refsDir, filename), refContent, "utf-8");
    }
  }

  if (opts?.templates) {
    const tplDir = path.join(dir, "templates");
    fs.mkdirSync(tplDir, { recursive: true });
    for (const [filename, tplContent] of Object.entries(opts.templates)) {
      fs.writeFileSync(path.join(tplDir, filename), tplContent, "utf-8");
    }
  }

  return dir;
}

/** Load the skill tool and ensure it is registered. */
async function loadSkillTool() {
  const { skillTool } = await import("../../src/daemon/agent/tools/skill.js");
  if (!getTool(skillTool.id)) {
    registerTool(skillTool);
  }
  return skillTool;
}

// ===========================================================================
// parseFrontmatter
// ===========================================================================

describe("audit: parseFrontmatter", () => {
  it("parses valid minimal frontmatter", () => {
    const raw = "---\nname: my-skill\ndescription: A valid skill description\n---\nBody text.";
    const { meta, body } = parseFrontmatter(raw);
    expect(meta.name).toBe("my-skill");
    expect(meta.description).toBe("A valid skill description");
    expect(body).toBe("Body text.");
  });

  it("throws on missing frontmatter delimiters", () => {
    expect(() => parseFrontmatter("just some text")).toThrow("YAML frontmatter");
  });

  it("throws on missing opening delimiter", () => {
    expect(() => parseFrontmatter("name: test\n---\n")).toThrow("YAML frontmatter");
  });

  it("throws on missing name field", () => {
    expect(() => parseFrontmatter("---\ndescription: Hello world\n---\n")).toThrow("name");
  });

  it("throws on missing description field", () => {
    expect(() => parseFrontmatter("---\nname: test\n---\n")).toThrow("description");
  });

  it("throws on empty name (empty string)", () => {
    expect(() => parseFrontmatter("---\nname: \ndescription: Hello world foo\n---\n")).toThrow("name");
  });

  it("parses boolean true/false", () => {
    const raw = "---\nname: sk\ndescription: Skill with bool\nuser-invocable: true\n---\n";
    expect(parseFrontmatter(raw).meta.userInvocable).toBe(true);

    const raw2 = "---\nname: sk\ndescription: Skill with bool\nuser-invocable: false\n---\n";
    expect(parseFrontmatter(raw2).meta.userInvocable).toBe(false);
  });

  it("parses yes/no as booleans", () => {
    const raw = "---\nname: sk\ndescription: Skill with yes\nuser-invocable: yes\n---\n";
    expect(parseFrontmatter(raw).meta.userInvocable).toBe(true);

    const raw2 = "---\nname: sk\ndescription: Skill with no\nuser-invocable: no\n---\n";
    expect(parseFrontmatter(raw2).meta.userInvocable).toBe(false);
  });

  it("parses inline array", () => {
    const raw = "---\nname: sk\ndescription: Skill with tools\nallowed-tools: [bash, read_file, web]\n---\n";
    const { meta } = parseFrontmatter(raw);
    expect(meta.allowedTools).toEqual(["bash", "read_file", "web"]);
  });

  it("parses empty inline array", () => {
    const raw = "---\nname: sk\ndescription: Skill with empty tools\nallowed-tools: []\n---\n";
    const { meta } = parseFrontmatter(raw);
    expect(meta.allowedTools).toEqual([]);
  });

  it("parses block scalar description", () => {
    const raw = "---\nname: sk\ndescription: |\n  Line one\n  Line two\n---\n";
    const { meta } = parseFrontmatter(raw);
    expect(meta.description).toBe("Line one\nLine two");
  });

  it("parses nested metadata", () => {
    const raw = "---\nname: sk\ndescription: Skill with metadata\nmetadata:\n  author: Alice\n  version: 2.0\n---\n";
    const { meta } = parseFrontmatter(raw);
    expect(meta.metadata).toBeDefined();
    expect(meta.metadata!.author).toBe("Alice");
    expect(meta.metadata!.version).toBe("2.0");
  });

  it("strips quotes from values", () => {
    const raw = '---\nname: "sk"\ndescription: "A quoted description"\n---\n';
    const { meta } = parseFrontmatter(raw);
    expect(meta.name).toBe("sk");
    expect(meta.description).toBe("A quoted description");
  });

  it("strips single quotes from values", () => {
    const raw = "---\nname: 'sk'\ndescription: 'A single-quoted description'\n---\n";
    const { meta } = parseFrontmatter(raw);
    expect(meta.name).toBe("sk");
  });

  it("converts kebab-case to camelCase", () => {
    const raw = "---\nname: sk\ndescription: A test skill here\nuser-invocable: true\nallowed-tools: [x]\n---\n";
    const { meta } = parseFrontmatter(raw);
    expect(meta.userInvocable).toBe(true);
    expect(meta.allowedTools).toEqual(["x"]);
  });

  it("puts unknown top-level keys into metadata", () => {
    const raw = "---\nname: sk\ndescription: A test skill here\ncustom-field: hello\n---\n";
    const { meta } = parseFrontmatter(raw);
    expect(meta.metadata).toBeDefined();
    expect(meta.metadata!.customField).toBe("hello");
  });

  it("handles empty body", () => {
    const raw = "---\nname: sk\ndescription: A test skill here\n---\n";
    expect(parseFrontmatter(raw).body).toBe("");
  });

  it("skips comment lines in frontmatter", () => {
    const raw = "---\n# comment\nname: sk\n# another comment\ndescription: A test skill here\n---\n";
    const { meta } = parseFrontmatter(raw);
    expect(meta.name).toBe("sk");
    expect(meta.description).toBe("A test skill here");
  });

  it("parses license field", () => {
    const raw = "---\nname: sk\ndescription: Licensed skill here\nlicense: Apache-2.0\n---\n";
    expect(parseFrontmatter(raw).meta.license).toBe("Apache-2.0");
  });
});

// ===========================================================================
// loadSkill
// ===========================================================================

describe("audit: loadSkill", () => {
  it("loads an existing skill with correct manifest", async () => {
    createSkill("my-skill", "name: my-skill\ndescription: A loadable test skill", "\n## Heading\nBody.");
    const manifest = await loadSkill("my-skill");
    expect(manifest.meta.name).toBe("my-skill");
    expect(manifest.body).toContain("## Heading");
    expect(manifest.dir).toBe(path.join(getSkillsDir(), "my-skill"));
    expect(manifest.hasScripts).toBe(false);
    expect(manifest.hasReferences).toBe(false);
    expect(manifest.hasTemplates).toBe(false);
  });

  it("detects scripts, references, and templates subdirectories", async () => {
    createSkill(
      "full-skill",
      "name: full-skill\ndescription: A fully loaded skill",
      "",
      {
        scripts: { "run.sh": "#!/bin/sh\necho ok" },
        references: { "guide.md": "# Guide" },
        templates: { "tmpl.txt": "template" },
      },
    );
    const manifest = await loadSkill("full-skill");
    expect(manifest.hasScripts).toBe(true);
    expect(manifest.hasReferences).toBe(true);
    expect(manifest.hasTemplates).toBe(true);
  });

  it("throws for non-existing skill", async () => {
    await expect(loadSkill("ghost-skill")).rejects.toThrow("not found");
  });
});

// ===========================================================================
// listSkills
// ===========================================================================

describe("audit: listSkills", () => {
  it("returns empty array when skills dir does not exist", async () => {
    expect(await listSkills()).toEqual([]);
  });

  it("returns skills sorted alphabetically", async () => {
    createSkill("zulu", "name: zulu\ndescription: Zulu skill description");
    createSkill("alpha", "name: alpha\ndescription: Alpha skill description");
    createSkill("mike", "name: mike\ndescription: Mike skill description");

    const skills = await listSkills();
    expect(skills.map((s) => s.name)).toEqual(["alpha", "mike", "zulu"]);
  });

  it("includes userInvocable in summaries", async () => {
    createSkill("pub", "name: pub\ndescription: Public skill description\nuser-invocable: true");
    createSkill("priv", "name: priv\ndescription: Private skill description");

    const skills = await listSkills();
    expect(skills.find((s) => s.name === "pub")!.userInvocable).toBe(true);
    expect(skills.find((s) => s.name === "priv")!.userInvocable).toBe(false);
  });

  it("skips dirs without SKILL.md", async () => {
    createSkill("real", "name: real\ndescription: Real skill description");
    fs.mkdirSync(path.join(getSkillsDir(), "fake"), { recursive: true });

    const skills = await listSkills();
    expect(skills.length).toBe(1);
    expect(skills[0]!.name).toBe("real");
  });

  it("skips malformed SKILL.md files silently", async () => {
    createSkill("good", "name: good\ndescription: Good skill description");
    const badDir = path.join(getSkillsDir(), "bad");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, SKILL_FILENAME), "no frontmatter", "utf-8");

    const skills = await listSkills();
    expect(skills.length).toBe(1);
  });
});

// ===========================================================================
// scaffoldSkill
// ===========================================================================

describe("audit: scaffoldSkill", () => {
  it("creates directory with valid SKILL.md", async () => {
    const dir = await scaffoldSkill("new-skill", "A brand new skill for audit testing");
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, SKILL_FILENAME))).toBe(true);

    const content = fs.readFileSync(path.join(dir, SKILL_FILENAME), "utf-8");
    expect(content).toContain("name: new-skill");
    expect(content).toContain("description: A brand new skill for audit testing");
    expect(content).toContain("user-invocable: false");
  });

  it("scaffolded skill passes validation", async () => {
    const dir = await scaffoldSkill("valid-new", "A valid scaffolded skill test");
    const result = validateSkill(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("throws on invalid name (uppercase)", async () => {
    await expect(scaffoldSkill("UPPER", "A description")).rejects.toThrow("Invalid skill name");
  });

  it("throws on single-char name", async () => {
    await expect(scaffoldSkill("x", "A description")).rejects.toThrow("Invalid skill name");
  });

  it("throws on short description", async () => {
    await expect(scaffoldSkill("ok-name", "short")).rejects.toThrow("Description too short");
  });

  it("throws if skill already exists", async () => {
    await scaffoldSkill("once-only", "First creation of this skill");
    await expect(scaffoldSkill("once-only", "Second attempt here")).rejects.toThrow("already exists");
  });
});

// ===========================================================================
// validateSkill
// ===========================================================================

describe("audit: validateSkill", () => {
  it("passes for a correct skill", () => {
    const dir = createSkill("good-skill", "name: good-skill\ndescription: A properly valid skill");
    const result = validateSkill(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when SKILL.md is missing", () => {
    const dir = path.join(testDir, "empty-dir");
    fs.mkdirSync(dir, { recursive: true });
    const result = validateSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("SKILL.md not found");
  });

  it("fails on invalid name pattern", () => {
    const dir = createSkill("BAD-NAME", "name: BAD-NAME\ndescription: Invalid name pattern check");
    const result = validateSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid skill name"))).toBe(true);
  });

  it("fails when name does not match directory", () => {
    const dir = createSkill("dir-name", "name: other-name\ndescription: Mismatched name test skill");
    const result = validateSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("does not match directory"))).toBe(true);
  });

  it("fails on description shorter than minimum", () => {
    const dir = createSkill("short", "name: short\ndescription: tiny");
    const result = validateSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Description too short"))).toBe(true);
  });

  it("detects non-executable scripts", () => {
    const dir = createSkill("has-scripts", "name: has-scripts\ndescription: Skill with scripts check");
    const scriptsDir = path.join(dir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "broken.sh"), "#!/bin/sh\necho hi", { mode: 0o644 });

    const result = validateSkill(dir);
    expect(result.errors.some((e) => e.includes("not executable"))).toBe(true);
  });

  it("passes with executable scripts", () => {
    const dir = createSkill("exec-scripts", "name: exec-scripts\ndescription: Skill with executable scripts");
    const scriptsDir = path.join(dir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "ok.sh"), "#!/bin/sh\necho hi", { mode: 0o755 });

    const result = validateSkill(dir);
    expect(result.valid).toBe(true);
  });

  it("reports multiple errors at once", () => {
    // Name mismatch + short description = 2+ errors
    const dir = createSkill("dir-name2", "name: other-nm\ndescription: tiny");
    const result = validateSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// removeSkill
// ===========================================================================

describe("audit: removeSkill", () => {
  it("removes an existing skill", async () => {
    await scaffoldSkill("doomed", "This skill will be removed soon");
    expect(await skillExists("doomed")).toBe(true);
    await removeSkill("doomed");
    expect(await skillExists("doomed")).toBe(false);
  });

  it("throws when removing non-existing skill", async () => {
    await expect(removeSkill("phantom")).rejects.toThrow("not found");
  });
});

// ===========================================================================
// formatSkillSummaries
// ===========================================================================

describe("audit: formatSkillSummaries", () => {
  it("returns empty string for empty array", () => {
    expect(formatSkillSummaries([])).toBe("");
  });

  it("generates markdown table with correct headers", () => {
    const skills: SkillSummary[] = [
      { name: "docker", description: "Docker skills", userInvocable: false },
    ];
    const result = formatSkillSummaries(skills);
    expect(result).toContain("## Available Skills");
    expect(result).toContain("| Skill | Description | User-Invocable |");
    expect(result).toContain("| docker | Docker skills | No |");
  });

  it("marks user-invocable skills as Yes", () => {
    const skills: SkillSummary[] = [
      { name: "pub", description: "Public skill", userInvocable: true },
    ];
    const result = formatSkillSummaries(skills);
    expect(result).toContain("| pub | Public skill | Yes |");
  });

  it("includes use_skill reference", () => {
    const skills: SkillSummary[] = [
      { name: "x", description: "Skill x here", userInvocable: false },
    ];
    const result = formatSkillSummaries(skills);
    expect(result).toContain("use_skill");
  });
});

// ===========================================================================
// SKILL_NAME_PATTERN constant
// ===========================================================================

describe("audit: SKILL_NAME_PATTERN", () => {
  it("accepts valid names", () => {
    expect(SKILL_NAME_PATTERN.test("ab")).toBe(true);
    expect(SKILL_NAME_PATTERN.test("my-skill")).toBe(true);
    expect(SKILL_NAME_PATTERN.test("skill123")).toBe(true);
    expect(SKILL_NAME_PATTERN.test("a-b-c-d")).toBe(true);
  });

  it("rejects single character", () => {
    expect(SKILL_NAME_PATTERN.test("a")).toBe(false);
  });

  it("rejects uppercase", () => {
    expect(SKILL_NAME_PATTERN.test("MySkill")).toBe(false);
  });

  it("rejects leading hyphen", () => {
    expect(SKILL_NAME_PATTERN.test("-skill")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(SKILL_NAME_PATTERN.test("my skill")).toBe(false);
  });
});

// ===========================================================================
// Agent tool — use_skill
// ===========================================================================

describe("audit: skill tool — registration", () => {
  it("registers with id use_skill and expected aliases", async () => {
    const tool = await loadSkillTool();
    expect(tool.id).toBe("use_skill");
    expect(tool.aliases).toContain("skill");
    expect(tool.aliases).toContain("skills");
    expect(tool.aliases).toContain("load_skill");
  });

  it("requires action parameter", async () => {
    const tool = await loadSkillTool();
    expect(tool.parameters.required).toContain("action");
  });
});

describe("audit: skill tool — list action", () => {
  it("returns empty list when no skills exist", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "list" }));
    expect(result.ok).toBe(true);
    expect(result.data.skills).toEqual([]);
    expect(result.data.count).toBe(0);
  });

  it("returns all installed skills sorted", async () => {
    createSkill("beta", "name: beta\ndescription: Beta skill for listing");
    createSkill("alpha", "name: alpha\ndescription: Alpha skill for listing");

    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "list" }));
    expect(result.ok).toBe(true);
    expect(result.data.count).toBe(2);
    expect(result.data.skills[0].name).toBe("alpha");
    expect(result.data.skills[1].name).toBe("beta");
  });
});

describe("audit: skill tool — load action", () => {
  it("loads skill instructions and metadata", async () => {
    createSkill(
      "docker",
      "name: docker\ndescription: Docker containerization skill\nallowed-tools: [bash, read_file]",
      "\n## How to use Docker\n\nRun containers.",
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "load", name: "docker" }));
    expect(result.ok).toBe(true);
    expect(result.data.name).toBe("docker");
    expect(result.data.allowedTools).toEqual(["bash", "read_file"]);
    expect(result.data.instructions).toContain("How to use Docker");
    expect(result.data.hasScripts).toBe(false);
    expect(result.data.hasReferences).toBe(false);
  });

  it("returns error when name is missing", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "load" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("name is required");
  });

  it("returns error for nonexistent skill", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "load", name: "nope" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("audit: skill tool — read_reference action", () => {
  it("reads a reference file", async () => {
    createSkill(
      "ref-skill",
      "name: ref-skill\ndescription: Skill with references here",
      "",
      { references: { "api.md": "# API Reference\nEndpoint: /v1/data" } },
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "read_reference", name: "ref-skill", path: "api.md" }),
    );
    expect(result.ok).toBe(true);
    expect(result.data.content).toContain("API Reference");
    expect(result.data.content).toContain("/v1/data");
  });

  it("blocks path traversal", async () => {
    createSkill("ref-skill", "name: ref-skill\ndescription: Skill with references here");

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "read_reference", name: "ref-skill", path: "../../../etc/passwd" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("traversal");
  });

  it("returns error for missing reference file", async () => {
    createSkill("ref-skill", "name: ref-skill\ndescription: Skill with references here");

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "read_reference", name: "ref-skill", path: "missing.md" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when name is missing", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "read_reference", path: "x.md" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("name is required");
  });

  it("returns error when path is missing", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "read_reference", name: "x" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("path is required");
  });
});

describe("audit: skill tool — run_script action", () => {
  it("executes a skill script and returns output", async () => {
    createSkill(
      "runner",
      "name: runner\ndescription: Skill with runnable scripts",
      "",
      { scripts: { "greet.sh": "#!/bin/sh\necho 'hello world'" } },
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "run_script", name: "runner", script: "greet.sh" }),
    );
    expect(result.ok).toBe(true);
    expect(result.data.output).toBe("hello world");
  });

  it("passes SKILL_NAME env var to script", async () => {
    createSkill(
      "env-skill",
      "name: env-skill\ndescription: Skill testing environment vars",
      "",
      { scripts: { "name.sh": '#!/bin/sh\necho "$SKILL_NAME"' } },
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "run_script", name: "env-skill", script: "name.sh" }),
    );
    expect(result.ok).toBe(true);
    expect(result.data.output).toBe("env-skill");
  });

  it("returns error for non-executable script", async () => {
    const dir = createSkill(
      "noexec",
      "name: noexec\ndescription: Skill with non-executable script",
    );
    const scriptsDir = path.join(dir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "bad.sh"), "#!/bin/sh\necho hi", { mode: 0o644 });

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "run_script", name: "noexec", script: "bad.sh" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not executable");
  });

  it("blocks path traversal in scripts", async () => {
    createSkill("runner", "name: runner\ndescription: Skill with runnable scripts");

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "run_script", name: "runner", script: "../../etc/passwd" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("traversal");
  });

  it("returns error for missing script", async () => {
    createSkill("runner", "name: runner\ndescription: Skill with runnable scripts");

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "run_script", name: "runner", script: "nope.sh" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when name is missing", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "run_script", script: "x.sh" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("name is required");
  });

  it("returns error when script is missing", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "run_script", name: "x" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("script is required");
  });

  it("returns error for script that exits non-zero", async () => {
    createSkill(
      "fail-skill",
      "name: fail-skill\ndescription: Skill with failing script here",
      "",
      { scripts: { "fail.sh": "#!/bin/sh\nexit 1" } },
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "run_script", name: "fail-skill", script: "fail.sh" }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("audit: skill tool — list_files action", () => {
  it("lists all files in a skill directory", async () => {
    createSkill(
      "rich-skill",
      "name: rich-skill\ndescription: Skill with many resource files",
      "\nBody.",
      {
        scripts: { "build.sh": "#!/bin/sh\necho build" },
        references: { "readme.md": "# Readme" },
        templates: { "config.toml": "[section]" },
      },
    );

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "list_files", name: "rich-skill" }),
    );
    expect(result.ok).toBe(true);
    expect(result.data.files).toContain(SKILL_FILENAME);
    expect(result.data.files).toContain(path.join("scripts", "build.sh"));
    expect(result.data.files).toContain(path.join("references", "readme.md"));
    expect(result.data.files).toContain(path.join("templates", "config.toml"));
    expect(result.data.count).toBe(4);
  });

  it("skips hidden files", async () => {
    const dir = createSkill("hidden-test", "name: hidden-test\ndescription: Skill with hidden files test");
    fs.writeFileSync(path.join(dir, ".hidden"), "secret", "utf-8");

    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "list_files", name: "hidden-test" }),
    );
    expect(result.ok).toBe(true);
    // Should only have SKILL.md, not .hidden
    expect(result.data.files).toContain(SKILL_FILENAME);
    expect(result.data.files).not.toContain(".hidden");
  });

  it("returns error for nonexistent skill", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(
      await tool.execute({ action: "list_files", name: "nope" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when name is missing", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "list_files" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("name is required");
  });
});

describe("audit: skill tool — error handling", () => {
  it("returns error when action is missing", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({}));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("action is required");
  });

  it("returns error for unknown action", async () => {
    const tool = await loadSkillTool();
    const result = JSON.parse(await tool.execute({ action: "destroy" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown action");
  });
});
