// Layer 0 — Skill loader. Pure functions, no global state.
//
// Core library for all skill operations: parse, load, list, validate,
// scaffold, remove. Follows the config.ts pattern — Node/Bun builtins only.
//
// Skills live in ~/.jeriko/skills/<name>/SKILL.md with YAML frontmatter.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import type { SkillMeta, SkillManifest, SkillSummary } from "./skill.js";
import {
  SKILL_NAME_PATTERN,
  SKILL_FILENAME,
  MIN_DESCRIPTION_LENGTH,
} from "./skill.js";

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/** Return the skills directory: ~/.jeriko/skills/ */
export function getSkillsDir(): string {
  const home = process.env.HOME || os.homedir();
  return path.join(home, ".jeriko", "skills");
}

// ---------------------------------------------------------------------------
// Frontmatter parser — regex-based, zero dependencies
// ---------------------------------------------------------------------------

/** Delimiter for YAML frontmatter blocks. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse YAML frontmatter from a raw SKILL.md string.
 *
 * Handles:
 *   - String values (bare and quoted)
 *   - Boolean values (true/false, yes/no)
 *   - Array values ([a, b, c] inline syntax)
 *   - Multiline string values (| block scalar)
 *   - Nested metadata via indented key: value under a parent key
 *
 * Kebab-case keys are normalized to camelCase:
 *   user-invocable → userInvocable
 *   allowed-tools  → allowedTools
 *
 * @throws Error if frontmatter is missing or required fields are absent.
 */
export function parseFrontmatter(raw: string): { meta: SkillMeta; body: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error("SKILL.md must start with YAML frontmatter (--- delimiters)");
  }

  const yamlBlock = match[1]!;
  const body = match[2]!.trim();

  const meta = parseYamlBlock(yamlBlock);

  // Validate required fields
  if (!meta.name) {
    throw new Error("Frontmatter missing required field: name");
  }
  if (!meta.description) {
    throw new Error("Frontmatter missing required field: description");
  }

  return { meta, body };
}

/**
 * Parse a simple YAML block into SkillMeta.
 * Supports flat key-value pairs, inline arrays, booleans,
 * block scalars (|), and one level of nested mapping (for metadata).
 */
function parseYamlBlock(yaml: string): SkillMeta {
  const lines = yaml.split(/\r?\n/);
  const meta: SkillMeta = { name: "", description: "" };
  const metadataMap: Record<string, string> = {};

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // Skip empty lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    // Top-level key: value
    const kvMatch = line.match(/^([a-z][a-z0-9-]*)\s*:\s*(.*)/i);
    if (!kvMatch) {
      i++;
      continue;
    }

    const rawKey = kvMatch[1]!;
    const rawValue = kvMatch[2]!.trim();
    const key = kebabToCamel(rawKey);

    // Block scalar (|) — collect indented lines
    if (rawValue === "|") {
      const collected: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i]!;
        if (nextLine.match(/^\s+/)) {
          collected.push(nextLine.replace(/^\s{2}/, ""));
          i++;
        } else {
          break;
        }
      }
      assignField(meta, key, collected.join("\n").trim(), metadataMap);
      continue;
    }

    // Nested mapping — next lines are indented key: value pairs
    if (rawValue === "" && key === "metadata") {
      i++;
      while (i < lines.length) {
        const nextLine = lines[i]!;
        const nestedMatch = nextLine.match(/^\s{2,}([a-z][a-z0-9-]*)\s*:\s*(.*)/i);
        if (nestedMatch) {
          metadataMap[nestedMatch[1]!] = stripQuotes(nestedMatch[2]!.trim());
          i++;
        } else if (nextLine.trim() === "" || nextLine.trim().startsWith("#")) {
          i++;
        } else {
          break;
        }
      }
      continue;
    }

    // Inline array: [a, b, c]
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const items = rawValue
        .slice(1, -1)
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter((s) => s.length > 0);
      assignField(meta, key, items, metadataMap);
      i++;
      continue;
    }

    // Boolean
    const lower = rawValue.toLowerCase();
    if (lower === "true" || lower === "yes") {
      assignField(meta, key, true, metadataMap);
      i++;
      continue;
    }
    if (lower === "false" || lower === "no") {
      assignField(meta, key, false, metadataMap);
      i++;
      continue;
    }

    // String value
    assignField(meta, key, stripQuotes(rawValue), metadataMap);
    i++;
  }

  // Attach metadata map if it has entries
  if (Object.keys(metadataMap).length > 0) {
    meta.metadata = metadataMap;
  }

  return meta;
}

