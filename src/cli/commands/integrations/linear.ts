import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("linear", "Linear (issues, projects, teams, cycles)", [
  "\nCall Linear GraphQL API methods through the connector.",
  "\nResources & Actions:",
  "  issues      list | get <id> | create | update | delete | search",
  "  projects    list | get <id> | create",
  "  teams       list | get <id>",
  "  cycles      list",
  "  labels      list",
  "  states      list",
  "  comments    create",
  "  me          (current user)",
  "\nFlags:",
  "  --id <id>            Resource ID",
  "  --title <text>       Issue/project title",
  "  --description <text> Description",
  "  --team-id <id>       Team ID",
  "  --query <text>       Search query",
  "  --limit <n>          Max results",
]);
