import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("gdrive", "Google Drive (files, permissions, sharing)", [
  "\nCall Google Drive API v3 methods through the connector.",
  "\nResources & Actions:",
  "  files        list | get <id> | create | update <id> | delete <id> | copy <id> | export <id>",
  "  permissions  list <file-id> | create <file-id> | delete <file-id>",
  "  changes      watch",
  "\nFlags:",
  "  --id <id>            File ID",
  "  --file-id <id>       File ID (alias for --id)",
  "  --limit <n>          Max results",
  "  --query <text>       Search query (Google Drive syntax)",
  "  --name <text>        File/folder name",
  "  --mime-type <type>   MIME type",
  "  --fields <fields>    Response fields",
  "  --email <addr>       Permission email address",
  "  --role <role>        Permission role (reader, writer, owner)",
]);
