import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("notion", "Notion (pages, databases, blocks, search)", [
  "\nCall Notion API methods through the connector.",
  "\nResources & Actions:",
  "  search      (search across all pages and databases)",
  "  pages       get <id> | create | update | delete",
  "  databases   list | get <id> | query <id> | create | update",
  "  blocks      get <id> | children <id> | append | update | delete",
  "  users       list | get <id> | me",
  "  comments    list | create",
  "\nFlags:",
  "  --id <id>            Resource ID",
  "  --query <text>       Search query",
  "  --filter <type>      Filter by object type (page, database)",
  "  --limit <n>          Max results",
]);
