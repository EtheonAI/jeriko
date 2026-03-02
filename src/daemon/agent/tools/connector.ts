// Tool — Connector API calls.
// Gives the agent direct access to all configured connectors (Gmail, Stripe,
// GitHub, Twilio, etc.) via the ConnectorManager.
//
// This tool is the bridge between the AI agent and external services.
// The agent calls `connector` with a connector name, method, and parameters,
// and the tool dispatches to the connector's API handler.
//
// Example:
//   connector({ name: "gmail", method: "messages.send", params: { raw: "..." } })
//   connector({ name: "gmail", method: "messages.list", params: { q: "is:unread" } })
//   connector({ name: "stripe", method: "customers.list", params: { limit: 10 } })

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import type { ConnectorManager } from "../../services/connectors/manager.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// ConnectorManager access — set by kernel at boot (step 10.5)
// ---------------------------------------------------------------------------

let connectorManager: ConnectorManager | null = null;

/** Inject the ConnectorManager so the tool can dispatch API calls. */
export function setConnectorManager(manager: ConnectorManager): void {
  connectorManager = manager;
}

// ---------------------------------------------------------------------------
// Tool implementation
// ---------------------------------------------------------------------------

async function execute(args: Record<string, unknown>): Promise<string> {
  const name = args.name as string;
  const method = args.method as string;
  const params = (args.params as Record<string, unknown>) ?? {};

  if (!name) return JSON.stringify({ ok: false, error: "name is required (e.g. 'gmail', 'stripe')" });
  if (!method) return JSON.stringify({ ok: false, error: "method is required (e.g. 'messages.send', 'customers.list')" });

  if (!connectorManager) {
    return JSON.stringify({ ok: false, error: "Connector manager not available" });
  }

  try {
    const connector = await connectorManager.get(name);
    if (!connector) {
      return JSON.stringify({ ok: false, error: `Connector "${name}" is not configured` });
    }

    const result = await connector.call(method, params);
    log.debug(`Connector tool: ${name}.${method} → ok=${result.ok}`);
    return JSON.stringify(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Connector tool error: ${name}.${method} — ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
}

export const connectorTool: ToolDefinition = {
  id: "connector",
  name: "connector",
  description:
    "Call a configured connector API (Gmail, Stripe, GitHub, Twilio, etc.). " +
    "Use this to send emails, list messages, create charges, manage repos, and more. " +
    "Each connector has methods like 'messages.list', 'messages.send', 'customers.create'.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Connector name: gmail, stripe, github, twilio, outlook, gdrive, paypal",
      },
      method: {
        type: "string",
        description: "API method to call (e.g. 'messages.list', 'messages.send', 'profile')",
      },
      params: {
        type: "object",
        description: "Method parameters (varies by connector and method)",
      },
    },
    required: ["name", "method"],
  },
  execute,
  aliases: ["connectors", "gmail", "stripe", "github", "twilio", "email_send", "send_email"],
};

registerTool(connectorTool);
