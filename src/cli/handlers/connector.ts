/**
 * Connector & Channel command handlers.
 */

import type { Backend } from "../backend.js";
import type { AppAction } from "../types.js";
import {
  formatConnectorList,
  formatChannelList,
  formatChannelHelp,
  formatChannelSetupHint,
  formatTriggerList,
  formatAuthStatus,
  formatAuthDetail,
  formatError,
} from "../format.js";
import { t } from "../theme.js";

export interface ConnectorCommandContext {
  backend: Backend;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
}

function requireDaemon(ctx: ConnectorCommandContext, label: string): boolean {
  if (ctx.backend.mode !== "daemon") {
    ctx.addSystemMessage(t.muted(`${label} require the daemon. Start with: jeriko server start`));
    return false;
  }
  return true;
}

export function createConnectorHandlers(ctx: ConnectorCommandContext) {
  const { backend, addSystemMessage } = ctx;

  return {
    async connectors(): Promise<void> {
      if (!requireDaemon(ctx, "Connectors")) return;
      const connectors = await backend.listConnectors();
      addSystemMessage(formatConnectorList(connectors));
    },

    async connect(args: string): Promise<void> {
      if (!requireDaemon(ctx, "Connectors")) return;
      const svcName = args.trim();
      if (!svcName) {
        addSystemMessage(t.yellow("Usage: /connect <service-name>"));
        return;
      }
      const result = await backend.connectService(svcName);
      if (!result.ok) {
        addSystemMessage(formatError(result.error ?? `Failed to connect "${svcName}"`));
      } else if (result.status === "already_connected") {
        addSystemMessage(t.muted(`${svcName} is already connected. Use /disconnect ${svcName} to remove it first.`));
      } else if (result.status === "oauth_required" && result.loginUrl) {
        addSystemMessage(
          t.blue(`Connect ${result.label ?? svcName}:\n`) +
          t.underline(result.loginUrl) + "\n" +
          t.dim("Link expires in 10 minutes."),
        );
      } else {
        addSystemMessage(t.green(`✓ ${result.label ?? svcName} connected`));
      }
    },

    async disconnect(args: string): Promise<void> {
      if (!requireDaemon(ctx, "Connectors")) return;
      const svcName = args.trim();
      if (!svcName) {
        addSystemMessage(t.yellow("Usage: /disconnect <service-name>"));
        return;
      }
      const result = await backend.disconnectService(svcName);
      if (!result.ok) {
        addSystemMessage(formatError(result.error ?? `Failed to disconnect "${svcName}"`));
      } else {
        addSystemMessage(t.green(`✓ ${result.label ?? svcName} disconnected`));
      }
    },

    async channels(): Promise<void> {
      if (!requireDaemon(ctx, "Channels")) return;
      const channels = await backend.listChannels();
      const rows = channels.map((ch) => ({
        name: ch.name,
        status: ch.status,
        error: ch.error,
        connected_at: ch.connectedAt,
      }));
      addSystemMessage(formatChannelList(rows));
    },

    async channel(args: string): Promise<void> {
      if (!requireDaemon(ctx, "Channels")) return;
      const spaceIdx = args.indexOf(" ");
      if (spaceIdx === -1) {
        addSystemMessage(formatChannelHelp());
        return;
      }
      const action = args.slice(0, spaceIdx).trim();
      const channelName = args.slice(spaceIdx + 1).trim();

      if (action === "connect") {
        const result = await backend.connectChannel(channelName);
        if (result.ok) {
          addSystemMessage(t.green(`✓ Channel "${channelName}" connected`));
        } else {
          addSystemMessage(formatError(result.error ?? `Failed to connect "${channelName}"`));
          addSystemMessage(formatChannelSetupHint(channelName));
        }
      } else if (action === "disconnect") {
        const result = await backend.disconnectChannel(channelName);
        if (result.ok) {
          addSystemMessage(t.green(`✓ Channel "${channelName}" disconnected`));
        } else {
          addSystemMessage(formatError(result.error ?? `Failed to disconnect "${channelName}"`));
        }
      } else if (action === "add") {
        const result = await backend.addChannel(channelName);
        if (result.ok) {
          addSystemMessage(t.green(`✓ Channel "${channelName}" added and connected`));
        } else {
          addSystemMessage(formatError(result.error ?? `Failed to add "${channelName}"`));
        }
      } else if (action === "remove" || action === "rm") {
        const result = await backend.removeChannel(channelName);
        if (result.ok) {
          addSystemMessage(t.green(`✓ Channel "${channelName}" removed`));
        } else {
          addSystemMessage(formatError(result.error ?? `Failed to remove "${channelName}"`));
        }
      } else {
        addSystemMessage(formatChannelHelp());
      }
    },

    async triggers(): Promise<void> {
      if (!requireDaemon(ctx, "Triggers")) return;
      const triggers = await backend.listTriggers();
      addSystemMessage(formatTriggerList(triggers));
    },

    async auth(args: string): Promise<void> {
      const authArg = args.trim();

      if (!authArg) {
        try {
          const connectors = await backend.getAuthStatus();
          addSystemMessage(formatAuthStatus(connectors));
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      const parts = authArg.split(/\s+/);
      const connectorName = parts[0]!;
      const keys = parts.slice(1);

      if (keys.length === 0) {
        try {
          const connectors = await backend.getAuthStatus();
          const detail = connectors.find((c) => c.name === connectorName);
          if (!detail) {
            addSystemMessage(formatError(`Unknown connector: ${connectorName}`));
          } else {
            addSystemMessage(formatAuthDetail(detail));
          }
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      try {
        const result = await backend.saveAuth(connectorName, keys);
        addSystemMessage(t.green(`${result.label}: ${result.saved} key(s) saved.`));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },
  };
}
