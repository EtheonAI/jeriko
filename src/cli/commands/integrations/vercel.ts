import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { resolveMethod, collectFlags } from "../../../shared/connector.js";

export const command: CommandHandler = {
  name: "vercel",
  description: "Vercel (deployments, projects, domains)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko vercel <resource> <action> [--flags]");
      console.log("       jeriko vercel <resource.action> [--flags]");
      console.log("\nCall Vercel API methods through the connector.");
      console.log("\nResources & Actions:");
      console.log("  deployments  list | get <id> | create | cancel <id> | delete <id>");
      console.log("  projects     list | get <name> | create | delete <id>");
      console.log("  domains      list | add | remove --project-id <id>");
      console.log("  env          list | create | delete --project-id <id>");
      console.log("  team         get");
      console.log("\nFlags:");
      console.log("  --id <id>            Resource ID");
      console.log("  --project-id <id>    Project ID");
      console.log("  --domain <name>      Domain name");
      console.log("  --limit <n>          Max results");
      console.log("  --team <id>          Team ID");
      process.exit(0);
    }

    const { method, rest } = resolveMethod(parsed.positional);
    if (!method) fail("Missing method. Usage: jeriko vercel <resource> <action>");

    if (!process.env.VERCEL_TOKEN) {
      fail("Vercel not configured. Set VERCEL_TOKEN", 3);
    }

    try {
      const { VercelConnector } = await import("../../../daemon/services/connectors/vercel/connector.js");
      const connector = new VercelConnector();
      await connector.init();

      const params = collectFlags(parsed.flags);
      if (rest[0] && !params.id) params.id = rest[0];

      // Map --team to teamId (Vercel convention)
      if (params.team) {
        params.teamId = params.team;
        delete params.team;
      }

      const result = await connector.call(method, params);
      if (result.ok) {
        ok(result.data);
      } else {
        fail(result.error ?? "Vercel API call failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Vercel connector error: ${msg}`);
    }
  },
};
