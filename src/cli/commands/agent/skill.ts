// CLI command — jeriko skill
//
// Manage skill packages: list, info, create, validate, remove, install, edit.
// Follows the CommandHandler pattern from dispatcher.ts.

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import {
  loadSkill,
  listSkills,
  skillExists,
  validateSkill,
  scaffoldSkill,
  removeSkill,
  getSkillsDir,
} from "../../../shared/skill-loader.js";
import { SKILL_FILENAME } from "../../../shared/skill.js";
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export const command: CommandHandler = {
  name: "skill",
  description: "Manage skill packages (list, info, create, validate, remove, install, edit)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      printHelp();
      process.exit(0);
    }

    const action = parsed.positional[0];
    if (!action) {
      fail("Missing action. Usage: jeriko skill <list|info|create|validate|remove|install|edit>");
    }

    switch (action) {
      case "list":
        return actionList();
      case "info":
        return actionInfo(parsed.positional[1]);
      case "create":
        return actionCreate(parsed.positional[1], flagStr(parsed, "description"));
      case "validate":
        return actionValidate(parsed.positional[1]);
      case "remove":
        return actionRemove(parsed.positional[1]);
      case "install":
        return actionInstall(parsed.positional[1]);
      case "edit":
        return actionEdit(parsed.positional[1]);
      default:
        fail(`Unknown action: "${action}". Use list, info, create, validate, remove, install, or edit.`);
    }
  },
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function actionList(): Promise<void> {
  const skills = await listSkills();
  ok({
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      userInvocable: s.userInvocable,
    })),
    count: skills.length,
    dir: getSkillsDir(),
  });
}

