import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PROMPTS_DIR = join(homedir(), ".jeriko", "prompts");

export const command: CommandHandler = {
  name: "prompt",
  description: "System prompt management",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko prompt <action> [options]");
      console.log("\nActions:");
      console.log("  show              Show current system prompt");
      console.log("  list              List saved prompts");
      console.log("  get <name>        Get a saved prompt");
      console.log("  set <name>        Set prompt from --content or stdin");
      console.log("  generate          Generate prompt via discover");
      console.log("  json              Output prompt as JSON (for API calls)");
      console.log("\nFlags:");
      console.log("  --content <text>  Prompt content (for set)");
      console.log("  --format toon|verbose  Generate format");
      process.exit(0);
    }

    const action = parsed.positional[0] ?? "show";

    switch (action) {
      case "show": {
        // Read AGENT.md from project root
        const agentMd = join(process.cwd(), "AGENT.md");
        const globalMd = join(homedir(), ".jeriko", "AGENT.md");
        const path = existsSync(agentMd) ? agentMd : existsSync(globalMd) ? globalMd : null;

        if (!path) {
          fail("No AGENT.md found. Create one in the project root or ~/.jeriko/");
        }

        const content = readFileSync(path, "utf-8");
        ok({ path, content, size: content.length, tokens_est: Math.ceil(content.length / 4) });
        break;
      }
      case "list": {
        if (!existsSync(PROMPTS_DIR)) {
          ok({ prompts: [], count: 0 });
          break;
        }
        const { readdirSync } = await import("node:fs");
        const files = readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
        ok({ prompts: files, count: files.length, directory: PROMPTS_DIR });
        break;
      }
      case "get": {
        const name = parsed.positional[1];
        if (!name) fail("Missing prompt name. Usage: jeriko prompt get <name>");
        const path = join(PROMPTS_DIR, `${name}.md`);
        if (!existsSync(path)) fail(`Prompt not found: "${name}"`, 5);
        const content = readFileSync(path, "utf-8");
        ok({ name, content, size: content.length });
        break;
      }
      case "set": {
        const name = parsed.positional[1];
        if (!name) fail("Missing prompt name. Usage: jeriko prompt set <name> --content <text>");
        const content = flagStr(parsed, "content", "");
        if (!content) fail("Missing --content flag");
        const { mkdirSync } = await import("node:fs");
        mkdirSync(PROMPTS_DIR, { recursive: true });
        const path = join(PROMPTS_DIR, `${name}.md`);
        writeFileSync(path, content);
        ok({ name, path, size: content.length });
        break;
      }
      case "generate": {
        // Delegate to discover command
        const { command: discover } = await import("./discover.js");
        await discover.run(args.slice(1));
        break;
      }
      case "json": {
        const agentMd = join(process.cwd(), "AGENT.md");
        const globalMd = join(homedir(), ".jeriko", "AGENT.md");
        const path = existsSync(agentMd) ? agentMd : existsSync(globalMd) ? globalMd : null;

        if (!path) fail("No AGENT.md found");

        const content = readFileSync(path, "utf-8");
        // Output as JSON suitable for API message array
        ok({
          messages: [{ role: "system", content }],
          tokens_est: Math.ceil(content.length / 4),
        });
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use show, list, get, set, generate, or json.`);
    }
  },
};
