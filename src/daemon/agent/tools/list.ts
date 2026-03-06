// Tool — List files matching a glob pattern.

import { registerTool } from "./registry.js";
import { isPathBlocked } from "../../security/index.js";
import type { ToolDefinition } from "./registry.js";
import { readdir, stat } from "node:fs/promises";
import { resolve, join, relative } from "node:path";

/**
 * Recursive directory listing with glob-like pattern matching.
 * Uses a simple minimatch-style approach for common patterns.
 */
async function listRecursive(
  dir: string,
  pattern: string,
  maxDepth: number,
  depth: number = 0,
  visitedInodes: Set<string> = new Set(),
): Promise<string[]> {
  if (depth > maxDepth) return [];

  const results: string[] = [];

  try {
    // Detect symlink loops by tracking visited directory inodes
    const dirStat = await stat(dir);
    const inode = `${dirStat.dev}:${dirStat.ino}`;
    if (visitedInodes.has(inode)) return [];
    visitedInodes.add(inode);

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden dirs and node_modules.
      if (entry.name.startsWith(".") && depth > 0) continue;
      if (entry.name === "node_modules") continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const sub = await listRecursive(fullPath, pattern, maxDepth, depth + 1, visitedInodes);
        results.push(...sub);
      } else if (entry.isFile()) {
        if (matchesPattern(entry.name, pattern)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Skip unreadable directories.
  }

  return results;
}

/** Simple glob pattern matching: supports *, **, and ? */
function matchesPattern(filename: string, pattern: string): boolean {
  if (pattern === "*" || pattern === "**/*") return true;

  // Convert glob to regex.
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "__DOUBLESTAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLESTAR__/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${regex}$`).test(filename);
}

async function execute(args: Record<string, unknown>): Promise<string> {
  const dir = (args.path as string) ?? process.cwd();
  const pattern = (args.pattern as string) ?? "*";
  const maxDepth = (args.max_depth as number) ?? 5;

  const absDir = resolve(dir);

  const blocked = isPathBlocked(absDir);
  if (blocked.blocked) {
    return JSON.stringify({ ok: false, error: `Path is blocked by security policy: ${absDir}` });
  }

  try {
    const files = await listRecursive(absDir, pattern, maxDepth);
    const relativeFiles = files.map((f) => relative(absDir, f));

    if (relativeFiles.length === 0) {
      return `No files matching "${pattern}" found in ${absDir}`;
    }

    return relativeFiles.slice(0, 500).join("\n") +
      (relativeFiles.length > 500 ? `\n... (${relativeFiles.length - 500} more)` : "");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: msg });
  }
}

export const listTool: ToolDefinition = {
  id: "list_files",
  name: "list_files",
  description: "List files in a directory matching an optional glob pattern.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory to search in (default: cwd)" },
      pattern: { type: "string", description: "Glob pattern to match (default: '*')" },
      max_depth: { type: "number", description: "Max recursion depth (default: 5)" },
    },
  },
  execute,
  aliases: ["list", "ls", "find", "find_files", "glob"],
};

registerTool(listTool);
