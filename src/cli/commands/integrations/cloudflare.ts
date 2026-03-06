import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("cloudflare", "Cloudflare (zones, DNS, Workers, KV)", [
  "\nCall Cloudflare API v4 methods through the connector.",
  "\nResources & Actions:",
  "  zones       list | get <id> | create | delete | purge_cache",
  "  dns         list | get <id> | create | update | delete",
  "  workers     list | get | delete | routes",
  "  kv          namespaces | keys | get | put | delete",
  "  analytics   dashboard",
  "  user        me | tokens",
  "\nFlags:",
  "  --id <id>            Resource ID",
  "  --zone-id <id>       Zone ID",
  "  --account-id <id>    Account ID",
  "  --name <text>        Domain/record name",
  "  --type <type>        DNS record type (A, CNAME, etc.)",
  "  --content <value>    DNS record content",
  "  --limit <n>          Max results",
]);
