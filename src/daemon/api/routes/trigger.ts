// Trigger routes — full CRUD for all trigger types (cron, webhook, file, http).
//
// Unlike /scheduler (cron-only facade), this route exposes the complete
// TriggerEngine API for managing any trigger type.

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";
import { buildWebhookUrl } from "../../../shared/urls.js";
import type {
  TriggerEngine,
  TriggerConfig,
  TriggerAction,
  CronConfig,
  WebhookConfig,
  FileConfig,
  HttpConfig,
} from "../../services/triggers/engine.js";
import type { EmailConfig } from "../../services/triggers/email.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const TRIGGER_TYPES = ["cron", "webhook", "file", "http", "email"] as const;
type TriggerType = (typeof TRIGGER_TYPES)[number];

function isValidType(type: unknown): type is TriggerType {
  return typeof type === "string" && TRIGGER_TYPES.includes(type as TriggerType);
}

/** Validate type-specific config fields. Returns an error string or null. */
function validateConfig(type: TriggerType, config: unknown): string | null {
  if (!config || typeof config !== "object") {
    return "config is required and must be an object";
  }

  switch (type) {
    case "cron": {
      const c = config as CronConfig;
      if (!c.expression?.trim()) {
        return "config.expression (cron expression) is required for cron triggers";
      }
      return null;
    }
    case "webhook": {
      // Webhook config is optional (service, secret are all optional)
      return null;
    }
    case "file": {
      const c = config as FileConfig;
      if (!Array.isArray(c.paths) || c.paths.length === 0) {
        return "config.paths (array of file paths) is required for file triggers";
      }
      return null;
    }
    case "http": {
      const c = config as HttpConfig;
      if (!c.url?.trim()) {
        return "config.url is required for http triggers";
      }
      return null;
    }
    case "email": {
      // Two modes: connector-based (config.connector = "gmail") or IMAP.
      // Connector mode uses existing OAuth tokens — no IMAP credentials needed.
      const c = config as EmailConfig;
      if (c.connector && typeof c.connector !== "string") {
        return "config.connector must be a string (e.g. 'gmail', 'outlook')";
      }
      if (c.user && typeof c.user !== "string") {
        return "config.user must be a string";
      }
      if (c.intervalMs !== undefined && (typeof c.intervalMs !== "number" || c.intervalMs < 10_000)) {
        return "config.intervalMs must be a number >= 10000 (10 seconds minimum)";
      }
      return null;
    }
  }
}

