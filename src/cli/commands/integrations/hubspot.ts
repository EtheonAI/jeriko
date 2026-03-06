import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("hubspot", "HubSpot CRM (contacts, companies, deals, tickets)", [
  "\nCall HubSpot CRM v3 API methods through the connector.",
  "\nResources & Actions:",
  "  contacts    list | get <id> | create | update <id> | delete <id> | search",
  "  companies   list | get <id> | create | update <id> | delete <id> | search",
  "  deals       list | get <id> | create | update <id> | delete <id> | search",
  "  tickets     list | get <id> | create | update <id> | delete <id>",
  "  owners      list | get <id>",
  "  pipelines   list | get <id>",
  "  associations list | create",
  "  notes       create",
  "  tasks       create",
  "  search      (unified, specify --object-type)",
  "\nFlags:",
  "  --id <id>            Object ID",
  "  --query <text>       Search query string",
  "  --object-type <type> Object type for unified search (contacts, companies, deals)",
  "  --limit <n>          Max results",
  "  --properties <json>  JSON object of property key-value pairs",
]);
