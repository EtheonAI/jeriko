import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("twilio", "Twilio (SMS, voice calls, WhatsApp)", [
  "\nCall Twilio API methods through the connector.",
  "\nResources & Actions:",
  "  messages   send | list | get <sid>",
  "  calls      create | list | get <sid> | update <sid>",
  "  recordings list | get <sid>",
  "  lookups    phone <number>",
  "  numbers    list",
  "  account    get",
  "\nShorthand:",
  "  sms  → messages.send",
  "  call → calls.create",
  "\nFlags:",
  "  --to <number>            Recipient phone number",
  "  --from <number>          Sender phone number",
  "  --body <text>            Message body",
  "  --url <url>              TwiML URL for voice calls",
  "  --status-callback <url>  Status callback URL",
  "  --media-url <url>        MMS media URL",
]);
