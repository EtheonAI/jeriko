import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { resolveMethod, collectFlags } from "../../../shared/connector.js";

export const command: CommandHandler = {
  name: "onedrive",
  description: "OneDrive (list, upload, download, share)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko onedrive <resource> <action> [--flags]");
      console.log("       jeriko onedrive <resource.action> [--flags]");
      console.log("\nCall OneDrive/Microsoft Graph API methods through the connector.");
      console.log("\nResources & Actions:");
      console.log("  files         list | get <id> | get_by_path <path> | create_folder | copy <id> | move <id> | delete <id> | search <query>");
      console.log("  sharing       create_link <id> | list <id>");
      console.log("  subscriptions create | list | delete <id>");
      console.log("  delta         (get change delta)");
      console.log("\nFlags:");
      console.log("  --id <id>             Item ID");
      console.log("  --path <path>         File/folder path");
      console.log("  --folder <path>       Folder path for listing");
      console.log("  --output <path>       Download destination path");
      console.log("  --limit <n>           Max results");
      console.log("  --query <text>        Search query");
      console.log("  --name <text>         File/folder name");
      process.exit(0);
    }

    const { method, rest } = resolveMethod(parsed.positional);
    if (!method) fail("Missing method. Usage: jeriko onedrive <resource> <action>");

    if (!process.env.ONEDRIVE_ACCESS_TOKEN) {
      fail("OneDrive not configured. Set ONEDRIVE_ACCESS_TOKEN", 3);
    }

    try {
      const { OneDriveConnector } = await import("../../../daemon/services/connectors/onedrive/connector.js");
      const connector = new OneDriveConnector();
      await connector.init();

      const params = collectFlags(parsed.flags);

      // First remaining positional is an item ID or path
      if (rest[0] && !params.id && !params.item_id) {
        params.item_id = rest[0];
        params.id = rest[0];
      }

      // Map --limit to top (Microsoft Graph convention)
      if (params.limit) {
        params.top = params.limit;
        delete params.limit;
      }

      const result = await connector.call(method, params);
      if (result.ok) {
        ok(result.data);
      } else {
        fail(result.error ?? "OneDrive API call failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`OneDrive connector error: ${msg}`);
    }
  },
};
