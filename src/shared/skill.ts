// Layer 0 — Skill type definitions.
//
// Shared types used by both CLI commands and daemon tools.
// Follows the same pattern as connector.ts — pure type exports,
// no runtime dependencies, no global state.

// ---------------------------------------------------------------------------
// Skill name validation
// ---------------------------------------------------------------------------

/** Valid skill name: lowercase alphanumeric + hyphens, 2-50 chars. */
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/;

/** Required filename for skill instructions. */
export const SKILL_FILENAME = "SKILL.md";

/** Minimum description length (characters). */
export const MIN_DESCRIPTION_LENGTH = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Skill metadata — parsed from YAML frontmatter of SKILL.md.
 *
 * Frontmatter uses kebab-case keys (user-invocable, allowed-tools),
 * which are normalized to camelCase during parsing.
 */
export interface SkillMeta {
  /** Machine name — must match the directory name. */
  name: string;
  /** What the skill does and when the agent should use it. */
  description: string;
  /** Whether users can trigger this skill directly (default: false). */
  userInvocable?: boolean;
  /** Tools this skill is allowed to use (empty = no restriction). */
  allowedTools?: string[];
  /** License identifier (e.g. "MIT", "Apache-2.0"). */
  license?: string;
  /** Arbitrary key-value metadata (author, version, source, etc.). */
  metadata?: Record<string, string>;
}

/**
 * Full skill manifest — metadata + resolved paths + body content.
 * Returned by loadSkill() after reading and parsing SKILL.md.
 */
export interface SkillManifest {
  /** Parsed frontmatter metadata. */
  meta: SkillMeta;
  /** Absolute path to the skill directory. */
  dir: string;
  /** Markdown body content (everything below the frontmatter). */
  body: string;
  /** Whether the skill has a scripts/ subdirectory. */
  hasScripts: boolean;
  /** Whether the skill has a references/ subdirectory. */
  hasReferences: boolean;
  /** Whether the skill has a templates/ subdirectory. */
  hasTemplates: boolean;
}

/**
 * Lightweight skill summary — used for system prompt injection.
 * Only the minimum info needed for the agent to know a skill exists.
 */
export interface SkillSummary {
  name: string;
  description: string;
  userInvocable: boolean;
}
