import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("discord", "Discord (guilds, channels, messages, users)", [
  "\nCall Discord REST API v10 methods through the connector.",
  "\nResources & Actions:",
  "  guilds      list | get <id> | channels <id> | members <id>",
  "  channels    get <id> | create | update | delete",
  "  messages    list | get | send | update | delete",
  "  reactions   add | remove",
  "  users       me | get <id>",
  "  roles       list",
  "\nFlags:",
  "  --id <id>            Resource ID",
  "  --channel <id>       Channel ID",
  "  --guild-id <id>      Guild (server) ID",
  "  --content <text>     Message content",
  "  --limit <n>          Max results",
]);
