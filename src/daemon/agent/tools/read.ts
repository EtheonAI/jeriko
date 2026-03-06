// Tool — Read file contents.

import { registerTool } from "./registry.js";
import { isPathAllowed, isPathBlocked } from "../../security/index.js";
import type { ToolDefinition } from "./registry.js";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

async function execute(args: Record<string, unknown>): Promise<string> {
  const filePath = args.file_path as string;
  const offset = (args.offset as number) ?? 0;
  const limit = (args.limit as number) ?? 2000;

  if (!filePath) return JSON.stringify({ ok: false, error: "file_path is required" });

  const absPath = resolve(filePath);

  const blocked = isPathBlocked(absPath);
  if (blocked.blocked) {
    return JSON.stringify({ ok: false, error: `Path is blocked by security policy: ${absPath}` });
  }

  try {
    const info = await stat(absPath);
    if (!info.isFile()) {
      return JSON.stringify({ ok: false, error: `Not a file: ${absPath}` });
    }

    const content = await readFile(absPath, "utf-8");
    if (content.length === 0) return "(empty file)";

    const lines = content.split("\n");
    const sliced = lines.slice(offset, offset + limit);
    return sliced.map((line, i) => `${offset + i + 1}\t${line}`).join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: msg });
  }
}

export const readTool: ToolDefinition = {
  id: "read_file",
  name: "read_file",
  description: "Read a file's contents. Returns numbered lines.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Absolute path to the file to read" },
      offset: { type: "number", description: "Line number to start from (0-based, default: 0)" },
      limit: { type: "number", description: "Max lines to read (default: 2000)" },
    },
    required: ["file_path"],
  },
  execute,
  aliases: ["read", "cat", "view_file"],
};

registerTool(readTool);