/** Assign a parsed value to the correct SkillMeta field. */
function assignField(
  meta: SkillMeta,
  key: string,
  value: string | boolean | string[],
  metadataMap: Record<string, string>,
): void {
  switch (key) {
    case "name":
      meta.name = value as string;
      break;
    case "description":
      meta.description = value as string;
      break;
    case "userInvocable":
      meta.userInvocable = value as boolean;
      break;
    case "allowedTools":
      meta.allowedTools = value as string[];
      break;
    case "license":
      meta.license = value as string;
      break;
    default:
      // Unknown top-level keys go into metadata
      if (typeof value === "string") {
        metadataMap[key] = value;
      }
      break;
  }
}

/** Convert kebab-case to camelCase. */
function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Strip surrounding quotes (single or double) from a string. */
function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Skill CRUD operations
// ---------------------------------------------------------------------------

/**
 * Load a skill by name from the skills directory.
 *
 * Reads SKILL.md, parses frontmatter, checks for optional subdirectories.
 * Throws if the skill doesn't exist or SKILL.md is malformed.
 */
export async function loadSkill(name: string): Promise<SkillManifest> {
  const dir = path.join(getSkillsDir(), name);
  const skillPath = path.join(dir, SKILL_FILENAME);

  if (!fs.existsSync(skillPath)) {
    throw new Error(`Skill "${name}" not found at ${skillPath}`);
  }

  const raw = fs.readFileSync(skillPath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);

  return {
    meta,
    dir,
    body,
    hasScripts: fs.existsSync(path.join(dir, "scripts")),
    hasReferences: fs.existsSync(path.join(dir, "references")),
    hasTemplates: fs.existsSync(path.join(dir, "templates")),
  };
}

/**
 * List all installed skills, returning lightweight summaries.
 * Sorted alphabetically by name. Invalid skills are silently skipped.
 */
