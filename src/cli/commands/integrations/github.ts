import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("github", "GitHub (repos, issues, PRs, actions)", [
  "\nCall GitHub API methods through the connector.",
  "\nResources & Actions:",
  "  repos         list | get --repo owner/repo",
  "  issues        list | create | get | update --repo owner/repo",
  "  pulls         list | create | get | merge --repo owner/repo",
  "  actions       list_runs | trigger --repo owner/repo",
  "  releases      list | create --repo owner/repo",
  "  search        repos | issues | code --query <text>",
  "  gists         list | create | get <id>",
  "\nFlags:",
  "  --repo <owner/repo>  Repository (owner/repo format)",
  "  --state open|closed  Filter by state",
  "  --limit <n>          Max results",
  "  --title <text>       Issue/PR title",
  "  --body <text>        Issue/PR body",
  "  --query <text>       Search query",
]);
