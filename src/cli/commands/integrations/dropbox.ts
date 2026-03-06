import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("dropbox", "Dropbox (files, folders, sharing)", [
  "\nCall Dropbox API v2 methods through the connector.",
  "\nResources & Actions:",
  "  files       list | list_continue | get_metadata | search | copy | move | delete | create_folder",
  "  sharing     list | create_link | list_folders | list_members",
  "  users       me | space",
  "\nFlags:",
  "  --path <path>        File/folder path",
  "  --from-path <path>   Source path (copy/move)",
  "  --to-path <path>     Destination path (copy/move)",
  "  --query <text>       Search query",
  "  --cursor <token>     Pagination cursor",
  "  --limit <n>          Max results",
]);