/** Validate action fields. Returns an error string or null. */
function validateAction(action: unknown): string | null {
  if (!action || typeof action !== "object") {
    return "action is required and must be an object";
  }

  const a = action as TriggerAction;
  if (a.type !== "shell" && a.type !== "agent") {
    return 'action.type must be "shell" or "agent"';
  }
  if (a.type === "shell" && !a.command?.trim()) {
    return "action.command is required for shell actions";
  }
  if (a.type === "agent" && !a.prompt?.trim()) {
    return "action.prompt is required for agent actions";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Response shaping — present TriggerConfig with computed fields
// ---------------------------------------------------------------------------

interface TriggerView {
  id: string;
  type: TriggerType;
  label: string;
  enabled: boolean;
  config: CronConfig | WebhookConfig | FileConfig | HttpConfig | EmailConfig;
  action: TriggerAction;
  run_count: number;
  error_count: number;
  max_runs: number;
  last_fired?: string;
  created_at?: string;
  /** Webhook URL (only for webhook triggers). */
  webhook_url?: string;
}

function toTriggerView(trigger: TriggerConfig, localBaseUrl?: string): TriggerView {
  const view: TriggerView = {
    id: trigger.id,
    type: trigger.type,
    label: trigger.label ?? "",
    enabled: trigger.enabled,
    config: trigger.config,
    action: trigger.action,
    run_count: trigger.run_count ?? 0,
    error_count: trigger.error_count ?? 0,
    max_runs: trigger.max_runs ?? 0,
    last_fired: trigger.last_fired,
    created_at: trigger.created_at,
  };

  // Include the webhook URL for webhook triggers so callers know where to point.
  // Uses the shared URL builder which handles relay routing (includes userId when
  // using the relay) and self-hosted mode (direct to daemon).
  if (trigger.type === "webhook") {
    view.webhook_url = buildWebhookUrl(trigger.id, localBaseUrl);
  }

  return view;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function triggerRoutes(): Hono {
  const router = new Hono();

  /** Extract the base URL from the request for webhook URLs. */
  function getBaseUrl(c: { req: { url: string } }): string {
    const url = new URL(c.req.url);
    return `${url.protocol}//${url.host}`;
  }

  /**
   * GET /triggers — List all triggers, optionally filtered by type.
   *
   * Query params:
   *   type — filter by trigger type (cron, webhook, file, http)
   *   enabled — filter by enabled state ("true" or "false")
   */
  router.get("/", (c) => {
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    let results = triggers.listAll();

    // Filter by type
    const typeFilter = c.req.query("type");
    if (typeFilter && isValidType(typeFilter)) {
      results = results.filter((t) => t.type === typeFilter);
    }

    // Filter by enabled
    const enabledFilter = c.req.query("enabled");
    if (enabledFilter === "true") {
      results = results.filter((t) => t.enabled);
    } else if (enabledFilter === "false") {
      results = results.filter((t) => !t.enabled);
    }

    const baseUrl = getBaseUrl(c);
    const data = results.map((t) => toTriggerView(t, baseUrl));
    return c.json({ ok: true, data });
  });

  /**
   * GET /triggers/:id — Get a single trigger by ID.
   */
  router.get("/:id", (c) => {
    const id = c.req.param("id");
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const trigger = triggers.get(id);
    if (!trigger) {
      return c.json({ ok: false, error: "Trigger not found" }, 404);
    }

    return c.json({ ok: true, data: toTriggerView(trigger, getBaseUrl(c)) });
  });

  /**
   * POST /triggers — Create a new trigger.
   *
   * Body: {
   *   type: "cron" | "webhook" | "file" | "http",
   *   config: { ... },
   *   action: { type: "shell", command: "...", notify?: boolean }
   *          | { type: "agent", prompt: "...", notify?: boolean },
   *   label?: string,
   *   enabled?: boolean,
   *   max_runs?: number
   * }
   */
  router.post("/", async (c) => {
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const body = await c.req.json<{
      type: string;
      config: unknown;
      action: unknown;
      label?: string;
      enabled?: boolean;
      max_runs?: number;
    }>();

    // Validate type
    if (!isValidType(body.type)) {
      return c.json({
        ok: false,
        error: `Invalid trigger type "${body.type}". Must be one of: ${TRIGGER_TYPES.join(", ")}`,
      }, 400);
    }

    // Validate config for the given type
    const configError = validateConfig(body.type, body.config);
    if (configError) {
      return c.json({ ok: false, error: configError }, 400);
    }

    // Validate action
    const actionError = validateAction(body.action);
    if (actionError) {
      return c.json({ ok: false, error: actionError }, 400);
    }

    const trigger = triggers.add({
      type: body.type,
      enabled: body.enabled ?? true,
      config: body.config as CronConfig | WebhookConfig | FileConfig | HttpConfig | EmailConfig,
      action: body.action as TriggerAction,
      label: body.label,
      max_runs: body.max_runs,
    });

    log.info(`Trigger created: ${trigger.id} (${trigger.type}) — "${trigger.label ?? ""}"`);
    return c.json({ ok: true, data: toTriggerView(trigger, getBaseUrl(c)) }, 201);
  });

  /**
   * PUT /triggers/:id — Update an existing trigger.
   *
   * Body: partial trigger fields (type, config, action, label, enabled, max_runs).
   * Type changes are not allowed — delete and recreate instead.
   */
  router.put("/:id", async (c) => {
    const id = c.req.param("id");
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const existing = triggers.get(id);
    if (!existing) {
      return c.json({ ok: false, error: "Trigger not found" }, 404);
    }

    const body = await c.req.json<{
      config?: unknown;
      action?: unknown;
      label?: string;
      enabled?: boolean;
      max_runs?: number;
    }>();

    // Validate config if provided
    if (body.config !== undefined) {
      const configError = validateConfig(existing.type, body.config);
      if (configError) {
        return c.json({ ok: false, error: configError }, 400);
      }
    }

    // Validate action if provided
    if (body.action !== undefined) {
      const actionError = validateAction(body.action);
      if (actionError) {
        return c.json({ ok: false, error: actionError }, 400);
      }
    }

    const updated = triggers.update(id, {
      config: body.config as CronConfig | WebhookConfig | FileConfig | HttpConfig | EmailConfig | undefined,
      action: body.action as TriggerAction | undefined,
      label: body.label,
      enabled: body.enabled,
      max_runs: body.max_runs,
    });

    if (!updated) {
      return c.json({ ok: false, error: "Failed to update trigger" }, 500);
    }

    log.info(`Trigger updated: ${id}`);
    return c.json({ ok: true, data: toTriggerView(updated, getBaseUrl(c)) });
  });

  /**
   * DELETE /triggers/:id — Delete a trigger.
   */
  router.delete("/:id", (c) => {
    const id = c.req.param("id");
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const existed = triggers.remove(id);
    if (!existed) {
      return c.json({ ok: false, error: "Trigger not found" }, 404);
    }

    log.info(`Trigger deleted: ${id}`);
    return c.json({ ok: true, data: { id, status: "deleted" } });
  });

  /**
   * POST /triggers/:id/toggle — Enable or disable a trigger.
   */
  router.post("/:id/toggle", (c) => {
    const id = c.req.param("id");
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const trigger = triggers.get(id);
    if (!trigger) {
      return c.json({ ok: false, error: "Trigger not found" }, 404);
    }

    if (trigger.enabled) {
      triggers.disable(id);
    } else {
      triggers.enable(id);
    }

    const updated = triggers.get(id)!;
    log.info(`Trigger ${id} toggled: enabled=${updated.enabled}`);
    return c.json({ ok: true, data: toTriggerView(updated, getBaseUrl(c)) });
  });

  /**
   * POST /triggers/:id/fire — Manually fire a trigger (for testing/debugging).
   *
   * Body (optional): { payload?: any }
   */
  router.post("/:id/fire", async (c) => {
    const id = c.req.param("id");
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const trigger = triggers.get(id);
    if (!trigger) {
      return c.json({ ok: false, error: "Trigger not found" }, 404);
    }

    let payload: unknown;
    try {
      const body = await c.req.json();
      payload = body?.payload;
    } catch {
      // No body or invalid JSON — fire without payload
    }

    await triggers.fire(id, payload);

    const updated = triggers.get(id)!;
    log.info(`Trigger ${id} manually fired`);
    return c.json({ ok: true, data: toTriggerView(updated, getBaseUrl(c)) });
  });

  return router;
}
