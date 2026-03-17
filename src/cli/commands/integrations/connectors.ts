/**
 * Unified connector gateway — list, health, info, and call any connector method.
 *
 * Usage:
 *   jeriko connectors                           → list all with status
 *   jeriko connectors health                    → health-check all configured
 *   jeriko connectors health <name>             → health-check specific
 *   jeriko connectors info <name>               → show env/oauth details
 *   jeriko connectors <name> <method> [--flags] → call a connector method
 *
 * The last form is the unified dispatch — routes to the connector's call() method
 * so agents and users can invoke ANY connector without per-connector CLI commands.
 */

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import {
  CONNECTOR_DEFS,
  getConnectorDef,
  isConnectorConfigured,
  isSlotSet,
  slotLabel,
  resolveMethod,
  collectFlags,
} from "../../../shared/connector.js";
import { isOAuthCapable } from "../../../daemon/services/oauth/providers.js";
import { CONNECTOR_FACTORIES, loadConnector } from "../../../daemon/services/connectors/registry.js";

// Re-export for test compatibility
export { CONNECTOR_FACTORIES, loadConnector };

// ---------------------------------------------------------------------------
// Reserved subcommands — anything else is treated as a connector name
// ---------------------------------------------------------------------------

const SUBCOMMANDS = new Set(["list", "health", "info"]);

export const command: CommandHandler = {
  name: "connectors",
  description: "Unified connector gateway (list, health, info, call)",
  async run(args: string[]) {
    // Load secrets so OAuth tokens (STRIPE_ACCESS_TOKEN, etc.) are available
    // in the CLI process — they're stored in ~/.config/jeriko/.env by the daemon.
    const { loadSecrets } = await import("../../../shared/secrets.js");
    loadSecrets();

    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko connectors                           List all connectors with status");
      console.log("       jeriko connectors health                    Health check all configured connectors");
      console.log("       jeriko connectors health <name>             Health check specific connector");
      console.log("       jeriko connectors info <name>               Show connector details");
      console.log("       jeriko connectors <name> <method> [--flags] Call any connector method");
      console.log("\nUnified connector gateway — manage and call all connectors from one command.");
      console.log("\nConnectors: " + CONNECTOR_DEFS.map((d) => d.name).join(", "));
      console.log("\nExamples:");
      console.log("  jeriko connectors gmail messages.list --q 'is:unread'");
      console.log("  jeriko connectors stripe customers list --limit 5");
      console.log("  jeriko connectors outlook messages send --to user@example.com --subject Hi --body Hello");
      console.log("  jeriko connectors github repos list");
      console.log("  jeriko connectors health gmail");
      console.log("  jeriko connectors info stripe");
      process.exit(0);
    }

    const first = parsed.positional[0] ?? "list";

    // Management subcommands
    if (SUBCOMMANDS.has(first)) {
      const target = parsed.positional[1];
      switch (first) {
        case "list":
          return listConnectors();
        case "health":
          return target ? healthOne(target) : healthAll();
        case "info":
          if (!target) fail("Usage: jeriko connectors info <name>");
          return infoConnector(target);
      }
      return;
    }

    // Unified dispatch: first arg is a connector name, rest is method + flags
    const connectorName = first;
    const def = getConnectorDef(connectorName);
    if (!def) {
      fail(`Unknown connector or subcommand: "${connectorName}". Use --help for usage.`);
      return;
    }

    if (!isConnectorConfigured(connectorName)) {
      const vars = def.required.map(slotLabel).join(", ");
      fail(`Connector "${connectorName}" is not configured. Set: ${vars}`, 3);
      return;
    }

    // Resolve method from remaining positionals
    const methodArgs = parsed.positional.slice(1);
    const { method, rest } = resolveMethod(methodArgs);
    if (!method) {
      fail(`Missing method. Usage: jeriko connectors ${connectorName} <resource> <action> [--flags]`);
      return;
    }

    try {
      const connector = await loadConnector(connectorName);
      const params = collectFlags(parsed.flags);

      // First remaining positional → generic id param
      if (rest[0] && !params.id) {
        params.id = rest[0];
      }

      // Data-driven limit param mapping from ConnectorDef.limitParam
      if (params.limit && def.limitParam && def.limitParam !== "limit") {
        params[def.limitParam] = params.limit;
        delete params.limit;
      }

      const result = await connector.call(method, params);
      if (result.ok) {
        ok(result.data);
      } else {
        fail(result.error ?? `${def.label} API call failed`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Connector "${connectorName}" error: ${msg}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Management: list
// ---------------------------------------------------------------------------

function listConnectors(): void {
  const connectors = CONNECTOR_DEFS.map((def) => ({
    name: def.name,
    label: def.label,
    description: def.description,
    configured: isConnectorConfigured(def.name),
    oauth: isOAuthCapable(def.name),
  }));
  ok(connectors);
}

// ---------------------------------------------------------------------------
// Management: health
// ---------------------------------------------------------------------------

async function healthAll(): Promise<void> {
  const configured = CONNECTOR_DEFS.filter((def) => isConnectorConfigured(def.name));

  if (configured.length === 0) {
    ok({ message: "No connectors configured", connectors: [] });
    return;
  }

  const results = await Promise.all(
    configured.map(async (def) => {
      try {
        const connector = await loadConnector(def.name);
        const result = await connector.health();
        return { name: def.name, label: def.label, ...result };
      } catch (err) {
        return {
          name: def.name,
          label: def.label,
          healthy: false,
          latency_ms: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  ok(results);
}

async function healthOne(name: string): Promise<void> {
  const def = getConnectorDef(name);
  if (!def) fail(`Unknown connector: "${name}"`);

  if (!isConnectorConfigured(name)) {
    fail(`Connector "${name}" is not configured. Missing required env vars.`, 3);
  }

  try {
    const connector = await loadConnector(name);
    const result = await connector.health();
    ok({ name, label: def!.label, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Health check failed for "${name}": ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Management: info
// ---------------------------------------------------------------------------

function infoConnector(name: string): void {
  const def = getConnectorDef(name);
  if (!def) fail(`Unknown connector: "${name}"`);

  const info = {
    name: def!.name,
    label: def!.label,
    description: def!.description,
    configured: isConnectorConfigured(name),
    oauth: isOAuthCapable(name),
    env_vars: {
      required: def!.required.map((entry) => ({
        name: slotLabel(entry),
        set: isSlotSet(entry),
      })),
      optional: def!.optional.map((v) => ({
        name: v,
        set: !!process.env[v],
      })),
    },
    oauth_config: def!.oauth
      ? {
          client_id_var: def!.oauth.clientIdVar,
          client_id_set: !!process.env[def!.oauth.clientIdVar],
          client_secret_var: def!.oauth.clientSecretVar,
          client_secret_set: !!process.env[def!.oauth.clientSecretVar],
        }
      : null,
  };

  ok(info);
}
