// Daemon — Worker pool.
// Manages a fixed set of worker threads for parallel agent execution.

import { randomUUID } from "node:crypto";
import { getLogger } from "../../shared/logger.js";
import { Bus } from "../../shared/bus.js";
import { WorkerPolicy, type PolicyDecision } from "./policy.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Worker states. */
export type WorkerStatus = "idle" | "busy" | "error" | "dead";

/** A tracked worker instance. */
export interface WorkerInfo {
  id: string;
  status: WorkerStatus;
  currentTaskId: string | null;
  createdAt: number;
  lastHeartbeat: number;
  tasksCompleted: number;
}

/** A task queued for worker execution. */
export interface WorkerTask {
  id: string;
  type: "agent_chat" | "tool_exec" | "custom";
  payload: Record<string, unknown>;
  priority: number;
  createdAt: number;
  resolve: (result: WorkerTaskResult) => void;
  reject: (error: Error) => void;
}

/** Result from a worker task execution. */
export interface WorkerTaskResult {
  taskId: string;
  workerId: string;
  status: "success" | "error";
  result?: unknown;
  error?: string;
  durationMs: number;
}

/** Pool configuration. */
export interface PoolOptions {
  /** Maximum number of concurrent workers. Default: 4 */
  maxWorkers?: number;
  /** Heartbeat interval in ms. Default: 30000 */
  heartbeatIntervalMs?: number;
  /** Worker idle timeout before killing. Default: 300000 (5 min) */
  idleTimeoutMs?: number;
}

/** Events emitted by the worker pool. */
export interface PoolEvents extends Record<string, unknown> {
  "pool:task_queued": { taskId: string; queueLength: number };
  "pool:task_started": { taskId: string; workerId: string };
  "pool:task_complete": WorkerTaskResult;
  "pool:worker_spawned": { workerId: string };
  "pool:worker_killed": { workerId: string; reason: string };
}

// ---------------------------------------------------------------------------
// Worker Pool
// ---------------------------------------------------------------------------

export class WorkerPool {
  private workers = new Map<string, WorkerInfo>();
  private queue: WorkerTask[] = [];
  private maxWorkers: number;
  private heartbeatIntervalMs: number;
  private idleTimeoutMs: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private draining = false;
  private policy: WorkerPolicy;

  readonly bus = new Bus<PoolEvents>();

  constructor(opts: PoolOptions = {}) {
    this.maxWorkers = opts.maxWorkers ?? 4;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 30_000;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 300_000;
    this.policy = new WorkerPolicy();

    this.startHeartbeat();
    log.info(`Worker pool created: maxWorkers=${this.maxWorkers}`);
  }

  // -----------------------------------------------------------------------
  // Task submission
  // -----------------------------------------------------------------------

  /**
   * Submit a task to the worker pool.
   * Returns a promise that resolves when the task completes.
   */
  submit(
    type: WorkerTask["type"],
    payload: Record<string, unknown>,
    priority: number = 0,
  ): Promise<WorkerTaskResult> {
    if (this.draining) {
      return Promise.reject(new Error("Worker pool is draining, no new tasks accepted"));
    }

    return new Promise<WorkerTaskResult>((resolve, reject) => {
      const task: WorkerTask = {
        id: randomUUID().slice(0, 12),
        type,
        payload,
        priority,
        createdAt: Date.now(),
        resolve,
        reject,
      };

      // Insert into priority queue (higher priority first)
      const insertIdx = this.queue.findIndex((t) => t.priority < priority);
      if (insertIdx === -1) {
        this.queue.push(task);
      } else {
        this.queue.splice(insertIdx, 0, task);
      }

      this.bus.emit("pool:task_queued", {
        taskId: task.id,
        queueLength: this.queue.length,
      });

      log.debug(`Task queued: ${task.id} (type=${type}, queue=${this.queue.length})`);

      // Try to process immediately
      this.processQueue();
    });
  }

  // -----------------------------------------------------------------------
  // Worker management
  // -----------------------------------------------------------------------

  /** Spawn a new worker if under the limit. */
  private spawnWorker(): WorkerInfo | null {
    if (this.workers.size >= this.maxWorkers) return null;

    const decision = this.policy.shouldSpawn(this.workers.size, this.maxWorkers, this.queue.length);
    if (!decision.allowed) {
      log.debug(`Worker spawn denied: ${decision.reason}`);
      return null;
    }

    const id = randomUUID().slice(0, 8);
    const worker: WorkerInfo = {
      id,
      status: "idle",
      currentTaskId: null,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
      tasksCompleted: 0,
    };

    this.workers.set(id, worker);
    this.bus.emit("pool:worker_spawned", { workerId: id });
    log.info(`Worker spawned: ${id} (total: ${this.workers.size}/${this.maxWorkers})`);

    return worker;
  }

