import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { resolveMethod, collectFlags } from "../../../shared/connector.js";

export const command: CommandHandler = {
  name: "twilio",
  description: "Twilio (SMS, calls, WhatsApp)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko twilio <resource> <action> [--flags]");
      console.log("       jeriko twilio <resource.action> [--flags]");
      console.log("\nCall Twilio API methods through the connector.");
      console.log("\nResources & Actions:");
      console.log("  messages  send | get <sid> | list");
      console.log("  calls     create | get <sid> | list | update <sid>");
      console.log("  recordings  list | get <sid>");
      console.log("  account   get");
      console.log("  numbers   list");
      console.log("  lookups   phone <number>");
      console.log("  hook      (handle incoming webhook)");
      console.log("\nShorthand:");
      console.log("  sms --to <phone> --body <text>   (alias for messages send)");
      console.log("  call --to <phone> --url <twiml>  (alias for calls create)");
      console.log("\nFlags:");
      console.log("  --to <phone>          Destination phone number");
      console.log("  --from <phone>        Source phone number");
      console.log("  --body <text>         Message body");
      console.log("  --url <twiml>         TwiML URL for calls");
      console.log("  --status-callback <u> Status callback URL");
      console.log("  --media-url <url>     Media attachment URL");
      process.exit(0);
    }

    const { method, rest } = resolveMethod(parsed.positional);
    if (!method) fail("Missing method. Usage: jeriko twilio <resource> <action>");

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      fail("Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN", 3);
    }

    try {
      const { TwilioConnector } = await import("../../../daemon/services/connectors/twilio/connector.js");
      const connector = new TwilioConnector();
      await connector.init();

      const params = collectFlags(parsed.flags);

      // First remaining positional is a SID or phone number
      if (rest[0] && !params.id && !params.sid) {
        params.sid = rest[0];
        params.phone_number = rest[0]; // for lookups
      }

      const result = await connector.call(method, params);
      if (result.ok) {
        ok(result.data);
      } else {
        fail(result.error ?? "Twilio API call failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Twilio connector error: ${msg}`);
    }
  },
};
