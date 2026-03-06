import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("mailchimp", "Mailchimp (lists, members, campaigns, templates)", [
  "\nCall Mailchimp Marketing API v3.0 methods through the connector.",
  "\nResources & Actions:",
  "  lists        list | get <id> | create",
  "  members      list | get <id> | add | update | delete | tags",
  "  campaigns    list | get <id> | create | send | delete | content",
  "  templates    list | get <id>",
  "  automations  list | get <id>",
  "  account      (account info)",
  "  ping         (health check)",
  "\nFlags:",
  "  --id <id>            Resource ID",
  "  --list-id <id>       Audience/list ID",
  "  --email <address>    Subscriber email",
  "  --status <status>    Status (subscribed, unsubscribed, etc.)",
  "  --limit <n>          Max results",
]);