export async function listSkills(): Promise<SkillSummary[]> {
  const dir = getSkillsDir();
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const summaries: SkillSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = path.join(dir, entry.name, SKILL_FILENAME);
    if (!fs.existsSync(skillPath)) continue;

    try {
      const raw = fs.readFileSync(skillPath, "utf-8");
      const { meta } = parseFrontmatter(raw);
      summaries.push({
        name: meta.name,
        description: meta.description,
        userInvocable: meta.userInvocable ?? false,
      });
    } catch {
      // Silently skip malformed skills — don't crash listing
    }
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Check whether a skill with the given name exists.
 */
export async function skillExists(name: string): Promise<boolean> {
  const skillPath = path.join(getSkillsDir(), name, SKILL_FILENAME);
  return fs.existsSync(skillPath);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a skill directory.
 *
 * Checks:
 *   - SKILL.md exists
 *   - Valid frontmatter with required fields
 *   - Name matches directory name
 *   - Name matches naming pattern
 *   - Description meets minimum length
 *   - allowed-tools (if present) is an array of strings
 *   - Scripts in scripts/ are executable
 */
export function validateSkill(dir: string): ValidationResult {
  const errors: string[] = [];
  const dirName = path.basename(dir);

  // SKILL.md must exist
  const skillPath = path.join(dir, SKILL_FILENAME);
  if (!fs.existsSync(skillPath)) {
    return { valid: false, errors: [`${SKILL_FILENAME} not found in ${dir}`] };
  }

  // Parse frontmatter
  let meta: SkillMeta;
  try {
    const raw = fs.readFileSync(skillPath, "utf-8");
    const result = parseFrontmatter(raw);
    meta = result.meta;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [msg] };
  }

  // Name validation
  if (!SKILL_NAME_PATTERN.test(meta.name)) {
    errors.push(
      `Invalid skill name "${meta.name}": must be lowercase alphanumeric + hyphens, 2-50 chars`,
    );
  }

  // Name must match directory
  if (meta.name !== dirName) {
    errors.push(
      `Skill name "${meta.name}" does not match directory name "${dirName}"`,
    );
  }

  // Description length
  if (meta.description.length < MIN_DESCRIPTION_LENGTH) {
    errors.push(
      `Description too short (${meta.description.length} chars, minimum ${MIN_DESCRIPTION_LENGTH})`,
    );
  }

  // Allowed tools must be string array
  if (meta.allowedTools !== undefined) {
    if (!Array.isArray(meta.allowedTools)) {
      errors.push("allowed-tools must be an array");
    } else if (meta.allowedTools.some((t) => typeof t !== "string")) {
      errors.push("allowed-tools entries must be strings");
    }
  }

  // Check scripts are executable (unix only)
  const scriptsDir = path.join(dir, "scripts");
  if (fs.existsSync(scriptsDir)) {
    try {
      const scripts = fs.readdirSync(scriptsDir);
      for (const script of scripts) {
        const scriptPath = path.join(scriptsDir, script);
        const stat = fs.statSync(scriptPath);
        if (stat.isFile()) {
          try {
            fs.accessSync(scriptPath, fs.constants.X_OK);
          } catch {
            errors.push(`Script not executable: scripts/${script}`);
          }
        }
      }
    } catch {
      errors.push("Failed to read scripts/ directory");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Scaffold
// ---------------------------------------------------------------------------

/**
 * Scaffold a new skill directory with a template SKILL.md.
 *
 * @returns Absolute path to the created skill directory.
 * @throws if the skill already exists or the name is invalid.
 */
export async function scaffoldSkill(name: string, description: string): Promise<string> {
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid skill name "${name}": must be lowercase alphanumeric + hyphens, 2-50 chars`,
    );
  }

  if (description.length < MIN_DESCRIPTION_LENGTH) {
    throw new Error(
      `Description too short (${description.length} chars, minimum ${MIN_DESCRIPTION_LENGTH})`,
    );
  }

  const dir = path.join(getSkillsDir(), name);
  if (fs.existsSync(dir)) {
    throw new Error(`Skill "${name}" already exists at ${dir}`);
  }

  // Create skill directory structure
  fs.mkdirSync(dir, { recursive: true });

  // Write template SKILL.md
  const template = [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "user-invocable: false",
    "---",
    "",
    `# ${name}`,
    "",
    "## Instructions",
    "",
    "Add your skill instructions here. This content is loaded on demand",
    "when the agent invokes `use_skill` with this skill's name.",
    "",
    "## Examples",
    "",
    "```",
    "# Add usage examples here",
    "```",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(dir, SKILL_FILENAME), template, "utf-8");

  return dir;
}

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

/**
 * Remove a skill by name.
 *
 * @throws if the skill doesn't exist.
 */
export async function removeSkill(name: string): Promise<void> {
  const dir = path.join(getSkillsDir(), name);
  if (!fs.existsSync(dir)) {
    throw new Error(`Skill "${name}" not found`);
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// System prompt formatting
// ---------------------------------------------------------------------------

/**
 * Format skill summaries into a Markdown section for system prompt injection.
 *
 * Generates a compact table of available skills that the agent can reference.
 * Full skill instructions are loaded on demand via the `use_skill` tool.
 */
export function formatSkillSummaries(skills: SkillSummary[]): string {
  if (skills.length === 0) return "";

  const lines = [
    "## Available Skills",
    "Use `use_skill` tool to load full instructions when needed.",
    "",
    "| Skill | Description | User-Invocable |",
    "|-------|-------------|----------------|",
  ];

  for (const skill of skills) {
    const invocable = skill.userInvocable ? "Yes" : "No";
    lines.push(`| ${skill.name} | ${skill.description} | ${invocable} |`);
  }

  return lines.join("\n");
}
