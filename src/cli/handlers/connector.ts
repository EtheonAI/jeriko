/**
 * Connector & Channel command handlers.
 *
 * All commands that previously required typed arguments now launch
 * interactive wizard flows with selector menus and text input prompts.
 */

import type { Backend, ChannelAddCallbacks } from "../backend.js";
import type { AppAction, WizardConfig } from "../types.js";
import {
  formatConnectorList,
  formatChannelList,
  formatChannelHelp,
  formatChannelSetupHint,
  formatAuthStatus,
  formatAuthDetail,
  formatError,
} from "../format.js";
import { t } from "../theme.js";
import { renderQRText } from "../../daemon/services/channels/lifecycle.js";

export interface ConnectorCommandContext {
  backend: Backend;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
  wizardConfigRef: React.MutableRefObject<WizardConfig | null>;
}

function requireDaemon(ctx: ConnectorCommandContext, label: string): boolean {
  if (ctx.backend.mode !== "daemon") {
    ctx.addSystemMessage(t.muted(`${label} require the daemon. Start with: jeriko server start`));
    return false;
  }
  return true;
}

/** Launch a wizard. Wraps onComplete with error handling so async failures show a message. */
function launchWizard(ctx: ConnectorCommandContext, config: WizardConfig): void {
  const originalOnComplete = config.onComplete;
  ctx.wizardConfigRef.current = {
    ...config,
    onComplete: async (results: string[]) => {
      try {
        await originalOnComplete(results);
      } catch (err: unknown) {
        ctx.dispatch({ type: "SET_PHASE", phase: "idle" });
        ctx.addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },
  };
  ctx.dispatch({ type: "SET_PHASE", phase: "wizard" });
}

// Available channels for the picker
const CHANNEL_OPTIONS = [
  { value: "telegram", label: "Telegram", hint: "Bot via BotFather" },
  { value: "whatsapp", label: "WhatsApp", hint: "WhatsApp Web bridge" },
];

/**
 * Build ChannelAddCallbacks that render a single WhatsApp QR code in the CLI.
 * Only the first QR is displayed — subsequent Baileys QR rotations are ignored
 * since the user is already scanning. The connection has a 120s timeout; if it
 * expires the user can retry with /channel add whatsapp.
 */
function buildQRCallbacks(addSystemMessage: (content: string) => void): ChannelAddCallbacks {
  let qrSent = false;
  return {
    onQR: async (qr: string) => {
      if (qrSent) return;
      qrSent = true;
      const rendered = await renderQRText(qr);
      if (rendered) {
        addSystemMessage(
          `${t.bold("Scan this QR code with WhatsApp → Linked Devices → Link a Device:")}\n\n${rendered}`,
        );
      } else {
        addSystemMessage(t.muted("QR code received but could not render. Check daemon terminal."));
      }
    },
  };
}

export function createConnectorHandlers(ctx: ConnectorCommandContext) {
  const { backend, dispatch, addSystemMessage } = ctx;

  return {
    async connectors(): Promise<void> {
      if (!requireDaemon(ctx, "Connectors")) return;
      const connectors = await backend.listConnectors();

      // If no connectors, offer to connect one
      if (connectors.length === 0 || connectors.every((c) => c.status === "disconnected")) {
        addSystemMessage(formatConnectorList(connectors));
        // Offer interactive connect
        const available = connectors.filter((c) => c.status === "disconnected");
        if (available.length > 0) {
          launchWizard(ctx, {
            title: "Connect a Service",
            steps: [
              {
                type: "select",
                message: "Choose a service to connect:",
                options: available.map((c) => ({
                  value: c.name,
                  label: c.name,
                  hint: c.type,
                })),
              },
            ],
            onComplete: async ([svcName]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              const result = await backend.connectService(svcName!);
              if (!result.ok) {
                addSystemMessage(formatError(result.error ?? `Failed to connect "${svcName}"`));
              } else if (result.status === "oauth_required" && result.loginUrl) {
                addSystemMessage(
                  t.blue(`Connect ${result.label ?? svcName}:\n`) +
                  t.underline(result.loginUrl) + "\n" +
                  t.dim("Link expires in 10 minutes."),
                );
              } else {
                addSystemMessage(t.green(`\u2713 ${result.label ?? svcName} connected`));
              }
            },
          });
        }
        return;
      }

      addSystemMessage(formatConnectorList(connectors));
    },

    async connect(args: string): Promise<void> {
      if (!requireDaemon(ctx, "Connectors")) return;
      const svcName = args.trim();

      // No arg → interactive picker
      if (!svcName) {
        try {
          const connectors = await backend.listConnectors();
          const disconnected = connectors.filter((c) => c.status === "disconnected" || c.status === "error");
          if (disconnected.length === 0) {
            addSystemMessage(t.muted("All services are already connected."));
            return;
          }
          launchWizard(ctx, {
            title: "Connect a Service",
            steps: [
              {
                type: "select",
                message: "Choose a service to connect:",
                options: disconnected.map((c) => ({
                  value: c.name,
                  label: c.name,
                  hint: c.type,
                })),
              },
            ],
            onComplete: async ([selected]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              const result = await backend.connectService(selected!);
              if (!result.ok) {
                addSystemMessage(formatError(result.error ?? `Failed to connect "${selected}"`));
              } else if (result.status === "oauth_required" && result.loginUrl) {
                addSystemMessage(
                  t.blue(`Connect ${result.label ?? selected}:\n`) +
                  t.underline(result.loginUrl) + "\n" +
                  t.dim("Link expires in 10 minutes."),
                );
              } else {
                addSystemMessage(t.green(`\u2713 ${result.label ?? selected} connected`));
              }
            },
          });
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      // Direct connect with name
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
        addSystemMessage(t.green(`\u2713 ${result.label ?? svcName} connected`));
      }
    },

    async disconnect(args: string): Promise<void> {
      if (!requireDaemon(ctx, "Connectors")) return;
      const svcName = args.trim();

      // No arg → interactive picker of connected services
      if (!svcName) {
        try {
          const connectors = await backend.listConnectors();
          const connected = connectors.filter((c) => c.status === "connected");
          if (connected.length === 0) {
            addSystemMessage(t.muted("No connected services to disconnect."));
            return;
          }
          launchWizard(ctx, {
            title: "Disconnect a Service",
            steps: [
              {
                type: "select",
                message: "Choose a service to disconnect:",
                options: connected.map((c) => ({
                  value: c.name,
                  label: c.name,
                  hint: c.type,
                })),
              },
            ],
            onComplete: async ([selected]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              const result = await backend.disconnectService(selected!);
              if (!result.ok) {
                addSystemMessage(formatError(result.error ?? `Failed to disconnect "${selected}"`));
              } else {
                addSystemMessage(t.green(`\u2713 ${result.label ?? selected} disconnected`));
              }
            },
          });
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      const result = await backend.disconnectService(svcName);
      if (!result.ok) {
        addSystemMessage(formatError(result.error ?? `Failed to disconnect "${svcName}"`));
      } else {
        addSystemMessage(t.green(`\u2713 ${result.label ?? svcName} disconnected`));
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

      const trimmed = args.trim();

      // No args → interactive action menu
      if (!trimmed) {
        launchWizard(ctx, {
          title: "Channels",
          steps: [
            {
              type: "select",
              message: "What would you like to do?",
              options: [
                { value: "add", label: "Add a channel", hint: "configure and connect" },
                { value: "connect", label: "Connect a channel", hint: "start an existing channel" },
                { value: "disconnect", label: "Disconnect a channel", hint: "stop a running channel" },
                { value: "remove", label: "Remove a channel", hint: "delete configuration" },
              ],
            },
          ],
          onComplete: async ([action]) => {
            dispatch({ type: "SET_PHASE", phase: "idle" });
            // Chain to the specific sub-flow
            if (action === "add") {
              await channelAddWizard();
            } else if (action === "connect") {
              await channelConnectWizard();
            } else if (action === "disconnect") {
              await channelDisconnectWizard();
            } else if (action === "remove") {
              await channelRemoveWizard();
            }
          },
        });
        return;
      }

      // Parse: "connect telegram" or "add telegram <token>"
      const spaceIdx = trimmed.indexOf(" ");
      if (spaceIdx === -1) {
        // Just an action name with no channel → launch appropriate wizard
        const action = trimmed;
        if (action === "connect") {
          await channelConnectWizard();
        } else if (action === "disconnect") {
          await channelDisconnectWizard();
        } else if (action === "add") {
          await channelAddWizard();
        } else if (action === "remove" || action === "rm") {
          await channelRemoveWizard();
        } else {
          addSystemMessage(formatChannelHelp());
        }
        return;
      }

      const action = trimmed.slice(0, spaceIdx).trim();
      const rest = trimmed.slice(spaceIdx + 1).trim();
      const parts = rest.split(/\s+/);
      const channelName = parts[0] ?? "";
      const tokens = parts.slice(1);

      if (action === "connect") {
        const result = await backend.connectChannel(channelName);
        if (result.ok) {
          addSystemMessage(t.green(`\u2713 Channel "${channelName}" connected`));
        } else {
          addSystemMessage(formatError(result.error ?? `Failed to connect "${channelName}"`));
          addSystemMessage(formatChannelSetupHint(channelName));
        }
      } else if (action === "disconnect") {
        const result = await backend.disconnectChannel(channelName);
        if (result.ok) {
          addSystemMessage(t.green(`\u2713 Channel "${channelName}" disconnected`));
        } else {
          addSystemMessage(formatError(result.error ?? `Failed to disconnect "${channelName}"`));
        }
      } else if (action === "add") {
        // If token provided inline, use it
        if (channelName === "telegram" && tokens[0]) {
          const result = await backend.addChannel(channelName, { token: tokens[0] });
          if (result.ok) {
            addSystemMessage(t.green(`\u2713 Channel "${channelName}" added and connected`));
          } else {
            addSystemMessage(formatError(result.error ?? `Failed to add "${channelName}"`));
          }
          return;
        }
        if (channelName === "whatsapp") {
          addSystemMessage(t.muted("Connecting WhatsApp — QR code will appear shortly..."));
          const result = await backend.addChannel(channelName, { enabled: true }, buildQRCallbacks(addSystemMessage));
          if (result.ok) {
            addSystemMessage(t.green(`\u2713 Channel "whatsapp" added and connected`));
          } else {
            addSystemMessage(formatError(result.error ?? `Failed to add "whatsapp"`));
          }
          return;
        }
        // No token → launch token wizard for this channel
        if (channelName === "telegram") {
          launchWizard(ctx, {
            title: "Add Telegram Channel",
            steps: [
              {
                type: "text",
                message: "Enter your Telegram bot token (from @BotFather):",
                placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
                validate: (v) => v.length < 10 ? "Token too short" : undefined,
              },
            ],
            onComplete: async ([token]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              const result = await backend.addChannel("telegram", { token: token! });
              if (result.ok) {
                addSystemMessage(t.green(`\u2713 Channel "telegram" added and connected`));
              } else {
                addSystemMessage(formatError(result.error ?? `Failed to add "telegram"`));
              }
            },
          });
          return;
        }
        addSystemMessage(formatChannelSetupHint(channelName));
      } else if (action === "remove" || action === "rm") {
        const result = await backend.removeChannel(channelName);
        if (result.ok) {
          addSystemMessage(t.green(`\u2713 Channel "${channelName}" removed`));
        } else {
          addSystemMessage(formatError(result.error ?? `Failed to remove "${channelName}"`));
        }
      } else {
        addSystemMessage(formatChannelHelp());
      }
    },

    async auth(args: string): Promise<void> {
      const authArg = args.trim();

      // No arg → interactive connector picker for auth
      if (!authArg) {
        try {
          const connectors = await backend.getAuthStatus();
          if (connectors.length === 0) {
            addSystemMessage(t.muted("No connectors available."));
            return;
          }
          launchWizard(ctx, {
            title: "Authentication",
            steps: [
              {
                type: "select",
                message: "Choose a connector to configure:",
                options: connectors.map((c) => ({
                  value: c.name,
                  label: c.label || c.name,
                  hint: c.configured ? "configured" : "not configured",
                })),
              },
            ],
            onComplete: async ([selected]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              const detail = connectors.find((c) => c.name === selected);
              if (detail) {
                addSystemMessage(formatAuthDetail(detail));
                // If there are required keys not set, prompt for them
                const missing = detail.required.filter((k) => !k.set);
                if (missing.length > 0) {
                  const steps = missing.map((k) => ({
                    type: "password" as const,
                    message: `Enter ${k.label} (${k.variable}):`,
                    validate: (v: string) => v.length < 1 ? "Value required" : undefined,
                  }));
                  launchWizard(ctx, {
                    title: `Configure ${detail.label || detail.name}`,
                    steps,
                    onComplete: async (values) => {
                      dispatch({ type: "SET_PHASE", phase: "idle" });
                      try {
                        const keys = missing.map((k, i) => `${k.variable}=${values[i]}`);
                        const result = await backend.saveAuth(detail.name, keys);
                        addSystemMessage(t.green(`${result.label}: ${result.saved} key(s) saved.`));
                      } catch (err) {
                        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
                      }
                    },
                  });
                }
              } else {
                addSystemMessage(formatError(`Unknown connector: ${selected}`));
              }
            },
          });
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      // Direct auth with connector name
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

  // ── Channel sub-wizards (chained from action picker) ──────────────────

  async function channelAddWizard(): Promise<void> {
    launchWizard(ctx, {
      title: "Add a Channel",
      steps: [
        {
          type: "select",
          message: "Choose a channel to add:",
          options: CHANNEL_OPTIONS,
        },
      ],
      onComplete: async ([channelName]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        if (channelName === "whatsapp") {
          addSystemMessage(t.muted("Connecting WhatsApp — QR code will appear shortly..."));
          const result = await backend.addChannel("whatsapp", { enabled: true }, buildQRCallbacks(addSystemMessage));
          if (result.ok) {
            addSystemMessage(t.green(`\u2713 Channel "whatsapp" added and connected`));
          } else {
            addSystemMessage(formatError(result.error ?? `Failed to add "whatsapp"`));
          }
        } else if (channelName === "telegram") {
          // Chain: ask for token
          launchWizard(ctx, {
            title: "Add Telegram Channel",
            steps: [
              {
                type: "text",
                message: "Enter your Telegram bot token (from @BotFather):",
                placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
                validate: (v) => v.length < 10 ? "Token too short" : undefined,
              },
            ],
            onComplete: async ([token]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              const result = await backend.addChannel("telegram", { token: token! });
              if (result.ok) {
                addSystemMessage(t.green(`\u2713 Channel "telegram" added and connected`));
              } else {
                addSystemMessage(formatError(result.error ?? `Failed to add "telegram"`));
              }
            },
          });
        }
      },
    });
  }

  async function channelConnectWizard(): Promise<void> {
    launchWizard(ctx, {
      title: "Connect a Channel",
      steps: [
        {
          type: "select",
          message: "Choose a channel to connect:",
          options: CHANNEL_OPTIONS,
        },
      ],
      onComplete: async ([channelName]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const result = await backend.connectChannel(channelName!);
        if (result.ok) {
          addSystemMessage(t.green(`\u2713 Channel "${channelName}" connected`));
        } else {
          addSystemMessage(formatError(result.error ?? `Failed to connect "${channelName}"`));
          addSystemMessage(formatChannelSetupHint(channelName!));
        }
      },
    });
  }

  async function channelDisconnectWizard(): Promise<void> {
    try {
      const channels = await backend.listChannels();
      const connected = channels.filter((ch) => ch.status === "connected");
      if (connected.length === 0) {
        addSystemMessage(t.muted("No connected channels to disconnect."));
        return;
      }
      launchWizard(ctx, {
        title: "Disconnect a Channel",
        steps: [
          {
            type: "select",
            message: "Choose a channel to disconnect:",
            options: connected.map((ch) => ({
              value: ch.name,
              label: ch.name,
            })),
          },
        ],
        onComplete: async ([channelName]) => {
          dispatch({ type: "SET_PHASE", phase: "idle" });
          const result = await backend.disconnectChannel(channelName!);
          if (result.ok) {
            addSystemMessage(t.green(`\u2713 Channel "${channelName}" disconnected`));
          } else {
            addSystemMessage(formatError(result.error ?? `Failed to disconnect "${channelName}"`));
          }
        },
      });
    } catch (err) {
      addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
    }
  }

  async function channelRemoveWizard(): Promise<void> {
    launchWizard(ctx, {
      title: "Remove a Channel",
      steps: [
        {
          type: "select",
          message: "Choose a channel to remove:",
          options: CHANNEL_OPTIONS,
        },
      ],
      onComplete: async ([channelName]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const result = await backend.removeChannel(channelName!);
        if (result.ok) {
          addSystemMessage(t.green(`\u2713 Channel "${channelName}" removed`));
        } else {
          addSystemMessage(formatError(result.error ?? `Failed to remove "${channelName}"`));
        }
      },
    });
  }
}
