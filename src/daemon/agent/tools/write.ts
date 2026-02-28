// Tool — Write file contents.

import { registerTool } from "./registry.js";
import { isPathBlocked } from "../../security/index.js";
import type { ToolDefinition } from "./registry.js";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

async function execute(args: Record<string, unknown>): Promise<string> {
  const filePath = args.file_path as string;
  const content = args.content as string;

  if (!filePath) return JSON.stringify({ ok: false, error: "file_path is required" });
  if (content === undefined || content === null) {
    return JSON.stringify({ ok: false, error: "content is required" });
  }

  const absPath = resolve(filePath);

  const blocked = isPathBlocked(absPath);
  if (blocked.blocked) {
    return JSON.stringify({ ok: false, error: `Path is blocked by security policy: ${absPath}` });
  }

  try {
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf-8");
    return JSON.stringify({ ok: true, path: absPath, bytes: Buffer.byteLength(content) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: msg });
  }
}

export const writeTool: ToolDefinition = {
  id: "write_file",
  name: "write_file",
  description: "Write content to a file. Creates parent directories if needed.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Absolute path to the file to write" },
      content: { type: "string", description: "The content to write" },
    },
    required: ["file_path", "content"],
  },
  execute,
  aliases: ["write", "create_file", "save_file"],
};

registerTool(writeTool);
