import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { execSync } from "node:child_process";

export const command: CommandHandler = {
  name: "search",
  description: "Web search via DuckDuckGo",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko search <query> [options]");
      console.log("\nSearch the web using DuckDuckGo's API.");
      console.log("\nFlags:");
      console.log("  --limit <n>       Max results (default: 10)");
      console.log("  --region <code>   Region code (e.g., us-en)");
      process.exit(0);
    }

    const query = parsed.positional.join(" ");
    if (!query) fail("Missing search query. Usage: jeriko search <query>");

    const limit = parseInt(flagStr(parsed, "limit", "10"), 10);

    try {
      // DuckDuckGo Instant Answer API (JSON, no auth required)
      const encoded = encodeURIComponent(query);
      const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
      const output = execSync(`curl -sS "${url}"`, { encoding: "utf-8", timeout: 15000 });

      const data = JSON.parse(output);
      const results: Array<{ title: string; url: string; snippet: string }> = [];

      // Abstract
      if (data.Abstract) {
        results.push({ title: data.Heading || query, url: data.AbstractURL || "", snippet: data.Abstract });
      }

      // Related topics
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, limit)) {
          if (topic.Text) {
            results.push({ title: topic.Text.slice(0, 80), url: topic.FirstURL || "", snippet: topic.Text });
          }
        }
      }

      ok({ query, results: results.slice(0, limit), count: results.length });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Search failed: ${msg}`, 2);
    }
  },
};