async function actionInfo(name: string | undefined): Promise<void> {
  if (!name) fail("Missing skill name. Usage: jeriko skill info <name>");

  try {
    const manifest = await loadSkill(name);
    ok({
      name: manifest.meta.name,
      description: manifest.meta.description,
      userInvocable: manifest.meta.userInvocable ?? false,
      allowedTools: manifest.meta.allowedTools ?? [],
      license: manifest.meta.license ?? null,
      metadata: manifest.meta.metadata ?? {},
      dir: manifest.dir,
      hasScripts: manifest.hasScripts,
      hasReferences: manifest.hasReferences,
      hasTemplates: manifest.hasTemplates,
      bodyLength: manifest.body.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(msg, 5);
  }
}

async function actionCreate(name: string | undefined, description: string): Promise<void> {
  if (!name) fail("Missing skill name. Usage: jeriko skill create <name> [--description TEXT]");

  if (!description) {
    fail("Missing --description flag. Usage: jeriko skill create <name> --description \"What this skill does\"");
  }

  try {
    const dir = await scaffoldSkill(name, description);
    ok({ created: true, name, dir });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(msg);
  }
}

async function actionValidate(name: string | undefined): Promise<void> {
  if (!name) fail("Missing skill name. Usage: jeriko skill validate <name>");

  const dir = join(getSkillsDir(), name);
  if (!existsSync(dir)) {
    fail(`Skill "${name}" not found at ${dir}`, 5);
  }

  const result = validateSkill(dir);
  ok({
    name,
    valid: result.valid,
    errors: result.errors,
  });
}

async function actionRemove(name: string | undefined): Promise<void> {
  if (!name) fail("Missing skill name. Usage: jeriko skill remove <name>");

  try {
    await removeSkill(name);
    ok({ removed: true, name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(msg, 5);
  }
}

async function actionInstall(source: string | undefined): Promise<void> {
  if (!source) fail("Missing source. Usage: jeriko skill install <path|git-url>");

  const skillsDir = getSkillsDir();
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  // Git URL — clone into temp and copy
  if (source.startsWith("http://") || source.startsWith("https://") || source.endsWith(".git")) {
    return installFromGit(source, skillsDir);
  }

  // Local path — copy directory
  return installFromPath(source, skillsDir);
}

function installFromGit(url: string, skillsDir: string): void {
  const tmpDir = join(skillsDir, ".tmp-clone");
  try {
    // Clean up any previous failed clone
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }

    // Use spawnSync with args array to avoid shell injection via URL
    const clone = spawnSync("git", ["clone", "--depth", "1", url, tmpDir], {
      timeout: 60000,
      stdio: "pipe",
    });
    if (clone.error) throw clone.error;
    if (clone.status !== 0) {
      const stderr = clone.stderr?.toString().trim() || `git clone exited with code ${clone.status}`;
      throw new Error(stderr);
    }

    // Determine skill name from cloned directory
    const skillFile = join(tmpDir, SKILL_FILENAME);
    if (!existsSync(skillFile)) {
      // Maybe skills are in subdirectories
      const entries = readdirSync(tmpDir, { withFileTypes: true });
      const skillDirs = entries.filter(
        (e) => e.isDirectory() && existsSync(join(tmpDir, e.name, SKILL_FILENAME)),
      );

      if (skillDirs.length === 0) {
        fail("No SKILL.md found in cloned repository");
      }

      // Install each skill found
      const installed: string[] = [];
      for (const entry of skillDirs) {
        const src = join(tmpDir, entry.name);
        const dest = join(skillsDir, entry.name);
        if (existsSync(dest)) {
          rmSync(dest, { recursive: true, force: true });
        }
        cpSync(src, dest, { recursive: true });
        installed.push(entry.name);
      }

      ok({ installed: true, skills: installed, source: url });
      return;
    }

    // Single skill at repo root — use repo basename as name
    const name = basename(url.replace(/\.git$/, "")).replace(/^jeriko-skill-/, "");
    const dest = join(skillsDir, name);
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }
    cpSync(tmpDir, dest, { recursive: true });

    // Remove .git directory from installed skill
    const gitDir = join(dest, ".git");
    if (existsSync(gitDir)) {
      rmSync(gitDir, { recursive: true, force: true });
    }

    ok({ installed: true, name, source: url, dir: dest });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Install failed: ${msg}`);
  } finally {
    // Clean up temp directory
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

function installFromPath(sourcePath: string, skillsDir: string): void {
  const resolved = resolve(sourcePath);

  if (!existsSync(resolved)) {
    fail(`Source path not found: ${resolved}`, 5);
  }

  const skillFile = join(resolved, SKILL_FILENAME);
  if (!existsSync(skillFile)) {
    fail(`No ${SKILL_FILENAME} found in ${resolved}`);
  }

  const name = basename(resolved);
  const dest = join(skillsDir, name);

  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }

  cpSync(resolved, dest, { recursive: true });
  ok({ installed: true, name, source: resolved, dir: dest });
}

async function actionEdit(name: string | undefined): Promise<void> {
  if (!name) fail("Missing skill name. Usage: jeriko skill edit <name>");

  const exists = await skillExists(name);
  if (!exists) {
    fail(`Skill "${name}" not found`, 5);
  }

  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const skillPath = join(getSkillsDir(), name, SKILL_FILENAME);

  try {
    // Use spawnSync to avoid shell injection via $EDITOR value
    const result = spawnSync(editor, [skillPath], {
      stdio: "inherit",
      timeout: 300000, // 5 minutes max
    });
    if (result.error) throw result.error;
    ok({ edited: true, name, path: skillPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Editor failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log("Usage: jeriko skill <action> [options]");
  console.log("\nActions:");
  console.log("  list                              List all installed skills");
  console.log("  info <name>                       Show full skill details");
  console.log("  create <name> [--description TXT] Scaffold a new skill");
  console.log("  validate <name>                   Validate SKILL.md structure");
  console.log("  remove <name>                     Remove a skill");
  console.log("  install <path|url>                Install from path or git URL");
  console.log("  edit <name>                       Open SKILL.md in $EDITOR");
  console.log("\nExamples:");
  console.log("  jeriko skill list --format text");
  console.log('  jeriko skill create nextjs --description "Build Next.js 16 apps with App Router"');
  console.log("  jeriko skill validate nextjs");
  console.log("  jeriko skill install ./my-skills/docker");
  console.log("  jeriko skill install https://github.com/user/jeriko-skill-docker.git");
  console.log("  jeriko skill remove nextjs");
}
