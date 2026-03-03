// Trigger engine — orchestrates cron, webhook, file-watch, HTTP, and email triggers.

import { randomUUID } from "node:crypto";
import { Bus } from "../../../shared/bus.js";
import { getLogger } from "../../../shared/logger.js";
import { CronTrigger } from "./cron.js";
import { WebhookTrigger } from "./webhook.js";
import { FileWatchTrigger } from "./file-watch.js";
import { EmailTrigger, type EmailConfig } from "./email.js";
import { TriggerStore } from "./store.js";
import type { ConnectorManager } from "../connectors/manager.js";
import type { WebhookEvent } from "../connectors/interface.js";
import type { ChannelRegistry } from "../channels/index.js";
import { kvGet } from "../../storage/kv.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CronConfig {
  expression: string;
  timezone?: string;
}

export interface WebhookConfig {
  /** Secret for signature verification (HMAC-SHA256). */
  secret?: string;
  /** Expected source service for specialized verification (stripe, github, paypal, twilio). */
  service?: "stripe" | "github" | "paypal" | "twilio" | "generic";
}

export interface FileConfig {
  /** File or directory paths to watch. */
  paths: string[];
  /** Events to listen for. Default: all. */
  events?: Array<"create" | "modify" | "delete">;
  /** Debounce in milliseconds. Default: 500. */
  debounceMs?: number;
}

export interface HttpConfig {
  /** URL to poll. */
  url: string;
  /** HTTP method. Default: GET. */
  method?: string;
  /** Headers to include. */
  headers?: Record<string, string>;
  /** Interval in milliseconds. Default: 60000. */
  intervalMs?: number;
  /** JSONPath expression to extract a value and compare against previous. */
  jqFilter?: string;
}

export interface TriggerAction {
  type: "shell" | "agent";
  /** Shell command to run (for type=shell). */
  command?: string;
  /** Prompt to send to agent (for type=agent). */
  prompt?: string;
  /** Whether to send notification to user on trigger fire. */
  notify?: boolean;
}

export interface TriggerConfig {
  id: string;
  type: "cron" | "webhook" | "file" | "http" | "email";
  enabled: boolean;
  config: CronConfig | WebhookConfig | FileConfig | HttpConfig | EmailConfig;
  action: TriggerAction;
  /** Human-readable label. */
  label?: string;
  /** Total number of times this trigger has fired. */
  run_count?: number;
  /** Consecutive error count (resets on successful fire). */
  error_count?: number;
  /** Maximum number of fires before auto-disable. 0 = unlimited. */
  max_runs?: number;
  /** ISO timestamp of last fire. */
  last_fired?: string;
  created_at?: string;
}

export interface TriggerFireEvent {
  triggerId: string;
  type: TriggerConfig["type"];
  timestamp: string;
  payload?: unknown;
}

export interface TriggerEvents extends Record<string, unknown> {
  "trigger:fired": TriggerFireEvent;
  "trigger:added": TriggerConfig;
  "trigger:removed": { id: string };
  "trigger:error": { triggerId: string; error: string };
}

