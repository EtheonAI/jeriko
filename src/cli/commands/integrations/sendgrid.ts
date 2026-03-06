import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("sendgrid", "SendGrid (email sending, contacts, templates)", [
  "\nCall SendGrid API v3 methods through the connector.",
  "\nResources & Actions:",
  "  mail        send",
  "  contacts    list | get <id> | search | add | delete | count",
  "  lists       list | get <id> | create | delete",
  "  templates   list | get <id>",
  "  stats       global",
  "  senders     list",
  "\nFlags:",
  "  --to <email>         Recipient email",
  "  --from <email>       Sender email",
  "  --subject <text>     Email subject",
  "  --body <text>        Email body text",
  "  --limit <n>          Max results",
]);
