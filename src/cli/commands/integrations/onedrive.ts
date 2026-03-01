import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("onedrive", "OneDrive (files, folders, sharing)", [
  "\nCall Microsoft OneDrive API methods through the connector.",
  "\nResources & Actions:",
  "  files          list | get <id> | create_folder | copy <id> | move <id> | delete <id> | search",
  "  files          get_by_path --path /path/to/file",
  "  sharing        create_link <id> | list <id>",
  "  subscriptions  list | create | delete <id>",
  "  delta          (get incremental changes)",
  "\nFlags:",
  "  --id <id>             Item ID",
  "  --item-id <id>        Item ID (alias for --id)",
  "  --path <path>         File/folder path",
  "  --limit <n>           Max results",
  "  --query <text>        Search query",
  "  --name <text>         File/folder name",
  "  --destination-id <id> Destination folder for move/copy",
]);
