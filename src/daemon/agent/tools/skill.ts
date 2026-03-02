// Tool — Skill knowledge loader.
//
// Gives the agent on-demand access to skill instructions and resources.
// Skills are reusable knowledge packages (YAML frontmatter + Markdown)
// that extend agent capabilities without bloating the system prompt.
//
// Three-level progressive loading:
//   1. Metadata (frontmatter) — always in system prompt via kernel injection
//   2. SKILL.md body — loaded on demand via this tool (action: "load")
//   3. Bundled resources — scripts/, references/, templates/ (loaded as needed)
//
// Follows the ToolDefinition pattern from registry.ts.
// Self-registers on import, like connector.ts.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import {
  loadSkill,
  listSkills,
  getSkillsDir,
} from "../../../shared/skill-loader.js";
import { SKILL_FILENAME } from "../../../shared/skill.js";
import { getLogger } from "../../../shared/logger.js";
import { existsSync, accessSync, readdirSync, readFileSync, constants as fsConstants } from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const log = getLogger();

// ---------------------------------------------------------------------------
// Tool implementation
// ---------------------------------------------------------------------------

async function execute(args: Record<string, unknown>): Promise<string> {
  const action = args.action as string;
  if (!action) {
    return JSON.stringify({
      ok: false,
      error: "action is required: list, load, read_reference, run_script, list_files",
    });
  }

  switch (action) {
    case "list":
      return actionList();
    case "load":
      return actionLoad(args.name as string);
    case "read_reference":
      return actionReadReference(args.name as string, args.path as string);
    case "run_script":
      return actionRunScript(args.name as string, args.script as string, args.args as string);
    case "list_files":
      return actionListFiles(args.name as string);
    default:
      return JSON.stringify({
        ok: false,
        error: `Unknown action: "${action}". Use: list, load, read_reference, run_script, list_files`,
      });
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function actionList(): Promise<string> {
  try {
    const skills = await listSkills();
    return JSON.stringify({
      ok: true,
      data: {
        skills: skills.map((s) => ({
          name: s.name,
          description: s.description,
          userInvocable: s.userInvocable,
        })),
        count: skills.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Skill tool list error: ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionLoad(name: string | undefined): Promise<string> {
  if (!name) {
    return JSON.stringify({ ok: false, error: "name is required for load action" });
  }

  try {
    const manifest = await loadSkill(name);
    log.debug(`Skill tool: loaded "${name}" (${manifest.body.length} chars)`);
    return JSON.stringify({
      ok: true,
      data: {
        name: manifest.meta.name,
        description: manifest.meta.description,
        allowedTools: manifest.meta.allowedTools ?? [],
        instructions: manifest.body,
        hasScripts: manifest.hasScripts,
        hasReferences: manifest.hasReferences,
        hasTemplates: manifest.hasTemplates,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Skill tool load error: ${name} — ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionReadReference(
  name: string | undefined,
  filePath: string | undefined,
): Promise<string> {
  if (!name) {
    return JSON.stringify({ ok: false, error: "name is required for read_reference action" });
  }
  if (!filePath) {
    return JSON.stringify({ ok: false, error: "path is required for read_reference action" });
  }

  const refsDir = path.join(getSkillsDir(), name, "references");
  const resolved = path.resolve(refsDir, filePath);

  // Security: prevent path traversal outside the skill's references directory
  if (!resolved.startsWith(refsDir)) {
    return JSON.stringify({ ok: false, error: "Path traversal not allowed" });
  }

  if (!existsSync(resolved)) {
    return JSON.stringify({ ok: false, error: `Reference file not found: ${filePath}` });
  }

  try {
    const content = readFileSync(resolved, "utf-8");
    log.debug(`Skill tool: read reference "${name}/references/${filePath}" (${content.length} chars)`);
    return JSON.stringify({
      ok: true,
      data: { name, path: filePath, content },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionRunScript(
  name: string | undefined,
  script: string | undefined,
  scriptArgs: string | undefined,
): Promise<string> {
  if (!name) {
    return JSON.stringify({ ok: false, error: "name is required for run_script action" });
  }
  if (!script) {
    return JSON.stringify({ ok: false, error: "script is required for run_script action" });
  }

  const scriptsDir = path.join(getSkillsDir(), name, "scripts");
  const scriptPath = path.resolve(scriptsDir, script);

  // Security: prevent path traversal outside the skill's scripts directory
  if (!scriptPath.startsWith(scriptsDir)) {
    return JSON.stringify({ ok: false, error: "Path traversal not allowed" });
  }

  if (!existsSync(scriptPath)) {
    return JSON.stringify({ ok: false, error: `Script not found: ${script}` });
  }

  // Verify executable
  try {
    accessSync(scriptPath, fsConstants.X_OK);
  } catch {
    return JSON.stringify({ ok: false, error: `Script not executable: ${script}` });
  }

  try {
    // Security: use spawnSync with args array instead of execSync with string
    // interpolation. This bypasses the shell entirely, eliminating injection.
    const args = scriptArgs ? scriptArgs.split(/\s+/).filter(Boolean) : [];
    const result = spawnSync(scriptPath, args, {
      timeout: 30000,
      cwd: scriptsDir,
      env: { ...process.env, SKILL_NAME: name, SKILL_DIR: path.join(getSkillsDir(), name) },
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.toString().trim() || `Exit code ${result.status}`;
      return JSON.stringify({ ok: false, error: stderr });
    }

    const output = result.stdout?.toString().trim() ?? "";
    log.debug(`Skill tool: ran script "${name}/scripts/${script}"`);
    return JSON.stringify({
      ok: true,
      data: { name, script, output },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Skill tool run_script error: ${name}/${script} — ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

async function actionListFiles(name: string | undefined): Promise<string> {
  if (!name) {
    return JSON.stringify({ ok: false, error: "name is required for list_files action" });
  }

  const dir = path.join(getSkillsDir(), name);
  if (!existsSync(dir)) {
    return JSON.stringify({ ok: false, error: `Skill "${name}" not found` });
  }

  try {
    const files = walkDir(dir, dir);
    return JSON.stringify({
      ok: true,
      data: { name, files, count: files.length },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: msg });
  }
}

/**
 * Recursively list files in a directory, returning relative paths.
 * Skips hidden files/directories (prefixed with dot).
 */
function walkDir(dir: string, root: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath, root));
    } else {
      files.push(relativePath);
    }
  }

  return files.sort();
}

// ---------------------------------------------------------------------------
// Tool definition + registration
// ---------------------------------------------------------------------------

export const skillTool: ToolDefinition = {
  id: "use_skill",
  name: "use_skill",
  description:
    "Load and use installed skill packages. Skills are reusable knowledge " +
    "packages with instructions, scripts, and references. Use 'list' to see " +
    "available skills, 'load' to get full instructions, 'read_reference' for " +
    "reference docs, 'run_script' to execute skill scripts, 'list_files' to " +
    "see skill contents.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Action to perform: list, load, read_reference, run_script, list_files",
        enum: ["list", "load", "read_reference", "run_script", "list_files"],
      },
      name: {
        type: "string",
        description: "Skill name (required for all actions except list)",
      },
      path: {
        type: "string",
        description: "Relative path to a reference file (for read_reference action)",
      },
      script: {
        type: "string",
        description: "Script filename in the skill's scripts/ directory (for run_script action)",
      },
      args: {
        type: "string",
        description: "Arguments to pass to the script (for run_script action)",
      },
    },
    required: ["action"],
  },
  execute,
  aliases: ["skill", "skills", "load_skill"],
};

registerTool(skillTool);
