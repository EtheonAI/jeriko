/**
 * Connector & Channel command handlers.
 *
 * Unified commands:
 *   /connectors              → list all connectors with status
 *   /connectors connect <n>  → connect a service (OAuth or API key)
 *   /connectors disconnect <n> → disconnect a service
 *   /connectors auth [name]  → configure credentials
 *   /connectors health [n]   → check connector health
 *
 *   /channels                → channel hub (add, connect, disconnect, remove)
 */

import type { Backend, ChannelAddCallbacks, ConnectResult } from "../backend.js";
import type { AppAction, WizardConfig } from "../types.js";
import {
  formatConnectorList,
  formatChannelList,
  formatChannelHelp,
  formatChannelSetupHint,
  formatAuthStatus,
  formatAuthDetail,
  formatHealth,
  formatError,
} from "../format.js";
import { t } from "../theme.js";
import { openInBrowser } from "../lib/open-browser.js";
import { renderQRText } from "../../daemon/services/channels/lifecycle.js";

export interface ConnectorCommandContext {
  backend: Backend;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
  wizardConfigRef: React.MutableRefObject<WizardConfig | null>;
}

function requireDaemon(ctx: ConnectorCommandContext, label: string): boolean {
  if (ctx.backend.mode !== "daemon") {
    ctx.addSystemMessage(
      t.muted(`${label} requires the daemon.\n`) +
      t.muted(`  Start it:    jeriko server start\n`) +
      t.muted(`  Then re-run: jeriko`),
    );
    return false;
  }
  return true;
}

