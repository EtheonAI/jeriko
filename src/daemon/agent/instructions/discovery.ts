// Walk from CWD up to git-root (or filesystem root) collecting known
// agent-instruction files. Order of discovery: nearest first — CWD's
// CLAUDE.md wins over the grandparent's.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { DiscoveredInstructions } from "./types.js";

const CANONICAL_NAMES: ReadonlyArray<{ name: string; kind: DiscoveredInstructions["kind"] }> = [
  { name: "CLAUDE.md", kind: "CLAUDE" },
  { name: "AGENTS.md", kind: "AGENTS" },
  { name: ".jeriko/instructions.md", kind: "JERIKO" },
];

/** Stop walking up when any of these appear — they mark the repo root. */
const REPO_ROOT_MARKERS = [".git", ".hg", ".svn", "package.json"];

export interface DiscoverOptions {
  /** Directory to start from. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Hard cap on how many parents to check above the starting dir. Default 8. */
  maxDepth?: number;
}

/**
 * Discover instruction files nearest-first.
 *
 * Walking stops at:
 *   • the user's home directory (we never read global `~/CLAUDE.md` — that
 *     belongs in Jeriko's own config, not the project).
 *   • the filesystem root.
 *   • `maxDepth` parents above the starting directory.
 *   • immediately after a directory that contains a repo-root marker, so
 *     we don't leak instructions from unrelated sibling repos.
 */
export function discoverInstructions(opts: DiscoverOptions = {}): DiscoveredInstructions[] {
  const start = resolve(opts.cwd ?? process.cwd());
  const maxDepth = opts.maxDepth ?? 8;
  const home = resolve(homedir());

  const discovered: DiscoveredInstructions[] = [];
  let current = start;
  let depth = 0;

  while (depth <= maxDepth) {
    if (!isDirectory(current)) break;

    for (const { name, kind } of CANONICAL_NAMES) {
      const candidate = join(current, name);
      if (!existsSync(candidate)) continue;
      try {
        const content = readFileSync(candidate, "utf-8").trim();
        if (content) discovered.push({ path: candidate, depth, content, kind });
      } catch {
        // unreadable file — skip silently; hooks config isn't required.
      }
    }

    if (hasRepoMarker(current)) break;

    const parent = dirname(current);
    if (parent === current) break; // filesystem root
    if (current === home) break; // don't escape into home

    current = parent;
    depth++;
  }

  return discovered;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function hasRepoMarker(dir: string): boolean {
  return REPO_ROOT_MARKERS.some((marker) => existsSync(join(dir, marker)));
}
