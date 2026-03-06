import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("digitalocean", "DigitalOcean (droplets, domains, databases, apps)", [
  "\nCall DigitalOcean API v2 methods through the connector.",
  "\nResources & Actions:",
  "  droplets    list | get <id> | create | delete | actions | action",
  "  domains     list | get | create | delete | records",
  "  databases   list | get <id> | create",
  "  apps        list | get <id> | delete | deployments",
  "  volumes     list | get <id> | create | delete",
  "  ssh_keys    list | get <id>",
  "  account     (account info)",
  "  regions     (available regions)",
  "  sizes       (available sizes)",
  "  images      list",
  "\nFlags:",
  "  --id <id>            Resource ID",
  "  --name <text>        Resource name",
  "  --region <slug>      Region slug",
  "  --size <slug>        Size slug",
  "  --limit <n>          Max results",
]);
