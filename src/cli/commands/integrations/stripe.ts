import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { resolveMethod, collectFlags } from "../../../shared/connector.js";

export const command: CommandHandler = {
  name: "stripe",
  description: "Stripe (charges, customers, invoices, subscriptions)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko stripe <resource> <action> [--flags]");
      console.log("       jeriko stripe <resource.action> [--flags]");
      console.log("\nCall Stripe API methods through the connector.");
      console.log("\nResources & Actions:");
      console.log("  charges       list | create | get <id>");
      console.log("  customers     list | create | get <id>");
      console.log("  subscriptions list | create | get <id> | cancel <id>");
      console.log("  invoices      list | create | get <id> | finalize <id> | send <id> | void <id>");
      console.log("  products      list | create | get <id> | update <id> | delete <id>");
      console.log("  prices        list | create | get <id>");
      console.log("  payment_intents  create | get <id> | confirm <id>");
      console.log("  refunds       create | get <id> | list");
      console.log("  payouts       list | create | get <id>");
      console.log("  events        list | get <id>");
      console.log("  webhooks      list | create | delete <id>");
      console.log("  checkout      create | get <id> | list");
      console.log("  payment_links create | list | get <id>");
      console.log("  balance       get");
      console.log("  hook          (handle incoming webhook)");
      console.log("\nFlags:");
      console.log("  --id <id>         Resource ID");
      console.log("  --limit <n>       Max results");
      console.log("  --amount <cents>  Amount in cents");
      console.log("  --currency <code> Currency (default: usd)");
      console.log("  --customer <id>   Customer ID");
      console.log("  --email <addr>    Customer email");
      console.log("  --name <text>     Resource name");
      console.log("  --description <t> Description");
      process.exit(0);
    }

    const { method, rest } = resolveMethod(parsed.positional);
    if (!method) fail("Missing method. Usage: jeriko stripe <resource> <action>");

    if (!process.env.STRIPE_SECRET_KEY) {
      fail("Stripe not configured. Set STRIPE_SECRET_KEY", 3);
    }

    try {
      const { StripeConnector } = await import("../../../daemon/services/connectors/stripe/connector.js");
      const connector = new StripeConnector();
      await connector.init();

      // Collect all flags as params
      const params = collectFlags(parsed.flags);

      // First remaining positional is an ID if not already provided via --id
      if (rest[0] && !params.id) params.id = rest[0];

      const result = await connector.call(method, params);
      if (result.ok) {
        ok(result.data);
      } else {
        fail(result.error ?? "Stripe API call failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Stripe connector error: ${msg}`);
    }
  },
};
