// Tool — Edit file via string replacement.

import { registerTool } from "./registry.js";
import { isPathBlocked } from "../../security/index.js";
import type { ToolDefinition } from "./registry.js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function execute(args: Record<string, unknown>): Promise<string> {
  const filePath = args.file_path as string;
  const oldString = args.old_string as string;
  const newString = args.new_string as string;
  const replaceAll = (args.replace_all as boolean) ?? false;

  if (!filePath) return JSON.stringify({ ok: false, error: "file_path is required" });
  if (!oldString) return JSON.stringify({ ok: false, error: "old_string is required" });
  if (newString === undefined) return JSON.stringify({ ok: false, error: "new_string is required" });

  const absPath = resolve(filePath);

  const blocked = isPathBlocked(absPath);
  if (blocked.blocked) {
    return JSON.stringify({ ok: false, error: `Path is blocked by security policy: ${absPath}` });
  }

  try {
    const content = await readFile(absPath, "utf-8");

    if (!content.includes(oldString)) {
      return JSON.stringify({ ok: false, error: "old_string not found in file" });
    }

    let updated: string;
    if (replaceAll) {
      updated = content.split(oldString).join(newString);
    } else {
      const idx = content.indexOf(oldString);
      // Verify uniqueness: check for a second occurrence.
      const secondIdx = content.indexOf(oldString, idx + 1);
      if (secondIdx !== -1) {
        return JSON.stringify({ ok: false, error: "old_string is not unique in file — provide more context or use replace_all" });
      }
      updated = content.slice(0, idx) + newString + content.slice(idx + oldString.length);
    }

    await writeFile(absPath, updated, "utf-8");
    return JSON.stringify({ ok: true, path: absPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: msg });
  }
}

export const editTool: ToolDefinition = {
  id: "edit_file",
  name: "edit_file",
  description: "Edit a file by replacing an exact string match with new content.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Absolute path to the file" },
      old_string: { type: "string", description: "The exact text to find and replace" },
      new_string: { type: "string", description: "The replacement text" },
      replace_all: { type: "boolean", description: "Replace all occurrences (default: false)" },
    },
    required: ["file_path", "old_string", "new_string"],
  },
  execute,
  aliases: ["edit", "replace", "str_replace_editor"],
};

registerTool(editTool);
