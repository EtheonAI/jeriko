// Tool — Inspect subagent task state.
//
// Allows the parent model to check whether a specific async subagent has
// completed, list tasks for the current session, or see the in-flight
// snapshot. Exists because async subagents don't return their result
// inline — the parent may want to poll while doing other work.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import {
  getTask,
  listTasksForParent,
  listInFlight,
} from "../subagent/index.js";

type Action = "get" | "list" | "in_flight";

const VALID_ACTIONS: readonly Action[] = ["get", "list", "in_flight"];

async function execute(args: Record<string, unknown>): Promise<string> {
  const action = (args.action as string) ?? "list";
  if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
    return JSON.stringify({
      ok: false,
      error: `Invalid action "${action}". Valid: ${VALID_ACTIONS.join(", ")}`,
    });
  }

  switch (action as Action) {
    case "get": {
      const taskId = args.task_id as string;
      if (!taskId) {
        return JSON.stringify({ ok: false, error: "task_id is required for action=get" });
      }
      const task = getTask(taskId);
      if (!task) {
        return JSON.stringify({ ok: false, error: `No task with id ${taskId}` });
      }
      return JSON.stringify({ ok: true, task }, null, 2);
    }

    case "list": {
      const parentSessionId = args.parent_session_id as string | undefined;
      if (!parentSessionId) {
        return JSON.stringify({
          ok: false,
          error: "parent_session_id is required for action=list",
        });
      }
      const tasks = listTasksForParent(parentSessionId);
      return JSON.stringify({ ok: true, tasks }, null, 2);
    }

    case "in_flight":
      return JSON.stringify({ ok: true, taskIds: listInFlight() });
  }
}

export const taskStatusTool: ToolDefinition = {
  id: "task_status",
  name: "task_status",
  description:
    "Inspect subagent task state. action=get (fetch by task_id), " +
    "action=list (all tasks for a parent session), action=in_flight " +
    "(currently running async task ids).",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: VALID_ACTIONS as unknown as string[],
        description: "Which inspection to perform",
      },
      task_id: {
        type: "string",
        description: "Task id (for action=get)",
      },
      parent_session_id: {
        type: "string",
        description: "Parent session id (for action=list)",
      },
    },
    required: ["action"],
  },
  execute,
  aliases: ["tasks", "subagent_status"],
};

registerTool(taskStatusTool);
