import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { resolveMethod, collectFlags } from "../../../shared/connector.js";

export const command: CommandHandler = {
  name: "x",
  description: "X/Twitter (post, search, timeline, DMs)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko x <action> [--flags]");
      console.log("       jeriko x <resource.action> [--flags]");
      console.log("\nCall X/Twitter API v2 methods through the connector.");
      console.log("\nActions (shorthand):");
      console.log("  post <text>                 Post a tweet");
      console.log("  search <query>              Search recent tweets");
      console.log("  timeline --user-id <id>     Get user timeline");
      console.log("  like --tweet-id <id>        Like a tweet");
      console.log("  retweet --tweet-id <id>     Retweet a tweet");
      console.log("  follow --target-user-id <id>  Follow a user");
      console.log("  bookmark --user-id <id>     List bookmarks");
      console.log("  dm --to <user-id> --text <msg>  Send DM");
      console.log("\nDot-notation:");
      console.log("  tweets.create | tweets.get | tweets.delete | tweets.search");
      console.log("  users.get | users.by_username | users.timeline | users.followers");
      console.log("  likes.create | likes.delete");
      console.log("  retweets.create");
      console.log("  bookmarks.list");
      console.log("  dm.send | dm.list");
      console.log("\nFlags:");
      console.log("  --id <id>              Tweet or user ID");
      console.log("  --user-id <id>         User ID for context");
      console.log("  --tweet-id <id>        Tweet ID");
      console.log("  --target-user-id <id>  Target user for follow");
      console.log("  --username <handle>    Username (without @)");
      console.log("  --query <text>         Search query");
      console.log("  --limit <n>            Max results");
      console.log("  --media <path>         Attach media file");
      process.exit(0);
    }

    const { method, rest } = resolveMethod(parsed.positional);
    if (!method) fail("Missing method. Usage: jeriko x <action>");

    if (!process.env.X_BEARER_TOKEN && !process.env.TWITTER_BEARER_TOKEN) {
      fail("X/Twitter not configured. Set X_BEARER_TOKEN", 3);
    }

    try {
      const { XConnector } = await import("../../../daemon/services/connectors/x/connector.js");
      const connector = new XConnector();
      await connector.init();

      const params = collectFlags(parsed.flags);

      // Remaining positional args become text content (for post, search, etc.)
      if (rest.length > 0 && !params.text && !params.query) {
        const joined = rest.join(" ");
        // For search method, use as query; otherwise use as text
        if (method === "search" || method === "tweets.search") {
          params.query = joined;
        } else {
          params.text = joined;
        }
      }

      // Map --limit to max_results (X API convention)
      if (params.limit) {
        params.max_results = params.limit;
        delete params.limit;
      }

      const result = await connector.call(method, params);
      if (result.ok) {
        ok(result.data);
      } else {
        fail(result.error ?? "X API call failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`X connector error: ${msg}`);
    }
  },
};
