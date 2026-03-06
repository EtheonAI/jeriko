import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("square", "Square (payments, orders, customers, catalog)", [
  "\nCall Square API v2 methods through the connector.",
  "\nResources & Actions:",
  "  payments    list | get <id> | create | cancel | refund",
  "  orders      search | get <id> | create",
  "  customers   list | get <id> | create | update | delete | search",
  "  catalog     list | get <id> | search",
  "  inventory   count | adjust",
  "  locations   list | get <id>",
  "  merchants   me",
  "\nFlags:",
  "  --id <id>            Resource ID",
  "  --amount <cents>     Amount in cents",
  "  --currency <code>    Currency code (default: USD)",
  "  --location-id <id>   Location ID",
  "  --limit <n>          Max results",
]);