/** Launch a wizard. Wraps onComplete with error handling so async failures show a message. */
function launchWizard(ctx: ConnectorCommandContext, config: WizardConfig): void {
  const originalOnComplete = config.onComplete;
  ctx.wizardConfigRef.current = {
    ...config,
    onComplete: async (results: readonly string[]) => {
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Telegram bot token: numeric bot ID + colon + 30+ alphanumeric chars. */
const TELEGRAM_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{30,}$/;

function validateTelegramToken(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length < 10) return "Token too short";
  if (!TELEGRAM_TOKEN_PATTERN.test(trimmed)) {
    return "Invalid Telegram token format. Expected: 123456789:ABCDefgh...";
  }
  return undefined;
}

// Available channels for the picker
const CHANNEL_OPTIONS = [
  { value: "telegram", label: "Telegram", hint: "Bot via BotFather" },
  { value: "whatsapp", label: "WhatsApp", hint: "WhatsApp Web bridge" },
];

/**
 * Build ChannelAddCallbacks that render a single WhatsApp QR code in the CLI.
 */
function buildQRCallbacks(addSystemMessage: (content: string) => void): ChannelAddCallbacks {
  let qrSent = false;
  return {
    onQR: async (qr: string) => {
      if (qrSent) return;
      qrSent = true;
      const rendered = await renderQRText(qr);
      if (rendered) {
        addSystemMessage([
          t.bold("Scan this QR code to link a WhatsApp account as your AI agent:"),
          "",
          t.muted("  Use a second phone/SIM — this number becomes the bot."),
          t.muted("  Open WhatsApp on that phone → Linked Devices → Link a Device"),
          t.muted("  Then message that number from your main WhatsApp."),
          "",
          rendered,
        ].join("\n"));
      } else {
        addSystemMessage(t.muted("QR code received but could not render. Check daemon terminal."));
      }
    },
  };
}

export function createConnectorHandlers(ctx: ConnectorCommandContext) {
  const { backend, dispatch, addSystemMessage } = ctx;

  /** Providers that require extra context (e.g. Shopify needs a shop name). */
  const PROVIDER_PROMPTS: Record<string, { param: string; message: string; placeholder: string; hint: string }> = {
    shopify: {
      param: "shop",
      message: "Enter your Shopify store name:",
      placeholder: "my-store",
      hint: "Just the name — not the full URL. Example: my-store → my-store.myshopify.com",
    },
  };

  return {
    /**
     * /connectors — unified connector management.
     *
     *   /connectors                    → list all connectors with status
     *   /connectors connect [name]     → connect a service
     *   /connectors disconnect [name]  → disconnect a service
     *   /connectors auth [name] [keys] → configure credentials
     *   /connectors health [name]      → check health
     */
    async connectors(args: string): Promise<void> {
      if (!requireDaemon(ctx, "Connectors")) return;

      const trimmed = args.trim();
      const parts = trimmed.split(/\s+/);
      const subCmd = parts[0]?.toLowerCase() ?? "";
      const rest = parts.slice(1).join(" ").trim();

      // /connectors connect [name]
      if (subCmd === "connect") {
        await connectorConnect(rest);
        return;
      }

      // /connectors disconnect [name]
      if (subCmd === "disconnect") {
        await connectorDisconnect(rest);
        return;
      }

      // /connectors auth [name] [keys...]
      if (subCmd === "auth") {
        await connectorAuth(rest);
        return;
      }

      // /connectors health [name]
      if (subCmd === "health") {
        await connectorHealth(rest);
        return;
      }

      // /connectors (no args) → interactive action picker
      if (!subCmd) {
        try {
          const connectors = await backend.listConnectors();
          const connectedCount = connectors.filter((c) => c.status === "connected").length;
          const totalCount = connectors.length;

          launchWizard(ctx, {
            title: "Connectors",
            steps: [
              {
                type: "select",
                message: `${connectedCount}/${totalCount} connected — what would you like to do?`,
                options: [
                  { value: "connect", label: "Connect a service", hint: "OAuth login" },
                  { value: "disconnect", label: "Disconnect a service", hint: "remove credentials" },
                  { value: "auth", label: "Configure API keys", hint: "set or update keys" },
                  { value: "health", label: "Check health", hint: "test connectivity" },
                  { value: "list", label: "View all connectors", hint: `${totalCount} available` },
                ],
              },
            ],
            onComplete: async ([action]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              switch (action) {
                case "connect": await connectorConnect(""); break;
                case "disconnect": await connectorDisconnect(""); break;
                case "auth": await connectorAuth(""); break;
                case "health": await connectorHealth(""); break;
                default: addSystemMessage(formatConnectorList(connectors)); break;
              }
            },
          });
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      // Unrecognized subcommand → list all
      const connectors = await backend.listConnectors();
      addSystemMessage(formatConnectorList(connectors));
    },

    async channels(args: string): Promise<void> {
      if (!requireDaemon(ctx, "Channels")) return;

      const trimmed = args.trim();
      const spaceIdx = trimmed.indexOf(" ");
      const action = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx).trim();
      const restArgs = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

      // /channels list → flat list
      if (action === "list" || action === "ls") {
        const channels = await backend.listChannels();
        const rows = channels.map((ch) => ({
          name: ch.name,
          status: ch.status,
          error: ch.error,
          connected_at: ch.connectedAt,
        }));
        addSystemMessage(formatChannelList(rows));
        return;
      }

      // /channels (no args) → interactive action picker
      if (!trimmed) {
        try {
          const channels = await backend.listChannels();
          const connectedCount = channels.filter((ch) => ch.status === "connected").length;

          launchWizard(ctx, {
            title: "Channels",
            steps: [
              {
                type: "select",
                message: `${connectedCount} channel(s) active — what would you like to do?`,
                options: [
                  { value: "add", label: "Add a channel", hint: "Telegram or WhatsApp" },
                  { value: "connect", label: "Connect a channel", hint: "reconnect existing" },
                  { value: "disconnect", label: "Disconnect a channel", hint: "pause without removing" },
                  { value: "remove", label: "Remove a channel", hint: "delete completely" },
                  { value: "list", label: "View all channels", hint: `${channels.length} configured` },
                ],
              },
            ],
            onComplete: async ([action]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              switch (action) {
                case "add": await channelAddWizard(); break;
                case "connect": await channelConnectWizard(); break;
                case "disconnect": await channelDisconnectWizard(); break;
                case "remove": await channelRemoveWizard(); break;
                default: {
                  const rows = channels.map((ch) => ({
                    name: ch.name,
                    status: ch.status,
                    error: ch.error,
                    connected_at: ch.connectedAt,
                  }));
                  addSystemMessage(formatChannelList(rows));
                  break;
                }
              }
            },
          });
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      if (action === "connect") {
        if (!restArgs) {
          await channelConnectWizard();
        } else {
          const result = await backend.connectChannel(restArgs);
          if (result.ok) {
            addSystemMessage(t.green(`✓ Channel "${restArgs}" connected`));
          } else {
            addSystemMessage(formatError(result.error ?? `Failed to connect "${restArgs}"`));
            addSystemMessage(formatChannelSetupHint(restArgs));
          }
        }
        return;
      }

      if (action === "disconnect") {
        if (!restArgs) {
          await channelDisconnectWizard();
        } else {
          const result = await backend.disconnectChannel(restArgs);
          if (result.ok) {
            addSystemMessage(t.green(`✓ Channel "${restArgs}" disconnected`));
          } else {
            addSystemMessage(formatError(result.error ?? `Failed to disconnect "${restArgs}"`));
          }
        }
        return;
      }

      if (action === "add") {
        if (!restArgs) {
          await channelAddWizard();
          return;
        }
        const addParts = restArgs.split(/\s+/);
        const channelName = addParts[0] ?? "";
        const tokens = addParts.slice(1);
        await channelAddDirect(channelName, tokens);
        return;
      }

      if (action === "remove" || action === "rm") {
        if (!restArgs) {
          await channelRemoveWizard();
        } else {
          const result = await backend.removeChannel(restArgs);
          if (result.ok) {
            addSystemMessage(t.green(`✓ Channel "${restArgs}" removed`));
          } else {
            addSystemMessage(formatError(result.error ?? `Failed to remove "${restArgs}"`));
          }
        }
        return;
      }

      addSystemMessage(formatChannelHelp());
    },
  };

  // ── Connector sub-operations ──────────────────────────────────────────

  /** Show the OAuth result (login URL or success) to the user. */
  function showConnectResult(result: ConnectResult, name: string): void {
    if (!result.ok) {
      addSystemMessage(formatError(result.error ?? `Failed to connect "${name}"`));
    } else if (result.status === "already_connected") {
      addSystemMessage(t.muted(`${name} is already connected. Use /connectors disconnect ${name} to remove it first.`));
    } else if (result.status === "oauth_required" && result.loginUrl) {
      openInBrowser(result.loginUrl);
      addSystemMessage(
        t.blue(`Connect ${result.label ?? name}:\n`) +
        t.underline(result.loginUrl) + "\n" +
        t.dim("Link expires in 10 minutes."),
      );
    } else {
      addSystemMessage(t.green(`✓ ${result.label ?? name} connected`));
    }
  }

  /**
   * Connect a service, prompting for required context if needed.
   * e.g. Shopify needs a shop name before OAuth can start.
   */
  async function connectWithContext(name: string, extraArgs: string[]): Promise<void> {
    const prompt = PROVIDER_PROMPTS[name];
    if (prompt && extraArgs.length === 0) {
      // Provider needs context the user hasn't provided — ask via wizard
      launchWizard(ctx, {
        title: `Connect ${name}`,
        steps: [
          {
            type: "text",
            message: prompt.message,
            placeholder: prompt.placeholder,
            validate: (v: string) => v.trim().length < 1 ? "Value required" : undefined,
          },
        ],
        onComplete: async ([value]) => {
          dispatch({ type: "SET_PHASE", phase: "idle" });
          const result = await backend.connectService(name, [value!.trim()]);
          showConnectResult(result, name);
        },
      });
      addSystemMessage(t.dim(prompt.hint));
      return;
    }

    const result = await backend.connectService(name, extraArgs);
    showConnectResult(result, name);
  }

  async function connectorConnect(svcInput: string): Promise<void> {
    // Parse "shopify my-store" → name="shopify", extraArgs=["my-store"]
    const inputParts = svcInput.trim().split(/\s+/);
    const svcName = inputParts[0] ?? "";
    const extraArgs = inputParts.slice(1);

    if (!svcName) {
      try {
        const connectors = await backend.listConnectors();
        const disconnected = connectors.filter((c) => c.status === "disconnected" || c.status === "error");
        if (disconnected.length === 0) {
          addSystemMessage(connectors.length === 0
            ? t.muted("No connectors available. Use /connectors auth <name> to configure API keys first.")
            : t.muted("All services are already connected."));
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
            await connectWithContext(selected!, []);
          },
        });
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
      return;
    }

    await connectWithContext(svcName, extraArgs);
  }

  async function connectorDisconnect(svcName: string): Promise<void> {
    if (svcName) {
      try {
        const connectors = await backend.listConnectors();
        const channels = await backend.listChannels();
        const knownNames = new Set([
          ...connectors.map((c) => c.name),
          ...channels.map((ch) => ch.name),
        ]);
        if (!knownNames.has(svcName)) {
          addSystemMessage(formatError(`Unknown service "${svcName}". Use /connectors to see available services.`));
          return;
        }
      } catch {
        // Can't validate — proceed anyway
      }

      const result = await backend.disconnectService(svcName);
      if (!result.ok) {
        addSystemMessage(formatError(result.error ?? `Failed to disconnect "${svcName}"`));
      } else {
        addSystemMessage(t.green(`✓ ${result.label ?? svcName} disconnected`));
      }
      return;
    }

    // No arg → interactive picker
    try {
      const connectors = await backend.listConnectors();
      const configured = connectors.filter((c) => c.status !== "disconnected");
      if (configured.length === 0) {
        addSystemMessage(connectors.length === 0
          ? t.muted("No connectors configured yet. Connect a service first with /connectors connect.")
          : t.muted("No connected services to disconnect."));
        return;
      }
      launchWizard(ctx, {
        title: "Disconnect a Service",
        steps: [
          {
            type: "select",
            message: "Choose a service to disconnect:",
            options: configured.map((c) => ({
              value: c.name,
              label: c.name,
              hint: c.status === "error" ? "credentials invalid" : c.type,
            })),
          },
        ],
        onComplete: async ([selected]) => {
          dispatch({ type: "SET_PHASE", phase: "idle" });
          const result = await backend.disconnectService(selected!);
          if (!result.ok) {
            addSystemMessage(formatError(result.error ?? `Failed to disconnect "${selected}"`));
          } else {
            addSystemMessage(t.green(`✓ ${result.label ?? selected} disconnected`));
          }
        },
      });
    } catch (err) {
      addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
    }
  }

  async function connectorAuth(authArg: string): Promise<void> {
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

    const authParts = authArg.split(/\s+/);
    const connectorName = authParts[0]!;
    const keys = authParts.slice(1);

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
  }

  async function connectorHealth(name: string): Promise<void> {
    if (!requireDaemon(ctx, "Health checks")) return;
    const results = await backend.checkHealth();
    if (name) {
      const match = results.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (match) {
        const icon = match.healthy ? "✓" : "✗";
        const status = match.healthy
          ? t.green(`${icon} ${match.name}: healthy (${match.latencyMs}ms)`)
          : t.red(`${icon} ${match.name}: ${match.error}`);
        addSystemMessage(status);
      } else {
        addSystemMessage(formatError(`Unknown connector: ${name}`));
      }
    } else {
      addSystemMessage(formatHealth(results));
    }
  }

  // ── Channel sub-wizards ───────────────────────────────────────────────

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
          addSystemMessage(t.muted("Connecting WhatsApp — a QR code will appear shortly..."));
          const result = await backend.addChannel("whatsapp", { enabled: true }, buildQRCallbacks(addSystemMessage));
          if (result.ok) {
            addSystemMessage(t.green(`✓ Channel "whatsapp" added and connected`));
          } else {
            addSystemMessage(formatError(result.error ?? `Failed to add "whatsapp"`));
          }
        } else if (channelName === "telegram") {
          launchWizard(ctx, {
            title: "Add Telegram Channel",
            steps: [
              {
                type: "text",
                message: "Enter your Telegram bot token (from @BotFather):",
                placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
                validate: validateTelegramToken,
              },
            ],
            onComplete: async ([token]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              const result = await backend.addChannel("telegram", { token: token! });
              if (result.ok) {
                addSystemMessage(t.green(`✓ Channel "telegram" added and connected`));
              } else {
                addSystemMessage(formatError(result.error ?? `Failed to add "telegram"`));
              }
            },
          });
        }
      },
    });
  }

  async function channelAddDirect(channelName: string, tokens: string[]): Promise<void> {
    if (channelName === "telegram" && tokens[0]) {
      const result = await backend.addChannel(channelName, { token: tokens[0] });
      if (result.ok) {
        addSystemMessage(t.green(`✓ Channel "${channelName}" added and connected`));
      } else {
        addSystemMessage(formatError(result.error ?? `Failed to add "${channelName}"`));
      }
      return;
    }
    if (channelName === "whatsapp") {
      addSystemMessage(t.muted("Connecting WhatsApp — a QR code will appear shortly..."));
      const result = await backend.addChannel(channelName, { enabled: true }, buildQRCallbacks(addSystemMessage));
      if (result.ok) {
        addSystemMessage(t.green(`✓ Channel "whatsapp" added and connected`));
      } else {
        addSystemMessage(formatError(result.error ?? `Failed to add "whatsapp"`));
      }
      return;
    }
    if (channelName === "telegram") {
      launchWizard(ctx, {
        title: "Add Telegram Channel",
        steps: [
          {
            type: "text",
            message: "Enter your Telegram bot token (from @BotFather):",
            placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
            validate: validateTelegramToken,
          },
        ],
        onComplete: async ([token]) => {
          dispatch({ type: "SET_PHASE", phase: "idle" });
          const result = await backend.addChannel("telegram", { token: token! });
          if (result.ok) {
            addSystemMessage(t.green(`✓ Channel "telegram" added and connected`));
          } else {
            addSystemMessage(formatError(result.error ?? `Failed to add "telegram"`));
          }
        },
      });
      return;
    }
    addSystemMessage(formatChannelSetupHint(channelName));
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
          addSystemMessage(t.green(`✓ Channel "${channelName}" connected`));
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
            addSystemMessage(t.green(`✓ Channel "${channelName}" disconnected`));
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
          addSystemMessage(t.green(`✓ Channel "${channelName}" removed`));
        } else {
          addSystemMessage(formatError(result.error ?? `Failed to remove "${channelName}"`));
        }
      },
    });
  }
}
