// Daemon — Worker entry point.
// Runs inside a Bun Worker thread. Receives tasks via postMessage,
// executes them, and sends results back.

declare var self: Worker;

import { getLogger } from "../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Message from the main thread to the worker. */
export type WorkerInbound =
  | { type: "task"; taskId: string; taskType: string; payload: Record<string, unknown> }
  | { type: "heartbeat" }
  | { type: "shutdown" };

/** Message from the worker to the main thread. */
export type WorkerOutbound =
  | { type: "ready" }
  | { type: "heartbeat_ack"; timestamp: number }
  | { type: "task_result"; taskId: string; status: "success" | "error"; result?: unknown; error?: string; durationMs: number }
  | { type: "log"; level: string; message: string };

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

interface WorkerState {
  initialized: boolean;
  currentTaskId: string | null;
  tasksCompleted: number;
}

const state: WorkerState = {
  initialized: false,
  currentTaskId: null,
  tasksCompleted: 0,
};

// ---------------------------------------------------------------------------
// Task execution
// ---------------------------------------------------------------------------

async function executeTask(
  taskId: string,
  taskType: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  switch (taskType) {
    case "agent_chat": {
      // Import the agent module dynamically to avoid loading
      // everything at worker init time.
      const agentMod = await import("../agent/agent.js");
      const config = payload as unknown as Parameters<typeof agentMod.runAgent>[0];
      const history = (payload.history ?? []) as any[];

      let fullResponse = "";
      let tokensIn = 0;
      let tokensOut = 0;

      for await (const event of agentMod.runAgent(config, history)) {
        switch (event.type) {
          case "text_delta":
            fullResponse += event.content;
            break;
          case "turn_complete":
            tokensIn = event.tokensIn;
            tokensOut = event.tokensOut;
            break;
        }
      }

      return { response: fullResponse, tokensIn, tokensOut };
    }

    case "tool_exec": {
      const { getTool } = await import("../agent/tools/registry.js");
      const toolName = payload.tool as string;
      const toolArgs = payload.args as Record<string, unknown>;
      const tool = getTool(toolName);

      if (!tool) {
        throw new Error(`Tool "${toolName}" not found`);
      }

      const result = await tool.execute(toolArgs);
      return { tool: toolName, result };
    }

    case "custom": {
      // Custom tasks are just pass-through
      return { payload };
    }

    default:
      throw new Error(`Unknown task type: ${taskType}`);
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function handleMessage(msg: WorkerInbound): void {
  switch (msg.type) {
    case "task": {
      state.currentTaskId = msg.taskId;
      const start = Date.now();

      executeTask(msg.taskId, msg.taskType, msg.payload)
        .then((result) => {
          const outbound: WorkerOutbound = {
            type: "task_result",
            taskId: msg.taskId,
            status: "success",
            result,
            durationMs: Date.now() - start,
          };
          self.postMessage(outbound);
          state.currentTaskId = null;
          state.tasksCompleted++;
        })
        .catch((err) => {
          const outbound: WorkerOutbound = {
            type: "task_result",
            taskId: msg.taskId,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - start,
          };
          self.postMessage(outbound);
          state.currentTaskId = null;
        });
      break;
    }

    case "heartbeat": {
      const ack: WorkerOutbound = {
        type: "heartbeat_ack",
        timestamp: Date.now(),
      };
      self.postMessage(ack);
      break;
    }

    case "shutdown": {
      log.info("Worker received shutdown signal");
      // Allow current task to finish, then exit
      if (!state.currentTaskId) {
        process.exit(0);
      }
      // If a task is running, it will complete and then we can exit
      // via a subsequent shutdown message.
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Worker initialization
// ---------------------------------------------------------------------------

function init(): void {
  if (state.initialized) return;
  state.initialized = true;

  // Listen for messages from the main thread
  self.onmessage = (event: MessageEvent<WorkerInbound>) => {
    handleMessage(event.data);
  };

  // Signal ready
  const ready: WorkerOutbound = { type: "ready" };
  self.postMessage(ready);

  log.info("Worker initialized and ready");
}

// Auto-initialize when loaded as a worker
if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  init();
}

export { init, handleMessage, state };
