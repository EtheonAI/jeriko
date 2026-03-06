import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("jira", "Jira (issues, projects, boards, sprints)", [
  "\nCall Jira REST API v3 + Agile methods through the connector.",
  "\nResources & Actions:",
  "  issues      get | create | update | delete | transition | search | assign | comment",
  "  projects    list | get",
  "  boards      list | get",
  "  sprints     list | get | issues",
  "  users       search | me",
  "  statuses    list",
  "\nFlags:",
  "  --id <id>            Issue ID or key (e.g. PROJ-123)",
  "  --project <key>      Project key",
  "  --jql <query>        JQL search query",
  "  --summary <text>     Issue summary",
  "  --board-id <id>      Board ID",
  "  --limit <n>          Max results",
]);
