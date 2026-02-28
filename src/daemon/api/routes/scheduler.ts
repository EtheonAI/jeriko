// Scheduler routes — list, get, create, remove, and toggle scheduled tasks.

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// In-memory scheduler task store
// ---------------------------------------------------------------------------

export interface SchedulerTask {
  id: string;
  label: string;
  type: "cron" | "once" | "interval";
  /** Cron expression, ISO date, or interval in milliseconds. */
  schedule: string;
  /** Action to execute when the task fires. */
  action: { type: "shell" | "agent"; command?: string; prompt?: string };
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  run_count: number;
  created_at: string;
}

const tasks = new Map<string, SchedulerTask>();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function schedulerRoutes(): Hono {
  const router = new Hono();

  /** GET /scheduler — List all scheduled tasks. */
  router.get("/", (c) => {
    const taskList = [...tasks.values()].sort(
      (a, b) => b.created_at.localeCompare(a.created_at),
    );
    return c.json({ ok: true, data: taskList });
  });

  /** GET /scheduler/:id — Get a single scheduled task. */
  router.get("/:id", (c) => {
    const id = c.req.param("id");
    const task = tasks.get(id);

    if (!task) {
      return c.json({ ok: false, error: "Scheduled task not found" }, 404);
    }

    return c.json({ ok: true, data: task });
  });

  /** POST /scheduler — Create a new scheduled task. */
  router.post("/", async (c) => {
    const body = await c.req.json<{
      label: string;
      type: SchedulerTask["type"];
      schedule: string;
      action: SchedulerTask["action"];
      enabled?: boolean;
    }>();

    if (!body.label?.trim() || !body.schedule?.trim()) {
      return c.json({ ok: false, error: "label and schedule are required" }, 400);
    }

    const id = crypto.randomUUID().slice(0, 8);
    const task: SchedulerTask = {
      id,
      label: body.label,
      type: body.type ?? "cron",
      schedule: body.schedule,
      action: body.action ?? { type: "shell" },
      enabled: body.enabled ?? true,
      run_count: 0,
      created_at: new Date().toISOString(),
    };

    tasks.set(id, task);
    log.info(`Scheduler task created: ${id} — "${task.label}"`);

    return c.json({ ok: true, data: task }, 201);
  });

  /** DELETE /scheduler/:id — Remove a scheduled task. */
  router.delete("/:id", (c) => {
    const id = c.req.param("id");
    const existed = tasks.delete(id);

    if (!existed) {
      return c.json({ ok: false, error: "Scheduled task not found" }, 404);
    }

    log.info(`Scheduler task removed: ${id}`);
    return c.json({ ok: true, data: { id, status: "removed" } });
  });

  /** POST /scheduler/:id/toggle — Enable or disable a task. */
  router.post("/:id/toggle", (c) => {
    const id = c.req.param("id");
    const task = tasks.get(id);

    if (!task) {
      return c.json({ ok: false, error: "Scheduled task not found" }, 404);
    }

    task.enabled = !task.enabled;
    log.info(`Scheduler task ${id} toggled: enabled=${task.enabled}`);

    return c.json({ ok: true, data: task });
  });

  return router;
}
