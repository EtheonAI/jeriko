// Trigger engine — orchestrates cron, webhook, file-watch, and HTTP triggers.

import { randomUUID } from "node:crypto";
import { Bus } from "../../../shared/bus.js";
import { getLogger } from "../../../shared/logger.js";
import { CronTrigger } from "./cron.js";
import { WebhookTrigger } from "./webhook.js";
import { FileWatchTrigger } from "./file-watch.js";
import { TriggerStore } from "./store.js";

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
  type: "cron" | "webhook" | "file" | "http";
  enabled: boolean;
  config: CronConfig | WebhookConfig | FileConfig | HttpConfig;
  action: TriggerAction;
  /** Human-readable label. */
  label?: string;
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

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class TriggerEngine {
  private triggers = new Map<string, TriggerConfig>();
  private cronTriggers = new Map<string, CronTrigger>();
  private fileWatchTriggers = new Map<string, FileWatchTrigger>();
  private httpTimers = new Map<string, ReturnType<typeof setInterval>>();
  private running = false;

  readonly bus = new Bus<TriggerEvents>();
  private store: TriggerStore;

  constructor(store?: TriggerStore) {
    this.store = store ?? new TriggerStore();
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
   */
  async handleWebhook(id: string, payload: unknown, headers: Record<string, string>): Promise<boolean> {
    const trigger = this.triggers.get(id);
    if (!trigger || trigger.type !== "webhook" || !trigger.enabled) {
      return false;
    }

    const whConfig = trigger.config as WebhookConfig;
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

    const timer = this.httpTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.httpTimers.delete(id);
    }
  }

  private async executeTriggerAction(trigger: TriggerConfig, payload?: unknown): Promise<void> {
    const event: TriggerFireEvent = {
      triggerId: trigger.id,
      type: trigger.type,
      timestamp: new Date().toISOString(),
      payload,
    };

    this.bus.emit("trigger:fired", event);
    this.store.recordFire(trigger.id);

    const action = trigger.action;
    log.info(`Trigger fired: ${trigger.id} (${trigger.type}), action=${action.type}`);

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
        }
        break;
      }

      case "agent": {
        if (!action.prompt) {
          log.warn(`Trigger ${trigger.id}: agent action has no prompt`);
          return;
        }

        // Agent execution is delegated to the caller via bus events.
        // The daemon's main loop listens for trigger:fired and routes
        // agent-type actions to the agent worker pool.
        log.info(`Trigger ${trigger.id}: agent action queued — "${action.prompt}"`);
        break;
      }
    }
  }
}
