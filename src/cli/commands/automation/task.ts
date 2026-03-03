import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { BILLING_ENV } from "../../../daemon/billing/config.js";

const TASKS_DIR = join(homedir(), ".jeriko", "data", "tasks");

interface TaskDef {
  id: string;
  name: string;
  type: "trigger" | "cron" | "once";
  schedule?: string;
  command: string;
  enabled: boolean;
  created_at: string;
  last_run?: string;
}

export const command: CommandHandler = {
  name: "task",
  description: "Task management (trigger, recurring, cron)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko task <action> [options]");
      console.log("\nActions:");
      console.log("  list              List all tasks");
      console.log("  create <name>     Create a new task");
      console.log("  get <id>          Get task details");
      console.log("  enable <id>       Enable a task");
      console.log("  disable <id>      Disable a task");
      console.log("  delete <id>       Delete a task");
      console.log("  run <id>          Run a task immediately");
      console.log("\nFlags:");
      console.log("  --type trigger|cron|once   Task type");
      console.log("  --schedule <cron>          Cron schedule expression");
      console.log("  --command <cmd>            Command to execute");
      process.exit(0);
    }

    const action = parsed.positional[0] ?? "list";

    // Ensure tasks directory exists
    if (!existsSync(TASKS_DIR)) {
      mkdirSync(TASKS_DIR, { recursive: true });
    }

    switch (action) {
      case "list": {
        const tasks = loadTasks();
        ok({ tasks, count: tasks.length });
        break;
      }
      case "create": {
        const name = parsed.positional[1];
        if (!name) fail("Missing task name. Usage: jeriko task create <name> --command <cmd>");
        const cmd = flagStr(parsed, "command", "");
        if (!cmd) fail("Missing --command flag");
        const type = flagStr(parsed, "type", "once") as TaskDef["type"];
        const schedule = flagStr(parsed, "schedule", "");

        if (type === "cron" && !schedule) {
          fail("Cron tasks require --schedule flag. Example: --schedule '0 9 * * *'");
        }

        // Billing gate: check trigger limit before creating a new task.
        // Only active when billing is configured (STRIPE_BILLING_SECRET_KEY is set).
        if (process.env[BILLING_ENV.secretKey]) {
          const { loadSecrets } = await import("../../../shared/secrets.js");
          loadSecrets();
          const { canAddTrigger } = await import("../../../daemon/billing/license.js");
          const enabledCount = loadTasks().filter((t) => t.enabled).length;
          const check = canAddTrigger(enabledCount);
          if (!check.allowed) {
            fail(check.reason!);
            return;
          }
        }

        const task: TaskDef = {
          id: randomUUID().slice(0, 8),
          name,
          type,
          schedule: schedule || undefined,
          command: cmd,
          enabled: true,
          created_at: new Date().toISOString(),
        };

        saveTask(task);
        ok({ created: true, task });
        break;
      }
      case "get": {
        const id = parsed.positional[1];
        if (!id) fail("Missing task ID. Usage: jeriko task get <id>");
        const task = getTask(id);
        if (!task) fail(`Task not found: "${id}"`, 5);
        ok(task);
        break;
      }
      case "enable": {
        const id = parsed.positional[1];
        if (!id) fail("Missing task ID");
        const task = getTask(id);
        if (!task) fail(`Task not found: "${id}"`, 5);

        // Billing gate: check trigger limit before re-enabling a task.
        if (!task.enabled && process.env[BILLING_ENV.secretKey]) {
          const { loadSecrets } = await import("../../../shared/secrets.js");
          loadSecrets();
          const { canAddTrigger } = await import("../../../daemon/billing/license.js");
          const enabledCount = loadTasks().filter((t) => t.enabled).length;
          const check = canAddTrigger(enabledCount);
          if (!check.allowed) {
            fail(check.reason!);
            return;
          }
        }

        task.enabled = true;
        saveTask(task);
        ok({ enabled: true, id });
        break;
      }
      case "disable": {
        const id = parsed.positional[1];
        if (!id) fail("Missing task ID");
        const task = getTask(id);
        if (!task) fail(`Task not found: "${id}"`, 5);
        task.enabled = false;
        saveTask(task);
        ok({ disabled: true, id });
        break;
      }
      case "delete": {
        const id = parsed.positional[1];
        if (!id) fail("Missing task ID");
        const path = join(TASKS_DIR, `${id}.json`);
        if (!existsSync(path)) fail(`Task not found: "${id}"`, 5);
        const { unlinkSync } = await import("node:fs");
        unlinkSync(path);
        ok({ deleted: true, id });
        break;
      }
      case "run": {
        const id = parsed.positional[1];
        if (!id) fail("Missing task ID");
        const task = getTask(id);
        if (!task) fail(`Task not found: "${id}"`, 5);

        const { execSync } = await import("node:child_process");
        try {
          const output = execSync(task.command, { encoding: "utf-8", timeout: 60000 });
          task.last_run = new Date().toISOString();
          saveTask(task);
          ok({ ran: true, id, output: output.trim() });
        } catch (err: unknown) {
          const e = err as { stderr?: string; message?: string };
          fail(`Task execution failed: ${e.stderr || e.message || "unknown"}`);
        }
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use list, create, get, enable, disable, delete, or run.`);
    }
  },
};

function loadTasks(): TaskDef[] {
  if (!existsSync(TASKS_DIR)) return [];
  const { readdirSync } = require("node:fs");
  const files = readdirSync(TASKS_DIR).filter((f: string) => f.endsWith(".json"));
  return files.map((f: string) => {
    const content = readFileSync(join(TASKS_DIR, f), "utf-8");
    return JSON.parse(content) as TaskDef;
  });
}

function getTask(id: string): TaskDef | null {
  const path = join(TASKS_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as TaskDef;
}

function saveTask(task: TaskDef): void {
  writeFileSync(join(TASKS_DIR, `${task.id}.json`), JSON.stringify(task, null, 2) + "\n");
}
