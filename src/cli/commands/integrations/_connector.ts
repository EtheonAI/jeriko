/**
 * Connector command factory — generates CLI CommandHandlers for any connector.
 *
 * Eliminates boilerplate: each per-connector CLI file becomes a thin delegate
 * that calls this factory with connector-specific help text. All dispatch logic
 * (env check, init, method resolution, limit mapping, call, error handling)
 * lives here once.
 *
 * Usage:
 *   export const command = connectorCommand("stripe", "Stripe (charges, ...)", [...helpLines]);
 */

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import {
  getConnectorDef,
  isConnectorConfigured,
  slotLabel,
  resolveMethod,
  collectFlags,
} from "../../../shared/connector.js";
import { loadConnector } from "../../../daemon/services/connectors/registry.js";

/**
 * Options for connector-specific behavior.
 */
interface ConnectorCommandOpts {
  /**
   * Custom handler for remaining positional args after method resolution.
   * If provided, replaces the default `rest[0] → params.id` behavior.
   * Use for connectors with non-standard positional semantics (e.g. X's text joining).
   */
  prepareParams?: (method: string, params: Record<string, unknown>, rest: string[]) => void;
}

/**
 * Create a CLI command for a connector.
 *
 * @param name        - Connector name (must match CONNECTOR_DEFS entry)
 * @param description - Short description for dispatcher help
 * @param helpLines   - Per-connector help text lines (resources, flags, examples)
 * @param opts        - Optional connector-specific behavior overrides
 */
export function connectorCommand(
  name: string,
  description: string,
  helpLines: string[],
  opts?: ConnectorCommandOpts,
): CommandHandler {
  return {
    name,
    description,
    async run(args: string[]) {
      const parsed = parseArgs(args);

      if (flagBool(parsed, "help")) {
        console.log(`Usage: jeriko ${name} <resource> <action> [--flags]`);
        console.log(`       jeriko ${name} <resource.action> [--flags]`);
        for (const line of helpLines) console.log(line);
        process.exit(0);
      }

      const def = getConnectorDef(name);
      if (!def) {
        fail(`Unknown connector: "${name}"`);
        return;
      }

      if (!isConnectorConfigured(name)) {
        const vars = def.required.map(slotLabel).join(", ");
        fail(`${def.label} not configured. Set: ${vars}`, 3);
        return;
      }

      const { method, rest } = resolveMethod(parsed.positional);
      if (!method) {
        fail(`Missing method. Usage: jeriko ${name} <resource> <action> [--flags]`);
        return;
      }

      try {
        const connector = await loadConnector(name);
        const params = collectFlags(parsed.flags);

        // Handle remaining positionals — custom or default (rest[0] → id)
        if (opts?.prepareParams) {
          opts.prepareParams(method, params, rest);
        } else if (rest[0] && !params.id) {
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
        fail(`${def.label} connector error: ${msg}`);
      }
    },
  };
}
