// Task CLI — unified automation surface backed by the daemon's TriggerEngine.
//
// Three task types:
//   --trigger <source:event>   → event-driven (webhook, file, http, email)
//   --schedule <cron>          → recurring on cron expression
//   --once <datetime>          → one-time execution at specific datetime
//
// All tasks flow through the daemon's TriggerEngine (SQLite-backed).
// The old JSON-file-based task system is replaced.

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";

function flagNum(parsed: ReturnType<typeof parseArgs>, name: string): number | undefined {
  const val = flagStr(parsed, name, "");
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return isNaN(n) ? undefined : n;
}
import { ok, fail } from "../../../shared/output.js";
import { sendRequest, isDaemonRunning } from "../../../daemon/api/socket.js";

export const command: CommandHandler = {
  name: "task",
  description: "Task management — trigger, schedule, once",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log(`Usage: jeriko task <action> [options]

Actions:
  list                       List all tasks
  create <name>              Create a new task
  info <id>                  Show task details
  pause <id>                 Disable a task
  resume <id>                Re-enable a task
  delete <id>                Remove a task permanently
  test <id>                  Fire a task manually
  log [--limit N]            Show recent fire history
  types                      List trigger event types

Task Types:
  --trigger stripe:charge.failed    Event-driven (webhook)
  --trigger gmail:new_email         Event-driven (email polling)
  --trigger file:change             Event-driven (file watch)
  --trigger http:down               Event-driven (HTTP polling)
  --schedule "0 9 * * *"            Recurring (cron expression)
  --recurring daily --at "09:00"    Recurring (shorthand)
  --every 5m                        Recurring (interval)
  --once "2026-06-01T09:00"         One-time at datetime

Action (what to do when fired):
  --action "prompt for AI"          AI agent action (default)
  --shell "command"                 Shell command

Options:
  --from <addr>      Email filter (for email triggers)
  --subject <text>   Subject filter (for email triggers)
  --url <URL>        Target URL (for http triggers)
  --path <PATH>      Watch path (for file triggers)
  --max-runs <N>     Auto-disable after N fires
  --no-notify        Suppress notifications`);
      process.exit(0);
    }

    const action = parsed.positional[0] ?? "list";

    // Require daemon for all task operations
    const running = await isDaemonRunning();
    if (!running) {
      fail("Daemon not running. Start with: jeriko serve");
      return;
    }

    switch (action) {
      case "list": {
        const resp = await sendRequest("tasks" as any);
        if (!resp.ok) { fail(resp.error ?? "Failed to list tasks"); return; }
        ok({ tasks: resp.data, count: Array.isArray(resp.data) ? resp.data.length : 0 });
        break;
      }

      case "create": {
        const name = parsed.positional[1];
        if (!name) { fail("Missing task name. Usage: jeriko task create <name> --trigger|--schedule|--once ..."); return; }

        const triggerSpec = flagStr(parsed, "trigger", "");
        const schedule = flagStr(parsed, "schedule", "");
        const recurring = flagStr(parsed, "recurring", "");
        const every = flagStr(parsed, "every", "");
        const once = flagStr(parsed, "once", "");
        const actionPrompt = flagStr(parsed, "action", "");
        const shell = flagStr(parsed, "shell", "");
        const noNotify = flagBool(parsed, "no-notify");
        const maxRuns = flagNum(parsed, "max-runs");

        // Build params for daemon
        const params: Record<string, unknown> = { name };

        if (triggerSpec) {
          params.trigger = triggerSpec;
        } else if (schedule) {
          params.schedule = schedule;
        } else if (recurring || every) {
          // Convert recurring shorthand to cron
          const { parseRecurring } = await import("../../../daemon/services/triggers/task-adapter.js");
          const at = flagStr(parsed, "at", "");
          const day = flagStr(parsed, "day", "");
          const dayOfMonth = flagStr(parsed, "day-of-month", "");
          const cronExpr = parseRecurring(recurring || every, { at, day, day_of_month: dayOfMonth });
          params.schedule = cronExpr;
        } else if (once) {
          params.once = once;
        } else {
          fail("Missing task type. Use --trigger, --schedule, --recurring, --every, or --once");
          return;
        }

        if (actionPrompt) params.action = actionPrompt;
        if (shell) params.shell = shell;
        if (noNotify) params.no_notify = true;
        if (maxRuns !== undefined) params.max_runs = maxRuns;

        // Pass through trigger-specific options
        const from = flagStr(parsed, "from", "");
        const subject = flagStr(parsed, "subject", "");
        const url = flagStr(parsed, "url", "");
        const path = flagStr(parsed, "path", "");
        const interval = flagNum(parsed, "interval");
        if (from) params.from = from;
        if (subject) params.subject = subject;
        if (url) params.url = url;
        if (path) params.path = path;
        if (interval !== undefined) params.interval = interval;

        const resp = await sendRequest("task_create" as any, params);
        if (!resp.ok) { fail(resp.error ?? "Failed to create task"); return; }
        ok({ created: true, task: resp.data });
        break;
      }

      case "info": case "get": {
        const id = parsed.positional[1];
        if (!id) { fail("Missing task ID. Usage: jeriko task info <id>"); return; }
        const resp = await sendRequest("task_info" as any, { id });
        if (!resp.ok) { fail(resp.error ?? "Task not found"); return; }
        ok(resp.data);
        break;
      }

      case "pause": case "disable": {
        const id = parsed.positional[1];
        if (!id) { fail("Missing task ID"); return; }
        const resp = await sendRequest("task_pause" as any, { id });
        if (!resp.ok) { fail(resp.error ?? "Failed to pause task"); return; }
        ok({ paused: true, task: resp.data });
        break;
      }

      case "resume": case "enable": {
        const id = parsed.positional[1];
        if (!id) { fail("Missing task ID"); return; }
        const resp = await sendRequest("task_resume" as any, { id });
        if (!resp.ok) { fail(resp.error ?? "Failed to resume task"); return; }
        ok({ resumed: true, task: resp.data });
        break;
      }

      case "delete": case "remove": {
        const id = parsed.positional[1];
        if (!id) { fail("Missing task ID"); return; }
        const resp = await sendRequest("task_delete" as any, { id });
        if (!resp.ok) { fail(resp.error ?? "Failed to delete task"); return; }
        ok(resp.data);
        break;
      }

      case "test": case "run": {
        const id = parsed.positional[1];
        if (!id) { fail("Missing task ID"); return; }
        const resp = await sendRequest("task_test" as any, { id });
        if (!resp.ok) { fail(resp.error ?? "Failed to test task"); return; }
        ok(resp.data);
        break;
      }

      case "log": case "history": {
        const limit = flagNum(parsed, "limit") ?? 20;
        const resp = await sendRequest("task_log" as any, { limit });
        if (!resp.ok) { fail(resp.error ?? "Failed to get task log"); return; }
        ok(resp.data);
        break;
      }

      case "types": {
        const resp = await sendRequest("task_types" as any);
        if (!resp.ok) { fail(resp.error ?? "Failed to get task types"); return; }
        ok(resp.data);
        break;
      }

      case "reload": {
        // Reload is handled by restarting the daemon
        fail("Use `jeriko serve --restart` to reload tasks");
        break;
      }

      default:
        fail(`Unknown action: "${action}". Use list, create, info, pause, resume, delete, test, log, or types.`);
    }
  },
};
