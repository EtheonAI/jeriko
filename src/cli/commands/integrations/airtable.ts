import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("airtable", "Airtable (bases, tables, records, fields)", [
  "\nCall Airtable REST API methods through the connector.",
  "\nResources & Actions:",
  "  bases       list | get <id>",
  "  tables      list | create",
  "  records     list | get <id> | create | update | delete",
  "  fields      create | update",
  "  whoami      (current user info)",
  "\nFlags:",
  "  --id <id>            Record ID",
  "  --base-id <id>       Base ID (e.g. appXXXX)",
  "  --table-id <name>    Table ID or name",
  "  --filter <formula>   Airtable filter formula",
  "  --view <name>        View name",
  "  --limit <n>          Max records",
]);
