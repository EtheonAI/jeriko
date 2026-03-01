import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("vercel", "Vercel (deployments, projects, domains)", [
  "\nCall Vercel API methods through the connector.",
  "\nResources & Actions:",
  "  deployments  list | get <id> | create | cancel <id> | delete <id>",
  "  projects     list | get <id> | create | delete <id>",
  "  domains      list --project-id <id> | add --project-id <id> --domain <d> | remove",
  "  env          list --project-id <id> | create --project-id <id> | delete",
  "  team         get",
  "  logs         list <deployment-id>",
  "\nFlags:",
  "  --id <id>           Resource ID",
  "  --project-id <id>   Project ID",
  "  --domain <domain>   Domain name",
  "  --limit <n>         Max results",
  "  --team <id>         Team ID (overrides VERCEL_TEAM_ID)",
]);
