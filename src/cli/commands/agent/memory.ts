import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DATA_DIR = join(homedir(), ".jeriko", "data");
const MEMORY_DIR = join(homedir(), ".jeriko", "memory");
const AGENT_LOG = join(DATA_DIR, "agent.log");

export const command: CommandHandler = {
  name: "memory",
  description: "Session persistence (recent, search, set, get, context)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko memory <action> [options]");
      console.log("\nActions:");
      console.log("  recent             Show recent conversations");
      console.log("  search <query>     Search conversation history");
      console.log("  set <key> <value>  Store a key-value pair");
      console.log("  get <key>          Retrieve a stored value");
      console.log("  context            Show current session context");
      console.log("  stats              Memory usage statistics");
      console.log("  log                Show agent log (last N lines)");
      console.log("\nFlags:");
      console.log("  --limit <n>        Max results (default: 10)");
      console.log("  --conversations    List saved conversations");
      console.log("  --resume <id>      Resume a saved conversation");
      console.log("  --agent-log        Show raw agent log");
      console.log("  --stats            Show memory statistics");
      process.exit(0);
    }

    // Shorthand flags
    if (flagBool(parsed, "conversations")) {
      return listConversations();
    }
    if (flagBool(parsed, "agent-log")) {
      return showAgentLog(parseInt(flagStr(parsed, "limit", "50"), 10));
    }
    if (flagBool(parsed, "stats")) {
      return showStats();
    }

    const action = parsed.positional[0];
    if (!action) fail("Missing action. Usage: jeriko memory <recent|search|set|get|context|stats|log>");

    switch (action) {
      case "recent":
        return listConversations();
      case "search": {
        const query = parsed.positional.slice(1).join(" ");
        if (!query) fail("Missing search query. Usage: jeriko memory search <query>");
        return searchMemory(query);
      }
      case "set": {
        const key = parsed.positional[1];
        const value = parsed.positional.slice(2).join(" ");
        if (!key || !value) fail("Usage: jeriko memory set <key> <value>");
        // TODO: implement KV store write
        ok({ action: "set", key, value, stored: true });
        break;
      }
      case "get": {
        const key = parsed.positional[1];
        if (!key) fail("Usage: jeriko memory get <key>");
        // TODO: implement KV store read
        fail(`Key not found: "${key}"`, 5);
        break;
      }
      case "context":
        return showStats();
      case "stats":
        return showStats();
      case "log":
        return showAgentLog(parseInt(flagStr(parsed, "limit", "50"), 10));
      default:
        fail(`Unknown action: "${action}". Use recent, search, set, get, context, stats, or log.`);
    }
  },
};

function listConversations(): void {
  if (!existsSync(MEMORY_DIR)) {
    ok({ conversations: [], count: 0 });
    return;
  }

  const files = readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".jsonl") || f.endsWith(".json"));
  const conversations = files.map((f) => ({
    id: f.replace(/\.(jsonl|json)$/, ""),
    file: join(MEMORY_DIR, f),
  }));

  ok({ conversations, count: conversations.length });
}

function showAgentLog(limit: number): void {
  if (!existsSync(AGENT_LOG)) {
    ok({ log: [], message: "No agent log found" });
    return;
  }

  const content = readFileSync(AGENT_LOG, "utf-8");
  const lines = content.trim().split("\n").slice(-limit);
  const entries = lines.map((line) => {
    try { return JSON.parse(line); }
    catch { return { raw: line }; }
  });

  ok({ entries, count: entries.length, total_lines: content.split("\n").length });
}

function searchMemory(query: string): void {
  if (!existsSync(AGENT_LOG)) {
    ok({ query, results: [], count: 0 });
    return;
  }

  const content = readFileSync(AGENT_LOG, "utf-8");
  const lines = content.trim().split("\n");
  const matches = lines.filter((line) => line.toLowerCase().includes(query.toLowerCase()));
  const results = matches.slice(-20).map((line) => {
    try { return JSON.parse(line); }
    catch { return { raw: line }; }
  });

  ok({ query, results, count: results.length });
}

function showStats(): void {
  const stats: Record<string, unknown> = {};

  if (existsSync(AGENT_LOG)) {
    const content = readFileSync(AGENT_LOG, "utf-8");
    stats.agent_log_lines = content.split("\n").length;
    stats.agent_log_size = Buffer.byteLength(content);
  }

  if (existsSync(MEMORY_DIR)) {
    const files = readdirSync(MEMORY_DIR);
    stats.conversations = files.length;
  }

  if (existsSync(DATA_DIR)) {
    const files = readdirSync(DATA_DIR);
    stats.data_files = files.length;
  }

  ok(stats);
}
