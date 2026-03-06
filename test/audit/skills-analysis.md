# Skills System Audit Analysis

**Date**: 2026-03-06
**Files audited**:
- `src/shared/skill.ts` — type definitions and constants
- `src/shared/skill-loader.ts` — loader, CRUD, validation, formatting
- `src/daemon/agent/tools/skill.ts` — agent tool (use_skill)
- `src/cli/commands/agent/skill.ts` — CLI command (jeriko skill)
- `test/unit/skill-loader.test.ts` — 34 existing tests
- `test/unit/skill-tool.test.ts` — 31 existing tests

---

## Skill Directory Structure

```
~/.jeriko/skills/
  <name>/
    SKILL.md            # Required — YAML frontmatter + Markdown body
    scripts/            # Optional — executable scripts
    references/         # Optional — reference documents
    templates/          # Optional — template files
```

Skills directory root: `~/.jeriko/skills/` (derived from `$HOME/.jeriko/skills/`).

Each skill is a directory whose name must match the `name` field in SKILL.md frontmatter.

## YAML Frontmatter Format

```yaml
---
name: my-skill                          # Required, must match dir name
description: What this skill does       # Required, min 10 chars
user-invocable: false                   # Optional, default false
allowed-tools: [bash, read_file]        # Optional, inline array
license: MIT                            # Optional
metadata:                               # Optional, nested key-value
  author: Name
  version: 1.0.0
---

# Markdown body follows (loaded on demand)
```

**Key behaviors**:
- Kebab-case keys normalized to camelCase (`user-invocable` -> `userInvocable`)
- Supports: bare strings, quoted strings, booleans (true/false/yes/no), inline arrays, block scalars (`|`), nested metadata
- Unknown top-level keys are silently placed into `metadata`
- Missing `---` delimiters throws immediately

## Types (src/shared/skill.ts)

| Type | Purpose |
|------|---------|
| `SkillMeta` | Parsed frontmatter: name, description, userInvocable?, allowedTools?, license?, metadata? |
| `SkillManifest` | Full skill: meta + dir + body + hasScripts/hasReferences/hasTemplates |
| `SkillSummary` | Lightweight: name + description + userInvocable (for system prompt) |

**Constants**: `SKILL_NAME_PATTERN` (`/^[a-z0-9][a-z0-9-]{1,49}$/`), `SKILL_FILENAME` (`"SKILL.md"`), `MIN_DESCRIPTION_LENGTH` (10)

## Loader Functions (src/shared/skill-loader.ts)

| Function | Signature | Description |
|----------|-----------|-------------|
| `getSkillsDir()` | `() => string` | Returns `$HOME/.jeriko/skills/` |
| `parseFrontmatter(raw)` | `(string) => { meta, body }` | Regex-based YAML parser, throws on missing delimiters/fields |
| `loadSkill(name)` | `(string) => Promise<SkillManifest>` | Reads SKILL.md, parses, checks subdirs |
| `listSkills()` | `() => Promise<SkillSummary[]>` | Lists all valid skills, sorted alphabetically, skips invalid |
| `skillExists(name)` | `(string) => Promise<boolean>` | Checks if SKILL.md exists for given name |
| `validateSkill(dir)` | `(string) => ValidationResult` | Validates: SKILL.md exists, frontmatter valid, name matches dir, name pattern, description length, script executability |
| `scaffoldSkill(name, desc)` | `(string, string) => Promise<string>` | Creates dir + template SKILL.md, validates name/desc first |
| `removeSkill(name)` | `(string) => Promise<void>` | Removes skill directory recursively |
| `formatSkillSummaries(skills)` | `(SkillSummary[]) => string` | Generates Markdown table for system prompt injection |

## Agent Tool (src/daemon/agent/tools/skill.ts)

Tool ID: `use_skill` (aliases: `skill`, `skills`, `load_skill`)

