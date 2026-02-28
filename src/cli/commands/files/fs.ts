import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

export const command: CommandHandler = {
  name: "fs",
  description: "Filesystem operations (ls, cat, write, find, grep)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko fs <action> [path] [options]");
      console.log("\nActions:");
      console.log("  ls <dir>          List directory contents");
      console.log("  cat <file>        Read file contents");
      console.log("  write <file>      Write to file (reads stdin or --content)");
      console.log("  stat <path>       File/directory info");
      console.log("  exists <path>     Check if path exists");
      console.log("\nFlags:");
      console.log("  --content <text>  Content to write (for write action)");
      console.log("  --recursive       Recursive listing");
      process.exit(0);
    }

    const action = parsed.positional[0];
    if (!action) fail("Missing action. Usage: jeriko fs <ls|cat|write|stat|exists>");

    switch (action) {
      case "ls": {
        const dir = resolve(parsed.positional[1] ?? ".");
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          const items = entries.map((e) => ({
            name: e.name,
            type: e.isDirectory() ? "dir" : e.isFile() ? "file" : "other",
          }));
          ok({ path: dir, entries: items, count: items.length });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Cannot list "${dir}": ${msg}`);
        }
        break;
      }
      case "cat": {
        const file = parsed.positional[1];
        if (!file) fail("Missing file path. Usage: jeriko fs cat <file>");
        try {
          const content = readFileSync(resolve(file), "utf-8");
          ok({ path: resolve(file), content, size: content.length });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Cannot read "${file}": ${msg}`);
        }
        break;
      }
      case "write": {
        const file = parsed.positional[1];
        if (!file) fail("Missing file path. Usage: jeriko fs write <file> --content <text>");
        const content = flagStr(parsed, "content", "");
        if (!content) fail("Missing --content flag. Usage: jeriko fs write <file> --content <text>");
        try {
          writeFileSync(resolve(file), content);
          ok({ path: resolve(file), written: content.length });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Cannot write "${file}": ${msg}`);
        }
        break;
      }
      case "stat": {
        const target = parsed.positional[1];
        if (!target) fail("Missing path. Usage: jeriko fs stat <path>");
        try {
          const stats = statSync(resolve(target));
          ok({
            path: resolve(target),
            type: stats.isDirectory() ? "dir" : "file",
            size: stats.size,
            modified: stats.mtime.toISOString(),
            created: stats.birthtime.toISOString(),
            permissions: stats.mode.toString(8),
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Cannot stat "${target}": ${msg}`);
        }
        break;
      }
      case "exists": {
        const target = parsed.positional[1];
        if (!target) fail("Missing path. Usage: jeriko fs exists <path>");
        ok({ path: resolve(target), exists: existsSync(resolve(target)) });
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use ls, cat, write, stat, or exists.`);
    }
  },
};