/** Channel + chatId pair for sending trigger notifications. */
export interface NotifyTarget {
  channel: string;
  chatId: string;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class TriggerEngine {
  private triggers = new Map<string, TriggerConfig>();
  private cronTriggers = new Map<string, CronTrigger>();
  private fileWatchTriggers = new Map<string, FileWatchTrigger>();
  private emailTriggers = new Map<string, EmailTrigger>();
  private httpTimers = new Map<string, ReturnType<typeof setInterval>>();
  private running = false;
  private connectorManager: ConnectorManager | null = null;
  private channelRegistry: ChannelRegistry | null = null;
  private notifyTargets: NotifyTarget[] = [];
  private systemPrompt: string | undefined;

  readonly bus = new Bus<TriggerEvents>();
  private store: TriggerStore;

  constructor(store?: TriggerStore) {
    this.store = store ?? new TriggerStore();
  }

  /**
   * Inject the ConnectorManager so webhook triggers can dispatch to
   * connector-specific verification and event parsing.
   *
   * Called by kernel.ts during boot, after both TriggerEngine and
   * ConnectorManager are created.
   */
  setConnectorManager(manager: ConnectorManager): void {
    this.connectorManager = manager;
  }

  /**
   * Inject the ChannelRegistry and admin targets so triggers can send
   * notifications to channels (Telegram, WhatsApp) and the local PC
   * when events fire.
   *
   * Called by kernel.ts during boot, after ChannelRegistry is created.
   */
  setChannelRegistry(registry: ChannelRegistry, targets: NotifyTarget[]): void {
    this.channelRegistry = registry;
    this.notifyTargets = targets;
  }

  /**
   * Inject the system prompt (AGENT.md) so agent actions have full knowledge
   * of Jeriko commands, connectors, and capabilities.
   *
   * Called by kernel.ts during boot, after the system prompt is loaded.
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Load persisted triggers from the store and start all enabled ones.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const persisted = this.store.listAll();
    for (const config of persisted) {
      this.triggers.set(config.id, config);
      if (config.enabled) {
        this.activateTrigger(config);
      }
    }

    log.info(`Trigger engine started with ${persisted.length} trigger(s)`);
  }

  /**
   * Stop all triggers and clean up.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    for (const [id] of this.cronTriggers) {
      this.deactivateTrigger(id);
    }
    for (const [id] of this.fileWatchTriggers) {
      this.deactivateTrigger(id);
    }
    for (const [id] of this.emailTriggers) {
      this.deactivateTrigger(id);
    }
    for (const [id, timer] of this.httpTimers) {
      clearInterval(timer);
      this.httpTimers.delete(id);
    }

    this.running = false;
    log.info("Trigger engine stopped");
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  /**
   * Add a new trigger. Generates an ID if none is provided.
   */
  add(config: Omit<TriggerConfig, "id"> & { id?: string }): TriggerConfig {
    const trigger: TriggerConfig = {
      ...config,
      id: config.id ?? randomUUID().slice(0, 8),
      created_at: config.created_at ?? new Date().toISOString(),
    };

    this.triggers.set(trigger.id, trigger);
    this.store.save(trigger);

    if (trigger.enabled && this.running) {
      this.activateTrigger(trigger);
    }

    this.bus.emit("trigger:added", trigger);
    log.info(`Trigger added: ${trigger.id} (${trigger.type})`);

    return trigger;
  }

  /**
   * Remove a trigger by ID.
   */
  remove(id: string): boolean {
    const trigger = this.triggers.get(id);
    if (!trigger) return false;

    this.deactivateTrigger(id);
    this.triggers.delete(id);
    this.store.remove(id);

    this.bus.emit("trigger:removed", { id });
    log.info(`Trigger removed: ${id}`);

    return true;
  }

  /**
   * Update mutable fields of an existing trigger.
   * Returns the updated trigger, or undefined if not found.
   *
   * Type cannot be changed — delete and recreate instead.
   */
  update(id: string, fields: {
    config?: CronConfig | WebhookConfig | FileConfig | HttpConfig | EmailConfig;
    action?: TriggerAction;
    label?: string;
    enabled?: boolean;
    max_runs?: number;
  }): TriggerConfig | undefined {
    const trigger = this.triggers.get(id);
    if (!trigger) return undefined;

    const wasEnabled = trigger.enabled;

    if (fields.config !== undefined) trigger.config = fields.config;
    if (fields.action !== undefined) trigger.action = fields.action;
    if (fields.label !== undefined) trigger.label = fields.label;
    if (fields.max_runs !== undefined) trigger.max_runs = fields.max_runs;
    if (fields.enabled !== undefined) trigger.enabled = fields.enabled;

    this.store.save(trigger);

    // Re-activate or deactivate if enabled state changed while running
    if (this.running) {
      if (wasEnabled && !trigger.enabled) {
        this.deactivateTrigger(id);
      } else if (!wasEnabled && trigger.enabled) {
        this.activateTrigger(trigger);
      } else if (trigger.enabled) {
        // Config changed while active — restart the trigger
        this.deactivateTrigger(id);
        this.activateTrigger(trigger);
      }
    }

    log.info(`Trigger updated: ${id}`);
    return trigger;
  }

  /**
   * Enable a trigger.
   */
  enable(id: string): boolean {
    const trigger = this.triggers.get(id);
    if (!trigger) return false;

    trigger.enabled = true;
    this.store.save(trigger);

    if (this.running) {
      this.activateTrigger(trigger);
    }

    return true;
  }

  /**
   * Disable a trigger.
   */
  disable(id: string): boolean {
    const trigger = this.triggers.get(id);
    if (!trigger) return false;

    trigger.enabled = false;
    this.deactivateTrigger(id);
    this.store.save(trigger);

    return true;
  }

  /**
   * Get a trigger by ID.
   */
  get(id: string): TriggerConfig | undefined {
    return this.triggers.get(id);
  }

  /**
   * List all active (enabled) triggers.
   */
  listActive(): TriggerConfig[] {
    return [...this.triggers.values()].filter((t) => t.enabled);
  }

  /**
   * List all triggers.
   */
  listAll(): TriggerConfig[] {
    return [...this.triggers.values()];
  }

  // -----------------------------------------------------------------------
  // Fire
  // -----------------------------------------------------------------------

  /**
   * Manually fire a trigger by ID.
   */
  async fire(id: string, payload?: unknown): Promise<void> {
    const trigger = this.triggers.get(id);
    if (!trigger) {
      throw new Error(`Trigger "${id}" not found`);
    }

    await this.executeTriggerAction(trigger, payload);
  }

  /**
   * Called by webhook route when an external webhook hits /hooks/:triggerId.
   *
   * Dispatch order:
   *   1. If the trigger has a `service` field AND the ConnectorManager has that
   *      connector available, delegate to connector.webhook() for service-specific
   *      signature verification + rich WebhookEvent parsing.
   *   2. Otherwise, fall back to the built-in WebhookTrigger.verify() which
   *      handles generic HMAC and the 5 supported service formats.
   *
   * @param rawBody  The raw HTTP body string (needed for HMAC verification).
   *                 The webhook route must pass this alongside the parsed payload.
   */
  async handleWebhook(
    id: string,
    payload: unknown,
    headers: Record<string, string>,
    rawBody?: string,
  ): Promise<boolean> {
    const trigger = this.triggers.get(id);
    if (!trigger || trigger.type !== "webhook" || !trigger.enabled) {
      return false;
    }

    const whConfig = trigger.config as WebhookConfig;

    // Path 1: Connector-aware webhook dispatch
    if (whConfig.service && whConfig.service !== "generic" && this.connectorManager) {
      const event = await this.dispatchToConnector(
        whConfig.service,
        headers,
        rawBody ?? (typeof payload === "string" ? payload : JSON.stringify(payload)),
      );

      if (event) {
        // Connector verified and parsed — use the rich WebhookEvent as payload
        await this.executeTriggerAction(trigger, event);
        return true;
      }

      // Connector unavailable — fall through to built-in verification
      log.debug(`Trigger ${id}: connector "${whConfig.service}" unavailable, using built-in verifier`);
    }

    // Path 2: Built-in signature verification
    if (whConfig.secret) {
      const webhookTrigger = new WebhookTrigger(whConfig);
      if (!webhookTrigger.verify(payload, headers)) {
        log.warn(`Webhook signature verification failed for trigger ${id}`);
        return false;
      }
    }

    await this.executeTriggerAction(trigger, payload);
    return true;
  }

  /**
   * Dispatch to a connector's webhook() method for verification + parsing.
   * Returns null if the connector is unavailable or verification fails.
   */
  private async dispatchToConnector(
    service: string,
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<WebhookEvent | null> {
    if (!this.connectorManager) return null;

    try {
      return await this.connectorManager.dispatchWebhook(service, headers, rawBody);
    } catch (err) {
      log.warn(`Connector webhook dispatch failed for "${service}": ${err}`);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private activateTrigger(trigger: TriggerConfig): void {
    switch (trigger.type) {
      case "cron": {
        const cronConfig = trigger.config as CronConfig;
        const cron = new CronTrigger(cronConfig.expression, cronConfig.timezone);
        cron.start(() => {
          this.executeTriggerAction(trigger).catch((err) => {
            this.bus.emit("trigger:error", {
              triggerId: trigger.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        });
        this.cronTriggers.set(trigger.id, cron);
        break;
      }

      case "file": {
        const fileConfig = trigger.config as FileConfig;
        const watcher = new FileWatchTrigger(fileConfig);
        watcher.start((event, filePath) => {
          this.executeTriggerAction(trigger, { event, path: filePath }).catch((err) => {
            this.bus.emit("trigger:error", {
              triggerId: trigger.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        });
        this.fileWatchTriggers.set(trigger.id, watcher);
        break;
      }

      case "http": {
        const httpConfig = trigger.config as HttpConfig;
        const interval = httpConfig.intervalMs ?? 60_000;
        let lastValue: string | undefined;

        const poll = async () => {
          try {
            const resp = await fetch(httpConfig.url, {
              method: httpConfig.method ?? "GET",
              headers: httpConfig.headers,
            });
            const body = await resp.text();

            // If a filter is specified, only fire when the filtered value changes
            if (httpConfig.jqFilter) {
              const current = body; // simplified — full jq would need a library
              if (lastValue !== undefined && current !== lastValue) {
                await this.executeTriggerAction(trigger, {
                  status: resp.status,
                  body,
                  previous: lastValue,
                });
              }
              lastValue = current;
            } else {
              await this.executeTriggerAction(trigger, {
                status: resp.status,
                body,
              });
            }
          } catch (err) {
            this.bus.emit("trigger:error", {
              triggerId: trigger.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        };

        const timer = setInterval(poll, interval);
        this.httpTimers.set(trigger.id, timer);
        break;
      }

      case "email": {
        const emailConfig = trigger.config as EmailConfig;
        const emailTrigger = new EmailTrigger(emailConfig, this.connectorManager ?? undefined);

        const validationError = emailTrigger.validate();
        if (validationError) {
          log.warn(`Trigger ${trigger.id}: ${validationError} — skipping activation`);
          break;
        }

        emailTrigger.start((message) => {
          this.executeTriggerAction(trigger, {
            source: "email",
            type: "email.received",
            from: message.from,
            subject: message.subject,
            date: message.date,
            snippet: message.snippet,
            uid: message.uid,
          }).catch((err) => {
            this.bus.emit("trigger:error", {
              triggerId: trigger.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        });
        this.emailTriggers.set(trigger.id, emailTrigger);
        break;
      }

      case "webhook":
        // Webhooks are passive — they are activated by incoming HTTP requests,
        // not by the engine. The handleWebhook method is the entry point.
        break;
    }
  }

  private deactivateTrigger(id: string): void {
    const cron = this.cronTriggers.get(id);
    if (cron) {
      cron.stop();
      this.cronTriggers.delete(id);
    }

    const fw = this.fileWatchTriggers.get(id);
    if (fw) {
      fw.stop();
      this.fileWatchTriggers.delete(id);
    }

    const em = this.emailTriggers.get(id);
    if (em) {
      em.stop();
      this.emailTriggers.delete(id);
    }

    const timer = this.httpTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.httpTimers.delete(id);
    }
  }

  /** Max consecutive errors before auto-disabling a trigger. */
  private static readonly MAX_CONSECUTIVE_ERRORS = 5;

  private async executeTriggerAction(trigger: TriggerConfig, payload?: unknown): Promise<void> {
    const event: TriggerFireEvent = {
      triggerId: trigger.id,
      type: trigger.type,
      timestamp: new Date().toISOString(),
      payload,
    };

    this.bus.emit("trigger:fired", event);

    // Increment run count
    trigger.run_count = (trigger.run_count ?? 0) + 1;
    this.store.recordFire(trigger.id, trigger.run_count);

    // Check maxRuns auto-disable
    if (trigger.max_runs && trigger.max_runs > 0 && trigger.run_count >= trigger.max_runs) {
      log.info(`Trigger ${trigger.id}: reached max_runs (${trigger.max_runs}), auto-disabling`);
      this.disable(trigger.id);
      // Still execute this final run — disable takes effect on the next fire
    }

    const action = trigger.action;
    log.info(`Trigger fired: ${trigger.id} (${trigger.type}), action=${action.type}, run=${trigger.run_count}`);

    // Send notifications if enabled (default: true unless explicitly set to false)
    if (action.notify !== false) {
      this.sendNotifications(trigger, payload).catch((err) => {
        log.warn(`Trigger ${trigger.id}: notification failed — ${err}`);
      });
    }

    switch (action.type) {
      case "shell": {
        if (!action.command) {
          log.warn(`Trigger ${trigger.id}: shell action has no command`);
          return;
        }

        const env: Record<string, string> = {
          TRIGGER_ID: trigger.id,
          TRIGGER_TYPE: trigger.type,
          TRIGGER_EVENT: JSON.stringify(payload ?? {}),
          JERIKO_FORMAT: "json",
        };

        const proc = Bun.spawn(["sh", "-c", action.command], {
          env: { ...process.env, ...env },
          stdout: "pipe",
          stderr: "pipe",
        });

        const exitCode = await proc.exited;
        if (exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text();
          log.warn(`Trigger ${trigger.id} shell action exited ${exitCode}: ${stderr}`);
          this.recordError(trigger);
        } else {
          this.resetErrorCount(trigger);
        }
        break;
      }

      case "agent": {
        if (!action.prompt) {
          log.warn(`Trigger ${trigger.id}: agent action has no prompt`);
          return;
        }

        // Run the agent asynchronously — don't block the trigger engine.
        // Fire-and-forget with error logging. The agent creates its own
        // session, runs the prompt, and the response is logged.
        this.executeAgentAction(trigger.id, action.prompt, payload).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(`Trigger ${trigger.id}: agent action failed — ${msg}`);
          this.bus.emit("trigger:error", { triggerId: trigger.id, error: msg });
        });
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Agent action execution
  // -----------------------------------------------------------------------

  /**
   * Execute an agent action: create a session, build a contextual prompt
   * that includes the trigger event payload, and run the agent loop.
   *
   * The agent has full access to Jeriko CLI commands (via Bash) so it can
   * use `jeriko gmail messages send`, `jeriko email send`, etc. to perform
   * actions like sending replies. No hardcoded post-processing needed.
   *
   * Follows the same pattern as kernel.ts "ask" IPC handler and
   * channel router agent invocations.
   */
  private async executeAgentAction(
    triggerId: string,
    prompt: string,
    payload?: unknown,
  ): Promise<void> {
    const { runAgent } = await import("../../agent/agent.js");
    const { createSession } = await import("../../agent/session/session.js");
    const { addMessage, addPart } = await import("../../agent/session/message.js");
    const { loadConfig } = await import("../../../shared/config.js");
    const { parseModelSpec } = await import("../../agent/drivers/models.js");

    const config = loadConfig();
    const { backend, model } = parseModelSpec(config.agent.model);

    // Build the full user message: prompt + trigger context
    const contextLines: string[] = [prompt];
    if (payload) {
      contextLines.push("", "Trigger event payload:", "```json", JSON.stringify(payload, null, 2), "```");
    }
    const userMessage = contextLines.join("\n");

    // Create a dedicated session for this trigger execution
    const session = createSession({
      model,
      title: `trigger:${triggerId} — ${prompt.slice(0, 60)}`,
    });

    // Persist user message
    const msg = addMessage(session.id, "user", userMessage);
    addPart(msg.id, "text", userMessage);

    const history = [{ role: "user" as const, content: userMessage }];

    const agentConfig = {
      sessionId: session.id,
      backend,
      model,
      systemPrompt: this.systemPrompt,
      maxTokens: config.agent.maxTokens,
      temperature: config.agent.temperature,
      extendedThinking: config.agent.extendedThinking,
    };

    let response = "";
    for await (const event of runAgent(agentConfig, history)) {
      if (event.type === "text_delta") response += event.content;
      if (event.type === "error") {
        throw new Error(event.message);
      }
    }

    log.info(`Trigger ${triggerId}: agent completed (${response.length} chars)`);
  }

  // -----------------------------------------------------------------------
  // Notifications — channels + local PC
  // -----------------------------------------------------------------------

  /**
   * Send trigger fire notifications to all configured targets.
   *
   * Dispatches in parallel to:
   *   - All registered channel targets (Telegram, WhatsApp) via ChannelRegistry
   *   - The local PC via platform notification (macOS/Linux/Windows)
   *
   * Notifications are fire-and-forget — failures are logged, never block
   * the trigger action.
   */
  private async sendNotifications(trigger: TriggerConfig, payload?: unknown): Promise<void> {
    const message = this.formatNotification(trigger, payload);
    const title = trigger.label ?? `Trigger ${trigger.id}`;

    const channelCount = (this.channelRegistry && this.notifyTargets.length > 0)
      ? this.notifyTargets.length
      : 0;
    log.info(`Trigger ${trigger.id}: sending notifications (${channelCount} channel targets + local PC)`);

    const tasks: Promise<void>[] = [];

    // Channel notifications (Telegram, WhatsApp, etc.)
    // Respects per-chat notification preferences stored in KV at `notify:<channel>:<chatId>`.
    // Default is ON — only suppressed when explicitly set to false.
    if (this.channelRegistry && this.notifyTargets.length > 0) {
      for (const target of this.notifyTargets) {
        if (!this.isNotifyEnabled(target.channel, target.chatId)) {
          log.debug(`Trigger ${trigger.id}: notifications muted for ${target.channel}:${target.chatId}`);
          continue;
        }
        tasks.push(
          this.channelRegistry.send(target.channel, target.chatId, message).catch((err) => {
            log.warn(`Trigger ${trigger.id}: channel notify to ${target.channel}:${target.chatId} failed — ${err}`);
          }),
        );
      }
    } else {
      log.warn(`Trigger ${trigger.id}: no channel targets configured — skipping channel notifications`);
    }

    // Local PC notification (macOS/Linux/Windows)
    tasks.push(
      this.sendLocalNotification(title, message).catch((err) => {
        log.warn(`Trigger ${trigger.id}: local notify failed — ${err}`);
      }),
    );

    await Promise.allSettled(tasks);
  }

  /**
   * Check whether notifications are enabled for a specific channel + chatId.
   *
   * Reads the per-chat preference from KV store (`notify:<channel>:<chatId>`).
   * Default is true (notifications on) — only suppressed when explicitly false.
   *
   * The KV store is initialized during kernel boot (step 3-4) before the trigger
   * engine is created (step 10), so kvGet is always available. Try/catch guards
   * against edge cases in tests or early boot.
   */
  private isNotifyEnabled(channel: string, chatId: string): boolean {
    try {
      const enabled = kvGet<boolean>(`notify:${channel}:${chatId}`);
      return enabled !== false; // null (not set) → default ON
    } catch {
      return true; // KV unavailable → default ON
    }
  }

  /**
   * Format a human-readable notification message from trigger + payload.
   */
  private formatNotification(trigger: TriggerConfig, payload?: unknown): string {
    const label = trigger.label ?? trigger.id;
    const lines: string[] = [`Trigger fired: ${label}`];

    if (trigger.type === "webhook" && payload && typeof payload === "object") {
      const event = payload as Record<string, unknown>;
      // WebhookEvent has source + type fields
      if (event.source) lines.push(`Source: ${event.source}`);
      if (event.type && event.type !== "unknown") lines.push(`Event: ${event.type}`);
      if (event.verified === false) lines.push("Warning: signature not verified");
    } else if (trigger.type === "cron") {
      lines.push("Type: scheduled");
    } else if (trigger.type === "file" && payload && typeof payload === "object") {
      const event = payload as Record<string, unknown>;
      if (event.event) lines.push(`Event: ${event.event}`);
      if (event.path) lines.push(`Path: ${event.path}`);
    } else if (trigger.type === "http") {
      lines.push("Type: HTTP poll");
    } else if (trigger.type === "email" && payload && typeof payload === "object") {
      const event = payload as Record<string, unknown>;
      lines.push("Type: email");
      if (event.from) lines.push(`From: ${event.from}`);
      if (event.subject) lines.push(`Subject: ${event.subject}`);
      if (event.snippet) lines.push(`Preview: ${event.snippet}`);
    }

    if (trigger.run_count) lines.push(`Run #${trigger.run_count}`);

    return lines.join("\n");
  }

  /**
   * Send a notification to the local PC using the platform-specific provider.
   * Uses lazy import to avoid loading platform code at engine construction time.
   */
  private async sendLocalNotification(title: string, message: string): Promise<void> {
    try {
      const { platform } = await import("node:os");
      const os = platform();

      if (os === "darwin") {
        const { DarwinNotify } = await import("../../../platform/darwin/notify.js");
        await new DarwinNotify().send(`Jeriko — ${title}`, message, "Glass");
      } else if (os === "linux") {
        const { LinuxNotify } = await import("../../../platform/linux/notify.js");
        await new LinuxNotify().send(`Jeriko — ${title}`, message);
      } else if (os === "win32") {
        const { Win32Notify } = await import("../../../platform/win32/notify.js");
        await new Win32Notify().send(`Jeriko — ${title}`, message);
      }
    } catch (err) {
      // Platform notification is best-effort — may fail on headless servers
      log.debug(`Local notification failed: ${err}`);
    }
  }

  // -----------------------------------------------------------------------
  // Error tracking + auto-disable
  // -----------------------------------------------------------------------

  /**
   * Record a consecutive error. If errors reach the threshold, auto-disable
   * the trigger and emit a trigger:error event.
   */
  private recordError(trigger: TriggerConfig): void {
    trigger.error_count = (trigger.error_count ?? 0) + 1;
    this.store.save(trigger);

    if (trigger.error_count >= TriggerEngine.MAX_CONSECUTIVE_ERRORS) {
      log.warn(
        `Trigger ${trigger.id}: ${trigger.error_count} consecutive errors, auto-disabling`,
      );
      this.disable(trigger.id);
      this.bus.emit("trigger:error", {
        triggerId: trigger.id,
        error: `Auto-disabled after ${trigger.error_count} consecutive errors`,
      });
    }
  }

  /**
   * Reset the error counter after a successful execution.
   */
  private resetErrorCount(trigger: TriggerConfig): void {
    if (trigger.error_count && trigger.error_count > 0) {
      trigger.error_count = 0;
      this.store.save(trigger);
    }
  }
}
