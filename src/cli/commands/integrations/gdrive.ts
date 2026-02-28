import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { resolveMethod, collectFlags } from "../../../shared/connector.js";

export const command: CommandHandler = {
  name: "gdrive",
  description: "Google Drive (list, upload, download, share)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko gdrive <resource> <action> [--flags]");
      console.log("       jeriko gdrive <resource.action> [--flags]");
      console.log("\nCall Google Drive API v3 methods through the connector.");
      console.log("\nResources & Actions:");
      console.log("  files        list | get <id> | create | update <id> | delete <id> | copy <id> | export <id>");
      console.log("  permissions  list <file-id> | create <file-id> | delete <perm-id>");
      console.log("  changes      watch");
      console.log("  search       <query>");
      console.log("\nFlags:");
      console.log("  --id <id>          File/resource ID");
      console.log("  --file-id <id>     File ID (for permissions)");
      console.log("  --folder <id>      Parent folder ID");
      console.log("  --output <path>    Download destination path");
      console.log("  --limit <n>        Max results");
      console.log("  --query <text>     Search query");
      console.log("  --name <text>      File name");
      console.log("  --mime-type <type> MIME type");
      process.exit(0);
    }

    const { method, rest } = resolveMethod(parsed.positional);
    if (!method) fail("Missing method. Usage: jeriko gdrive <resource> <action>");

    if (!process.env.GDRIVE_ACCESS_TOKEN) {
      fail("Google Drive not configured. Set GDRIVE_ACCESS_TOKEN", 3);
    }

    try {
      const { GDriveConnector } = await import("../../../daemon/services/connectors/gdrive/connector.js");
      const connector = new GDriveConnector();
      await connector.init();

      const params = collectFlags(parsed.flags);

      // First remaining positional is a file ID or search query
      if (rest[0] && !params.id && !params.file_id) {
        params.file_id = rest[0];
        params.id = rest[0];
      }

      // Map --limit to page_size (Google convention)
      if (params.limit) {
        params.page_size = params.limit;
        delete params.limit;
      }

      const result = await connector.call(method, params);
      if (result.ok) {
        ok(result.data);
      } else {
        fail(result.error ?? "Google Drive API call failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Google Drive connector error: ${msg}`);
    }
  },
};