  /** Kill a worker by ID. */
  kill(workerId: string, reason: string = "manual"): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    worker.status = "dead";
    this.workers.delete(workerId);
    this.bus.emit("pool:worker_killed", { workerId, reason });
    log.info(`Worker killed: ${workerId} (reason: ${reason})`);
  }

  // -----------------------------------------------------------------------
  // Queue processing
  // -----------------------------------------------------------------------

  private processQueue(): void {
    while (this.queue.length > 0) {
      // Find an idle worker
      let idleWorker: WorkerInfo | undefined;
      for (const worker of this.workers.values()) {
        if (worker.status === "idle") {
          idleWorker = worker;
          break;
        }
      }

      // Spawn a new worker if none idle and under limit
      if (!idleWorker) {
        idleWorker = this.spawnWorker() ?? undefined;
      }

      if (!idleWorker) break; // All workers busy, wait

      const task = this.queue.shift()!;
      this.executeTask(idleWorker, task);
    }
  }

  private async executeTask(worker: WorkerInfo, task: WorkerTask): Promise<void> {
    worker.status = "busy";
    worker.currentTaskId = task.id;

    this.bus.emit("pool:task_started", { taskId: task.id, workerId: worker.id });
    log.debug(`Task started: ${task.id} on worker ${worker.id}`);

    const start = Date.now();

    try {
      // Execute the task based on type
      const result = await this.runTask(task);
      const taskResult: WorkerTaskResult = {
        taskId: task.id,
        workerId: worker.id,
        status: "success",
        result,
        durationMs: Date.now() - start,
      };

      worker.status = "idle";
      worker.currentTaskId = null;
      worker.tasksCompleted++;
      worker.lastHeartbeat = Date.now();

      this.bus.emit("pool:task_complete", taskResult);
      task.resolve(taskResult);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const taskResult: WorkerTaskResult = {
        taskId: task.id,
        workerId: worker.id,
        status: "error",
        error: errorMsg,
        durationMs: Date.now() - start,
      };

      worker.status = "idle";
      worker.currentTaskId = null;
      worker.lastHeartbeat = Date.now();

      this.bus.emit("pool:task_complete", taskResult);
      task.resolve(taskResult);
    }

    // Process next task
    this.processQueue();
  }

  /** Execute a task by dispatching to the appropriate handler. */
  private async runTask(task: WorkerTask): Promise<unknown> {
    switch (task.type) {
      case "agent_chat": {
        const { runAgent } = await import("../agent/agent.js");
        const config = task.payload as unknown as import("../agent/agent.js").AgentRunConfig;
        const history = (task.payload.history ?? []) as import("../agent/drivers/index.js").DriverMessage[];

        let response = "";
        let tokensIn = 0;
        let tokensOut = 0;

        for await (const event of runAgent(config, history)) {
          if (event.type === "text_delta") response += event.content;
          if (event.type === "turn_complete") {
            tokensIn = event.tokensIn;
            tokensOut = event.tokensOut;
          }
        }

        return { response, tokensIn, tokensOut };
      }

      case "tool_exec": {
        const { getTool } = await import("../agent/tools/registry.js");
        const toolName = task.payload.tool as string;
        const toolArgs = task.payload.args as Record<string, unknown>;
        const tool = getTool(toolName);

        if (!tool) throw new Error(`Tool "${toolName}" not found`);
        const result = await tool.execute(toolArgs);
        return { tool: toolName, result };
      }

      case "custom":
        return { status: "completed", taskId: task.id, payload: task.payload };

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  // -----------------------------------------------------------------------
  // Heartbeat & cleanup
  // -----------------------------------------------------------------------

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [id, worker] of this.workers) {
        // Kill idle workers past timeout
        if (
          worker.status === "idle" &&
          now - worker.lastHeartbeat > this.idleTimeoutMs &&
          this.queue.length === 0
        ) {
          this.kill(id, "idle_timeout");
        }

        // Mark unresponsive workers as dead
        if (
          worker.status === "busy" &&
          now - worker.lastHeartbeat > this.heartbeatIntervalMs * 3
        ) {
          log.warn(`Worker ${id} unresponsive, marking as dead`);
          this.kill(id, "unresponsive");
        }
      }
    }, this.heartbeatIntervalMs);

    if (this.heartbeatTimer && typeof this.heartbeatTimer === "object" && "unref" in this.heartbeatTimer) {
      (this.heartbeatTimer as NodeJS.Timeout).unref();
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Drain the pool: finish current tasks, reject queued tasks, kill workers. */
  async drain(): Promise<void> {
    this.draining = true;

    // Reject all queued tasks
    for (const task of this.queue) {
      task.reject(new Error("Worker pool is draining"));
    }
    this.queue = [];

    // Wait for busy workers to finish (with timeout)
    const timeout = 30_000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const busy = [...this.workers.values()].filter((w) => w.status === "busy");
      if (busy.length === 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // Kill remaining workers
    for (const id of [...this.workers.keys()]) {
      this.kill(id, "drain");
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    log.info("Worker pool drained");
  }

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  /** Get pool status. */
  status(): {
    workers: WorkerInfo[];
    queueLength: number;
    draining: boolean;
  } {
    return {
      workers: [...this.workers.values()],
      queueLength: this.queue.length,
      draining: this.draining,
    };
  }
}
