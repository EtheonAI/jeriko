import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("salesforce", "Salesforce (records, SOQL, objects, search)", [
  "\nCall Salesforce REST API v59.0 methods through the connector.",
  "\nResources & Actions:",
  "  soql        query | query_more",
  "  records     list | get <id> | create | update | delete",
  "  objects     list | describe",
  "  search      (SOSL search)",
  "  users       me | list",
  "  limits      (API limits)",
  "  versions    (API versions)",
  "\nFlags:",
  "  --id <id>            Record ID",
  "  --object <type>      SObject type (Account, Contact, etc.)",
  "  --query <soql>       SOQL query string",
  "  --fields <json>      JSON object of field values",
  "  --limit <n>          Max results",
]);
