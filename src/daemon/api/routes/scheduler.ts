// Scheduler routes — CRUD facade over TriggerEngine for cron-based tasks.
//
// All operations delegate to TriggerEngine which handles:
//   - SQLite persistence (TriggerStore)
//   - Activation/deactivation of cron jobs
//   - Execution of shell/agent actions on schedule
//
// The scheduler routes provide a user-friendly API surface on top
// of TriggerEngine's lower-level trigger primitives.

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";
import type { TriggerEngine, TriggerConfig, TriggerAction } from "../../services/triggers/engine.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Response shaping — present TriggerConfig as a scheduler-friendly format
// ---------------------------------------------------------------------------

interface SchedulerTaskView {
  id: string;
  label: string;
  schedule: string;
  timezone?: string;
  action: TriggerAction;
  enabled: boolean;
  last_fired?: string;
  created_at?: string;
}

function toTaskView(trigger: TriggerConfig): SchedulerTaskView {
  const config = trigger.config as { expression: string; timezone?: string };
  return {
    id: trigger.id,
    label: trigger.label ?? "",
    schedule: config.expression,
    timezone: config.timezone,
    action: trigger.action,
    enabled: trigger.enabled,
    last_fired: trigger.last_fired,
    created_at: trigger.created_at,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function schedulerRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /scheduler — List all cron-type triggers as scheduled tasks.
   */
  router.get("/", (c) => {
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const cronTriggers = triggers.listAll().filter((t) => t.type === "cron");
    const tasks = cronTriggers.map(toTaskView);

    return c.json({ ok: true, data: tasks });
  });

  /**
   * GET /scheduler/:id — Get a single scheduled task.
   */
  router.get("/:id", (c) => {
    const id = c.req.param("id");
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const trigger = triggers.get(id);
    if (!trigger || trigger.type !== "cron") {
      return c.json({ ok: false, error: "Scheduled task not found" }, 404);
    }

    return c.json({ ok: true, data: toTaskView(trigger) });
  });

  /**
   * POST /scheduler — Create a new scheduled task.
   *
   * Body: { label, schedule, timezone?, action?, enabled? }
   *
   * Creates a cron-type trigger in the trigger engine.
   */
  router.post("/", async (c) => {
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const body = await c.req.json<{
      label: string;
      schedule: string;
      timezone?: string;
      action?: TriggerAction;
      enabled?: boolean;
    }>();

    if (!body.label?.trim()) {
      return c.json({ ok: false, error: "label is required" }, 400);
    }
    if (!body.schedule?.trim()) {
      return c.json({ ok: false, error: "schedule (cron expression) is required" }, 400);
    }

    const trigger = triggers.add({
      type: "cron",
      enabled: body.enabled ?? true,
      config: {
        expression: body.schedule,
        timezone: body.timezone,
      },
      action: body.action ?? { type: "shell" },
      label: body.label,
    });

    log.info(`Scheduler task created: ${trigger.id} — "${body.label}"`);
    return c.json({ ok: true, data: toTaskView(trigger) }, 201);
  });

  /**
   * DELETE /scheduler/:id — Remove a scheduled task.
   */
  router.delete("/:id", (c) => {
    const id = c.req.param("id");
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const existed = triggers.remove(id);
    if (!existed) {
      return c.json({ ok: false, error: "Scheduled task not found" }, 404);
    }

    log.info(`Scheduler task removed: ${id}`);
    return c.json({ ok: true, data: { id, status: "removed" } });
  });

  /**
   * POST /scheduler/:id/toggle — Enable or disable a scheduled task.
   */
  router.post("/:id/toggle", (c) => {
    const id = c.req.param("id");
    const triggers = c.get("triggers" as never) as TriggerEngine;
    if (!triggers) {
      return c.json({ ok: false, error: "Trigger engine not available" }, 503);
    }

    const trigger = triggers.get(id);
    if (!trigger || trigger.type !== "cron") {
      return c.json({ ok: false, error: "Scheduled task not found" }, 404);
    }

    if (trigger.enabled) {
      triggers.disable(id);
    } else {
      triggers.enable(id);
    }

    const updated = triggers.get(id)!;
    log.info(`Scheduler task ${id} toggled: enabled=${updated.enabled}`);
    return c.json({ ok: true, data: toTaskView(updated) });
  });

  return router;
}
