import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("slack", "Slack (messages, channels, users, files)", [
  "\nCall Slack Web API methods through the connector.",
  "\nResources & Actions:",
  "  messages    send | update | delete | list | replies",
  "  channels    list | info | create | join | invite | archive | topic",
  "  users       list | info | me",
  "  reactions   add | remove",
  "  files       list | info",
  "  search      (search messages)",
  "  pins        add | list",
  "\nFlags:",
  "  --channel <id>       Channel ID",
  "  --text <message>     Message text",
  "  --ts <timestamp>     Message timestamp",
  "  --user <id>          User ID",
  "  --limit <n>          Max results",
]);
