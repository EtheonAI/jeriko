import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("gitlab", "GitLab (projects, issues, merge requests, pipelines)", [
  "\nCall GitLab REST API v4 methods through the connector.",
  "\nResources & Actions:",
  "  projects        list | get <id> | create | delete | search",
  "  issues          list | get | create | update | delete",
  "  merge_requests  list | get | create | merge",
  "  pipelines       list | get | jobs",
  "  users           me | list",
  "  branches        list",
  "\nFlags:",
  "  --id <id>              Resource ID or path",
  "  --project-id <id>      Project ID or URL-encoded path",
  "  --title <text>         Title for issues/MRs",
  "  --source-branch <name> Source branch for MR",
  "  --limit <n>            Max results",
]);
