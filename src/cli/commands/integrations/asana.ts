import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("asana", "Asana (tasks, projects, sections, workspaces)", [
  "\nCall Asana REST API methods through the connector.",
  "\nResources & Actions:",
  "  tasks       list | get <id> | create | update | delete | search | subtasks | add_comment",
  "  projects    list | get <id> | create | update | delete",
  "  sections    list | create | update | add_task",
  "  workspaces  list | get <id>",
  "  teams       list",
  "  users       me | list",
  "  tags        list",
  "\nFlags:",
  "  --id <id>            Resource ID",
  "  --workspace <id>     Workspace ID",
  "  --project <id>       Project ID",
  "  --name <text>        Task/project name",
  "  --assignee <id>      Assignee (user ID or 'me')",
  "  --limit <n>          Max results",
]);
