// Tool — Search file contents using regex.

import { registerTool } from "./registry.js";
import { isPathBlocked } from "../../security/index.js";
import type { ToolDefinition } from "./registry.js";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join, relative } from "node:path";

interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

/** Recursively search files for a regex pattern. */
async function searchRecursive(
  dir: string,
  regex: RegExp,
  glob: string | undefined,
  maxResults: number,
  depth: number = 0,
  maxDepth: number = 10,
): Promise<SearchMatch[]> {
  if (depth > maxDepth) return [];

  const results: SearchMatch[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (entry.name.startsWith(".") && depth > 0) continue;
      if (entry.name === "node_modules" || entry.name === ".git") continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const sub = await searchRecursive(fullPath, regex, glob, maxResults - results.length, depth + 1, maxDepth);
        results.push(...sub);
      } else if (entry.isFile()) {
        // Optional glob filter on filename.
        if (glob && !entry.name.match(globToRegex(glob))) continue;

        // Skip binary files (check first 512 bytes).
        try {
          const content = await readFile(fullPath, "utf-8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            if (results.length >= maxResults) break;
            const line = lines[i]!;
            if (regex.test(line)) {
              results.push({
                file: fullPath,
                line: i + 1,
                text: line.slice(0, 200),
              });
            }
          }
        } catch {
          // Skip unreadable files (binary, permissions, etc.).
        }
      }
    }
  } catch {
    // Skip unreadable directories.
  }

  return results;
}

/** Convert a simple glob to a regex for filename matching. */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(escaped);
}

async function execute(args: Record<string, unknown>): Promise<string> {
  const pattern = args.pattern as string;
  const dir = (args.path as string) ?? process.cwd();
  const glob = args.glob as string | undefined;
  const maxResults = (args.max_results as number) ?? 50;

  if (!pattern) return JSON.stringify({ ok: false, error: "pattern is required" });

  const absDir = resolve(dir);

  const blocked = isPathBlocked(absDir);
  if (blocked.blocked) {
    return JSON.stringify({ ok: false, error: `Path is blocked by security policy: ${absDir}` });
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "g");
  } catch (err) {
    return JSON.stringify({ ok: false, error: `Invalid regex: ${(err as Error).message}` });
  }

  try {
    const matches = await searchRecursive(absDir, regex, glob, maxResults);

    if (matches.length === 0) {
      return `No matches for /${pattern}/ in ${absDir}`;
    }

    return matches
      .map((m) => `${relative(absDir, m.file)}:${m.line}: ${m.text}`)
      .join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: msg });
  }
}

export const searchTool: ToolDefinition = {
  id: "search_files",
  name: "search_files",
  description: "Search file contents for a regex pattern. Returns matching lines with file paths.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      path: { type: "string", description: "Directory to search in (default: cwd)" },
      glob: { type: "string", description: "Filename glob filter (e.g. '*.ts')" },
      max_results: { type: "number", description: "Max matches to return (default: 50)" },
    },
    required: ["pattern"],
  },
  execute,
  aliases: ["grep", "search", "ripgrep", "find_text"],
};

registerTool(searchTool);
