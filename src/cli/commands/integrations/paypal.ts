import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("paypal", "PayPal (orders, subscriptions, payouts, invoices)", [
  "\nCall PayPal API methods through the connector.",
  "\nResources & Actions:",
  "  orders         get <id> | create | capture <id>",
  "  payments       get <id> | refund <id>",
  "  subscriptions  list | get <id> | create | cancel <id> | suspend <id> | activate <id>",
  "  plans          list | get <id> | create",
  "  products       list | get <id> | create",
  "  invoices       list | get <id> | create | send <id> | cancel <id> | remind <id>",
  "  payouts        create | get <id>",
  "  disputes       list | get <id>",
  "  webhooks       list | create | delete <id>",
  "\nFlags:",
  "  --id <id>         Resource ID",
  "  --limit <n>       Max results",
  "  --amount <obj>    Amount object",
  "  --currency <code> Currency code",
  "  --email <addr>    Email address",
  "  --plan-id <id>    Plan ID",
  "  --reason <text>   Reason text",
  "  --description <t> Description",
]);
