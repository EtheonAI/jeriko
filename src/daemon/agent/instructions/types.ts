// Project-instructions discovery — types.
//
// Claude Code, Cursor, and Codex all read `CLAUDE.md` / `AGENTS.md` /
// `.cursor/rules/*.md` files from the user's project so the agent inherits
// project-specific conventions without manual prompting. This subsystem
// ports that pattern to Jeriko while respecting our existing `AGENT.md`
// system prompt: discovered instructions are *appended* to the system
// prompt, never replacing it.

/** One discovered file and its bytes. */
export interface DiscoveredInstructions {
  /** Absolute path. */
  path: string;
  /** Distance from the starting CWD, 0 = CWD itself. */
  depth: number;
  /** File contents (already trimmed). */
  content: string;
  /** One of CLAUDE, AGENTS, JERIKO — used only for logging / diagnostics. */
  kind: "CLAUDE" | "AGENTS" | "JERIKO";
}

/** The assembled prompt fragment after budget truncation. */
export interface InstructionsBlock {
  /** The formatted text ready to paste into the system prompt. */
  text: string;
  /** Source paths that contributed, in order. */
  sources: string[];
  /** True when budget truncation dropped content. */
  truncated: boolean;
}
