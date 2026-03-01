import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("outlook", "Outlook (messages, folders, send, reply, forward)", [
  "\nCall Microsoft Outlook / Graph API methods through the connector.",
  "\nResources & Actions:",
  "  messages  list | get <id> | send | reply <id> | forward <id> | delete <id> | move <id> | update <id>",
  "  folders   list | get <id> | create | delete <id> | messages <id>",
  "  search    --query <text>",
  "  profile   (get user profile)",
  "\nFlags:",
  "  --id <id>             Message/folder ID",
  "  --to <email>          Recipient email",
  "  --cc <email>          CC email",
  "  --subject <text>      Email subject",
  "  --body <text>         Email body",
  "  --content-type <type> Body type: Text or HTML",
  "  --query <text>        Search query",
  "  --filter <odata>      OData $filter expression",
  "  --limit <n>           Max results",
  "  --folder-id <id>      Destination folder ID (for move)",
  "  --is-read <bool>      Mark as read/unread",
  "  --flag <status>       Flag status (flagged, complete, notFlagged)",
], {
  // Outlook-specific: search method routes rest[0] to query instead of id
  prepareParams(method, params, rest) {
    if (rest[0] && !params.id && method === "search") {
      params.query = rest[0];
    } else if (rest[0] && !params.id) {
      params.id = rest[0];
    }
  },
});
