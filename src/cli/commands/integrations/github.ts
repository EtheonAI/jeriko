import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { resolveMethod, collectFlags } from "../../../shared/connector.js";

export const command: CommandHandler = {
  name: "github",
  description: "GitHub (repos, issues, PRs, actions)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko github <resource> <action> [--flags]");
      console.log("       jeriko github <resource.action> [--flags]");
      console.log("\nCall GitHub API methods through the connector.");
      console.log("\nResources & Actions:");
      console.log("  repos         list | get --repo owner/repo");
      console.log("  issues        list | create | get | update --repo owner/repo");
      console.log("  pulls         list | create | get | merge --repo owner/repo");
      console.log("  actions       list_runs | trigger --repo owner/repo");
      console.log("  releases      list | create --repo owner/repo");
      console.log("  search        repos | issues | code --query <text>");
      console.log("  gists         list | create | get <id>");
      console.log("  hook          (handle incoming webhook)");
      console.log("\nFlags:");
      console.log("  --repo <owner/repo>  Repository (owner/repo format)");
      console.log("  --state open|closed  Filter by state");
      console.log("  --limit <n>          Max results");
      console.log("  --title <text>       Issue/PR title");
      console.log("  --body <text>        Issue/PR body");
      console.log("  --query <text>       Search query");
      process.exit(0);
    }

    const { method, rest } = resolveMethod(parsed.positional);
    if (!method) fail("Missing method. Usage: jeriko github <resource> <action>");

    if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
      fail("GitHub not configured. Set GITHUB_TOKEN or GH_TOKEN", 3);
    }

    try {
      const { GitHubConnector } = await import("../../../daemon/services/connectors/github/connector.js");
      const connector = new GitHubConnector();
      await connector.init();

      const params = collectFlags(parsed.flags);

      // Parse --repo or first positional as owner/repo
      const repoArg = (params.repo as string) || rest[0] || "";
      if (repoArg && repoArg.includes("/")) {
        const [owner, repo] = repoArg.split("/", 2);
        params.owner = owner;
        params.repo = repo;
      } else if (rest[0] && !params.id) {
        params.id = rest[0];
      }

      // Map --limit to per_page (GitHub convention)
      if (params.limit) {
        params.per_page = params.limit;
        delete params.limit;
      }

      const result = await connector.call(method, params);
      if (result.ok) {
        ok(result.data);
      } else {
        fail(result.error ?? "GitHub API call failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`GitHub connector error: ${msg}`);
    }
  },
};
