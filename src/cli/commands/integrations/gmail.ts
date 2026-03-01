import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("gmail", "Gmail (messages, labels, drafts, threads, send)", [
  "\nCall Gmail API v1 methods through the connector.",
  "\nResources & Actions:",
  "  messages  list | get <id> | send | delete <id> | trash <id> | untrash <id> | modify <id>",
  "  labels    list | get <id> | create | delete <id>",
  "  drafts    list | get <id> | create | send <id> | delete <id>",
  "  threads   list | get <id> | trash <id>",
  "  profile   (get user email/stats)",
  "  history   list",
  "\nFlags:",
  "  --id <id>          Message/label/draft/thread ID",
  "  --q <query>        Gmail search query (e.g. 'is:unread from:me')",
  "  --query <query>    Alias for --q",
  "  --limit <n>        Max results",
  "  --format <fmt>     Message format: full, metadata, minimal, raw",
  "  --raw <base64>     Base64url-encoded RFC 2822 message (for send/drafts.create)",
  "  --name <text>      Label name (for labels.create)",
]);
