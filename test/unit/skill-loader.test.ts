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
import { SKILL_FILENAME } from "../../src/shared/skill.js";

// ---------------------------------------------------------------------------
// Test fixtures — temp directory for isolated skill operations
// ---------------------------------------------------------------------------

let testDir: string;
let originalHome: string | undefined;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "jeriko-skill-test-"));
  // Override HOME so getSkillsDir() points to our temp directory
  originalHome = process.env.HOME;
  process.env.HOME = testDir;
});

afterEach(() => {
  // Restore HOME
  if (originalHome !== undefined) {
    process.env.HOME = originalHome;
  } else {
    delete process.env.HOME;
  }
  // Clean up
  fs.rmSync(testDir, { recursive: true, force: true });
});

/** Create a skill directory with a SKILL.md for testing. */
function createTestSkill(name: string, frontmatter: string, body = ""): string {
  const dir = path.join(testDir, ".jeriko", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\n${frontmatter}\n---\n${body}`;
  fs.writeFileSync(path.join(dir, SKILL_FILENAME), content, "utf-8");
  return dir;
}

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("parses minimal valid frontmatter", () => {
    const raw = "---\nname: test-skill\ndescription: A test skill for testing\n---\nBody content here.";
    const { meta, body } = parseFrontmatter(raw);

    expect(meta.name).toBe("test-skill");
    expect(meta.description).toBe("A test skill for testing");
    expect(body).toBe("Body content here.");
  });

  it("parses boolean fields", () => {
    const raw = "---\nname: my-skill\ndescription: Skill with bool\nuser-invocable: true\n---\n";
    const { meta } = parseFrontmatter(raw);

    expect(meta.userInvocable).toBe(true);
  });

  it("parses false boolean values", () => {
    const raw = "---\nname: my-skill\ndescription: Skill with bool\nuser-invocable: false\n---\n";
    const { meta } = parseFrontmatter(raw);

    expect(meta.userInvocable).toBe(false);
  });

  it("parses yes/no booleans", () => {
    const raw = "---\nname: my-skill\ndescription: Skill with bool\nuser-invocable: yes\n---\n";
    const { meta } = parseFrontmatter(raw);

    expect(meta.userInvocable).toBe(true);
  });

  it("parses inline array values", () => {
    const raw = "---\nname: my-skill\ndescription: Skill with tools\nallowed-tools: [bash, read_file, web_search]\n---\n";
    const { meta } = parseFrontmatter(raw);

    expect(meta.allowedTools).toEqual(["bash", "read_file", "web_search"]);
  });

  it("parses quoted array values", () => {
    const raw = '---\nname: my-skill\ndescription: Skill with tools\nallowed-tools: ["bash", "read_file"]\n---\n';
    const { meta } = parseFrontmatter(raw);

    expect(meta.allowedTools).toEqual(["bash", "read_file"]);
  });

  it("parses block scalar description", () => {
    const raw = "---\nname: my-skill\ndescription: |\n  A multi-line\n  description here\n---\n";
    const { meta } = parseFrontmatter(raw);

    expect(meta.description).toBe("A multi-line\ndescription here");
  });

  it("parses nested metadata", () => {
    const raw = [
      "---",
      "name: my-skill",
      "description: Skill with metadata",
      "metadata:",
      "  author: Test Author",
      "  version: 1.0.0",
      "  source: https://example.com",
      "---",
      "",
    ].join("\n");
    const { meta } = parseFrontmatter(raw);

    expect(meta.metadata).toBeDefined();
    expect(meta.metadata!.author).toBe("Test Author");
    expect(meta.metadata!.version).toBe("1.0.0");
    expect(meta.metadata!.source).toBe("https://example.com");
  });

  it("parses license field", () => {
    const raw = "---\nname: my-skill\ndescription: Licensed skill\nlicense: MIT\n---\n";
    const { meta } = parseFrontmatter(raw);

    expect(meta.license).toBe("MIT");
  });

  it("strips surrounding quotes from values", () => {
    const raw = '---\nname: "my-skill"\ndescription: "A quoted description"\n---\n';
    const { meta } = parseFrontmatter(raw);

    expect(meta.name).toBe("my-skill");
    expect(meta.description).toBe("A quoted description");
  });

  it("converts kebab-case keys to camelCase", () => {
    const raw = "---\nname: my-skill\ndescription: Test kebab case\nuser-invocable: true\nallowed-tools: [bash]\n---\n";
    const { meta } = parseFrontmatter(raw);

    expect(meta.userInvocable).toBe(true);
    expect(meta.allowedTools).toEqual(["bash"]);
  });

  it("throws on missing frontmatter delimiters", () => {
    expect(() => parseFrontmatter("No frontmatter here")).toThrow("YAML frontmatter");
  });

  it("throws on missing name field", () => {
    const raw = "---\ndescription: Missing name\n---\n";
    expect(() => parseFrontmatter(raw)).toThrow("name");
  });

  it("throws on missing description field", () => {
    const raw = "---\nname: test-skill\n---\n";
    expect(() => parseFrontmatter(raw)).toThrow("description");
  });

  it("skips comment lines in frontmatter", () => {
    const raw = "---\n# This is a comment\nname: my-skill\ndescription: Skill with comments\n---\n";
    const { meta } = parseFrontmatter(raw);

    expect(meta.name).toBe("my-skill");
  });

  it("stores unknown top-level keys in metadata", () => {
    const raw = "---\nname: my-skill\ndescription: Skill with extras\ncustom-key: custom value\n---\n";
    const { meta } = parseFrontmatter(raw);

    expect(meta.metadata).toBeDefined();
    expect(meta.metadata!.customKey).toBe("custom value");
  });

  it("handles multiline body with markdown", () => {
    const raw = "---\nname: test\ndescription: Test skill body\n---\n# Heading\n\nParagraph with **bold** text.\n\n- List item 1\n- List item 2";
    const { body } = parseFrontmatter(raw);

    expect(body).toContain("# Heading");
    expect(body).toContain("**bold**");
    expect(body).toContain("- List item 1");
  });

  it("handles empty body", () => {
    const raw = "---\nname: test\ndescription: Empty body skill\n---\n";
    const { body } = parseFrontmatter(raw);

    expect(body).toBe("");
  });
});

// ---------------------------------------------------------------------------
// loadSkill
// ---------------------------------------------------------------------------

describe("loadSkill", () => {
  it("loads a valid skill", async () => {
    createTestSkill("test-skill", "name: test-skill\ndescription: A valid test skill", "\n## Instructions\nDo things.");

    const manifest = await loadSkill("test-skill");
    expect(manifest.meta.name).toBe("test-skill");
    expect(manifest.meta.description).toBe("A valid test skill");
    expect(manifest.body).toContain("## Instructions");
    expect(manifest.hasScripts).toBe(false);
    expect(manifest.hasReferences).toBe(false);
    expect(manifest.hasTemplates).toBe(false);
  });

  it("detects optional subdirectories", async () => {
    const dir = createTestSkill("full-skill", "name: full-skill\ndescription: Skill with all dirs");
    fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(dir, "references"), { recursive: true });
    fs.mkdirSync(path.join(dir, "templates"), { recursive: true });

    const manifest = await loadSkill("full-skill");
    expect(manifest.hasScripts).toBe(true);
    expect(manifest.hasReferences).toBe(true);
    expect(manifest.hasTemplates).toBe(true);
  });

  it("throws on missing skill", async () => {
    await expect(loadSkill("nonexistent")).rejects.toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// listSkills
// ---------------------------------------------------------------------------

describe("listSkills", () => {
  it("returns empty array when no skills directory exists", async () => {
    const skills = await listSkills();
    expect(skills).toEqual([]);
  });

  it("lists installed skills sorted by name", async () => {
    createTestSkill("beta-skill", "name: beta-skill\ndescription: The beta skill");
    createTestSkill("alpha-skill", "name: alpha-skill\ndescription: The alpha skill");

    const skills = await listSkills();
    expect(skills.length).toBe(2);
    expect(skills[0]!.name).toBe("alpha-skill");
    expect(skills[1]!.name).toBe("beta-skill");
  });

  it("includes userInvocable flag in summaries", async () => {
    createTestSkill("invocable", "name: invocable\ndescription: An invocable skill\nuser-invocable: true");
    createTestSkill("internal", "name: internal\ndescription: An internal skill");

    const skills = await listSkills();
    const invocable = skills.find((s) => s.name === "invocable");
    const internal = skills.find((s) => s.name === "internal");

    expect(invocable!.userInvocable).toBe(true);
    expect(internal!.userInvocable).toBe(false);
  });

  it("skips directories without SKILL.md", async () => {
    createTestSkill("valid-skill", "name: valid-skill\ndescription: A valid skill here");
    // Create a directory without SKILL.md
    const emptyDir = path.join(testDir, ".jeriko", "skills", "empty-dir");
    fs.mkdirSync(emptyDir, { recursive: true });

    const skills = await listSkills();
    expect(skills.length).toBe(1);
    expect(skills[0]!.name).toBe("valid-skill");
  });

  it("skips malformed skills silently", async () => {
    createTestSkill("good-skill", "name: good-skill\ndescription: A good skill here");
    // Create a skill with invalid frontmatter
    const badDir = path.join(testDir, ".jeriko", "skills", "bad-skill");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, SKILL_FILENAME), "No frontmatter here", "utf-8");

    const skills = await listSkills();
    expect(skills.length).toBe(1);
    expect(skills[0]!.name).toBe("good-skill");
  });
});

// ---------------------------------------------------------------------------
// skillExists
// ---------------------------------------------------------------------------

describe("skillExists", () => {
  it("returns true for existing skill", async () => {
    createTestSkill("existing", "name: existing\ndescription: An existing skill");
    expect(await skillExists("existing")).toBe(true);
  });

  it("returns false for non-existing skill", async () => {
    expect(await skillExists("nonexistent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateSkill
// ---------------------------------------------------------------------------

describe("validateSkill", () => {
  it("validates a correct skill", () => {
    const dir = createTestSkill("valid-skill", "name: valid-skill\ndescription: A perfectly valid test skill");
    const result = validateSkill(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when SKILL.md is missing", () => {
    const dir = path.join(testDir, "no-skill");
    fs.mkdirSync(dir, { recursive: true });

    const result = validateSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("SKILL.md not found");
  });

  it("fails on invalid name pattern", () => {
    const dir = createTestSkill("INVALID", "name: INVALID\ndescription: Invalid name pattern skill");
    const result = validateSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid skill name"))).toBe(true);
  });

  it("fails when name does not match directory", () => {
    const dir = createTestSkill("dir-name", "name: different-name\ndescription: Name mismatch test skill");
    const result = validateSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("does not match directory"))).toBe(true);
  });

  it("fails on short description", () => {
    const dir = createTestSkill("short-desc", "name: short-desc\ndescription: short");
    const result = validateSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Description too short"))).toBe(true);
  });

  it("checks script executability", () => {
    const dir = createTestSkill("script-skill", "name: script-skill\ndescription: Skill with scripts inside");
    const scriptsDir = path.join(dir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    // Create a non-executable script
    fs.writeFileSync(path.join(scriptsDir, "test.sh"), "#!/bin/sh\necho hello", { mode: 0o644 });

    const result = validateSkill(dir);
    expect(result.errors.some((e) => e.includes("not executable"))).toBe(true);
  });

  it("passes with executable scripts", () => {
    const dir = createTestSkill("exec-skill", "name: exec-skill\ndescription: Skill with executable scripts");
    const scriptsDir = path.join(dir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "test.sh"), "#!/bin/sh\necho hello", { mode: 0o755 });

    const result = validateSkill(dir);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scaffoldSkill
// ---------------------------------------------------------------------------

describe("scaffoldSkill", () => {
  it("creates a skill directory with SKILL.md", async () => {
    const dir = await scaffoldSkill("new-skill", "A brand new skill for testing");

    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, SKILL_FILENAME))).toBe(true);

    const content = fs.readFileSync(path.join(dir, SKILL_FILENAME), "utf-8");
    expect(content).toContain("name: new-skill");
    expect(content).toContain("description: A brand new skill for testing");
  });

  it("creates a valid skill that passes validation", async () => {
    const dir = await scaffoldSkill("valid-scaffold", "A scaffolded skill for validation testing");
    const result = validateSkill(dir);
    expect(result.valid).toBe(true);
  });

  it("throws on invalid name", async () => {
    await expect(scaffoldSkill("INVALID", "A description here")).rejects.toThrow("Invalid skill name");
  });

  it("throws on short description", async () => {
    await expect(scaffoldSkill("test", "short")).rejects.toThrow("Description too short");
  });

  it("throws if skill already exists", async () => {
    await scaffoldSkill("existing-skill", "First creation of the skill");
    await expect(scaffoldSkill("existing-skill", "Second creation attempt")).rejects.toThrow("already exists");
  });
});

// ---------------------------------------------------------------------------
// removeSkill
// ---------------------------------------------------------------------------

describe("removeSkill", () => {
  it("removes an existing skill", async () => {
    await scaffoldSkill("removable", "A skill that will be removed");
    expect(await skillExists("removable")).toBe(true);

    await removeSkill("removable");
    expect(await skillExists("removable")).toBe(false);
  });

  it("throws when removing non-existing skill", async () => {
    await expect(removeSkill("ghost")).rejects.toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// formatSkillSummaries
// ---------------------------------------------------------------------------

describe("formatSkillSummaries", () => {
  it("returns empty string for no skills", () => {
    expect(formatSkillSummaries([])).toBe("");
  });

  it("generates a markdown table", () => {
    const skills: SkillSummary[] = [
      { name: "nextjs", description: "Build Next.js apps", userInvocable: false },
      { name: "vitest", description: "Vitest testing framework", userInvocable: true },
    ];

    const result = formatSkillSummaries(skills);
    expect(result).toContain("## Available Skills");
    expect(result).toContain("use_skill");
    expect(result).toContain("| nextjs | Build Next.js apps | No |");
    expect(result).toContain("| vitest | Vitest testing framework | Yes |");
  });
});

// ---------------------------------------------------------------------------
// getSkillsDir
// ---------------------------------------------------------------------------

describe("getSkillsDir", () => {
  it("returns path under home directory", () => {
    const dir = getSkillsDir();
    expect(dir).toContain(".jeriko");
    expect(dir).toContain("skills");
  });
});
