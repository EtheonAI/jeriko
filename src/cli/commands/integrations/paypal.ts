import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { resolveMethod, collectFlags } from "../../../shared/connector.js";

export const command: CommandHandler = {
  name: "paypal",
  description: "PayPal (payments, orders, subscriptions, invoices)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko paypal <resource> <action> [--flags]");
      console.log("       jeriko paypal <resource.action> [--flags]");
      console.log("\nCall PayPal API methods through the connector.");
      console.log("\nResources & Actions:");
      console.log("  orders        create | get <id> | capture <id> | authorize <id>");
      console.log("  payments      get <id> | refund <id>");
      console.log("  subscriptions create | get <id> | list | cancel <id> | suspend <id> | activate <id>");
      console.log("  plans         create | get <id> | list");
      console.log("  products      create | get <id> | list");
      console.log("  invoices      create | get <id> | list | send <id> | cancel <id> | remind <id>");
      console.log("  payouts       create | get <id>");
      console.log("  disputes      list | get <id>");
      console.log("  webhooks      list | create | delete <id>");
      console.log("  hook          (handle incoming webhook)");
      console.log("\nFlags:");
      console.log("  --id <id>          Resource ID");
      console.log("  --amount <value>   Payment amount");
      console.log("  --currency <code>  Currency (default: USD)");
      console.log("  --email <addr>     Recipient email");
      console.log("  --plan-id <id>     Subscription plan ID");
      console.log("  --reason <text>    Cancellation reason");
      console.log("  --description <t>  Description");
      process.exit(0);
    }

    const { method, rest } = resolveMethod(parsed.positional);
    if (!method) fail("Missing method. Usage: jeriko paypal <resource> <action>");

    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      fail("PayPal not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET", 3);
    }

    try {
      const { PayPalConnector } = await import("../../../daemon/services/connectors/paypal/connector.js");
      const connector = new PayPalConnector();
      await connector.init();

      const params = collectFlags(parsed.flags);
      if (rest[0] && !params.id) params.id = rest[0];

      const result = await connector.call(method, params);
      if (result.ok) {
        ok(result.data);
      } else {
        fail(result.error ?? "PayPal API call failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`PayPal connector error: ${msg}`);
    }
  },
};