| Action | Required Params | Description |
|--------|----------------|-------------|
| `list` | none | Returns all skills with count |
| `load` | `name` | Returns full instructions + metadata + subdirectory flags |
| `read_reference` | `name`, `path` | Reads a file from `references/` with path traversal protection |
| `run_script` | `name`, `script` | Executes script from `scripts/` via `spawnSync` (30s timeout) |
| `list_files` | `name` | Recursively lists all files in skill dir |

**Security**:
- Path traversal protection on `read_reference` and `run_script` (checks `resolved.startsWith(baseDir)`)
- `spawnSync` with args array (no shell injection)
- Script executable check before running
- `SKILL_NAME` and `SKILL_DIR` env vars injected into script env

## CLI Commands (src/cli/commands/agent/skill.ts)

| Subcommand | Usage | Description |
|------------|-------|-------------|
| `list` | `jeriko skill list` | Lists all installed skills |
| `info <name>` | `jeriko skill info nextjs` | Shows full skill details |
| `create <name>` | `jeriko skill create nextjs --description "..."` | Scaffolds new skill |
| `validate <name>` | `jeriko skill validate nextjs` | Validates skill structure |
| `remove <name>` | `jeriko skill remove nextjs` | Removes a skill |
| `install <path\|url>` | `jeriko skill install ./path` or `jeriko skill install https://...` | Installs from local path or git URL |
| `edit <name>` | `jeriko skill edit nextjs` | Opens SKILL.md in `$EDITOR` |

**Install logic**:
- Git URLs: clones to temp, detects single skill at root or multiple skills in subdirectories
- Local paths: copies directory, validates SKILL.md exists
- Both: overwrites existing skill if present (no confirmation)

## Progressive Loading Strategy

Three-level progressive loading minimizes system prompt size:

1. **Level 1 — Metadata** (always): `kernel.ts` + `backend.ts` call `listSkills()` at boot, inject `formatSkillSummaries()` into system prompt. Agent sees skill names + descriptions in a compact table.

2. **Level 2 — Instructions** (on demand): Agent calls `use_skill` with `action: "load"` to get the full SKILL.md body. Only loaded when the agent decides to use the skill.

3. **Level 3 — Resources** (on demand): Agent calls `read_reference`, `run_script`, or `list_files` to access bundled resources. Only loaded when specific resources are needed.

## Bugs and Issues Found

### Bug 1: FRONTMATTER_RE requires trailing newline after closing `---`
The regex `FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/` requires at least a newline after the YAML block before `---`, meaning a frontmatter block like `---\nname: x\n---` (with the closing `---` immediately at end of file with no trailing content) will match, but `---\nname: x---` without the newline before closing `---` will not. This is technically correct YAML frontmatter behavior, so not a true bug, but worth noting.

### Bug 2: scaffoldSkill description not escaped in YAML
In `scaffoldSkill()`, the description is interpolated directly into the YAML template:
```ts
`description: ${description}`,
```
If the description contains YAML special characters (colons, quotes, `#`), the generated SKILL.md may be unparseable. For example, `scaffoldSkill("test", "Build apps: React, Vue")` would produce `description: Build apps: React, Vue` which actually parses fine with this simple parser, but a description containing `\n` or starting with `[` could cause issues.

### Bug 3: Install from git overwrites without confirmation
Both `installFromGit` and `installFromPath` silently overwrite existing skills with `rmSync`. No confirmation, no backup. This is by design but could lead to data loss.

### Bug 4: No validation on install
Neither `installFromGit` nor `installFromPath` run `validateSkill()` on the installed skill. A user can install an invalid skill that will then be silently skipped by `listSkills()`.

### Observation: Sync operations in async functions
`loadSkill`, `listSkills`, `skillExists`, `scaffoldSkill`, and `removeSkill` are all declared `async` but use only synchronous `fs` operations (`readFileSync`, `existsSync`, `mkdirSync`, etc.). The `async` is unused. Not a bug but creates unnecessary Promise wrapping.

### Test Coverage Gaps (addressed in audit test)
- No test for `run_script` with non-executable script
- No test for CRLF line endings in frontmatter
- No test for empty inline array `[]`
- No test for `walkDir` skipping hidden files
