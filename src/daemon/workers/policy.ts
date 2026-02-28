// Daemon — Worker execution policy.
// Decides whether to spawn new workers, kill idle ones, or throttle.

import { getLogger } from "../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a policy decision. */
export interface PolicyDecision {
  allowed: boolean;
  reason: string;
}

/** Resource usage metrics for policy decisions. */
export interface ResourceMetrics {
  /** Current number of active workers. */
  activeWorkers: number;
  /** Maximum allowed workers. */
  maxWorkers: number;
  /** Number of tasks waiting in queue. */
  queueLength: number;
  /** Estimated system memory usage percentage (0-100). */
  memoryUsagePercent?: number;
  /** Estimated CPU usage percentage (0-100). */
  cpuUsagePercent?: number;
}

/** Policy configuration. */
export interface PolicyConfig {
  /** Memory usage threshold before throttling (0-100). Default: 85 */
  memoryThresholdPercent?: number;
  /** Queue-to-worker ratio above which spawning is encouraged. Default: 2 */
  spawnRatio?: number;
  /** Minimum idle time (ms) before a worker can be killed. Default: 60000 */
  minIdleBeforeKillMs?: number;
  /** Maximum task execution time before force-killing. Default: 300000 (5 min) */
  maxTaskDurationMs?: number;
}

// ---------------------------------------------------------------------------
// Worker Policy
// ---------------------------------------------------------------------------

export class WorkerPolicy {
  private memoryThresholdPercent: number;
  private spawnRatio: number;
  private minIdleBeforeKillMs: number;
  private maxTaskDurationMs: number;

  constructor(config: PolicyConfig = {}) {
    this.memoryThresholdPercent = config.memoryThresholdPercent ?? 85;
    this.spawnRatio = config.spawnRatio ?? 2;
    this.minIdleBeforeKillMs = config.minIdleBeforeKillMs ?? 60_000;
    this.maxTaskDurationMs = config.maxTaskDurationMs ?? 300_000;
  }

  // -----------------------------------------------------------------------
  // Spawn decisions
  // -----------------------------------------------------------------------

  /**
   * Decide whether to spawn a new worker.
   */
  shouldSpawn(
    activeWorkers: number,
    maxWorkers: number,
    queueLength: number,
  ): PolicyDecision {
    // Hard limit
    if (activeWorkers >= maxWorkers) {
      return { allowed: false, reason: `At max worker limit (${maxWorkers})` };
    }

    // Check memory pressure
    const memUsage = this.getMemoryUsagePercent();
    if (memUsage > this.memoryThresholdPercent) {
      return {
        allowed: false,
        reason: `Memory usage too high (${memUsage.toFixed(1)}% > ${this.memoryThresholdPercent}%)`,
      };
    }

    // Spawn if queue has tasks waiting
    if (queueLength > 0) {
      return { allowed: true, reason: `Queue has ${queueLength} waiting task(s)` };
    }

    // No reason to spawn if nothing is queued
    return { allowed: false, reason: "No tasks in queue" };
  }

  // -----------------------------------------------------------------------
  // Kill decisions
  // -----------------------------------------------------------------------

  /**
   * Decide whether an idle worker should be killed.
   */
  shouldKillIdle(
    idleSinceMs: number,
    activeWorkers: number,
    queueLength: number,
  ): PolicyDecision {
    // Always keep at least 1 worker alive if there are queued tasks
    if (queueLength > 0 && activeWorkers <= 1) {
      return { allowed: false, reason: "Queue non-empty, keeping minimum worker" };
    }

    // Kill if idle too long
    if (idleSinceMs > this.minIdleBeforeKillMs) {
      return {
        allowed: true,
        reason: `Idle for ${(idleSinceMs / 1000).toFixed(0)}s (threshold: ${this.minIdleBeforeKillMs / 1000}s)`,
      };
    }

    return { allowed: false, reason: "Worker not idle long enough" };
  }

  /**
   * Decide whether a running task should be force-killed.
   */
  shouldForceKill(taskDurationMs: number): PolicyDecision {
    if (taskDurationMs > this.maxTaskDurationMs) {
      return {
        allowed: true,
        reason: `Task exceeded max duration (${(taskDurationMs / 1000).toFixed(0)}s > ${this.maxTaskDurationMs / 1000}s)`,
      };
    }

    return { allowed: false, reason: "Task within time limit" };
  }

  // -----------------------------------------------------------------------
  // Task acceptance
  // -----------------------------------------------------------------------

  /**
   * Decide whether a new task should be accepted into the queue.
   */
  shouldAcceptTask(queueLength: number, maxQueueLength: number = 100): PolicyDecision {
    if (queueLength >= maxQueueLength) {
      return {
        allowed: false,
        reason: `Queue full (${queueLength}/${maxQueueLength})`,
      };
    }

    const memUsage = this.getMemoryUsagePercent();
    if (memUsage > 95) {
      return {
        allowed: false,
        reason: `Critical memory pressure (${memUsage.toFixed(1)}%)`,
      };
    }

    return { allowed: true, reason: "Task accepted" };
  }

  // -----------------------------------------------------------------------
  // Resource metrics
  // -----------------------------------------------------------------------

  /**
   * Get current resource metrics for monitoring.
   */
  getMetrics(activeWorkers: number, maxWorkers: number, queueLength: number): ResourceMetrics {
    return {
      activeWorkers,
      maxWorkers,
      queueLength,
      memoryUsagePercent: this.getMemoryUsagePercent(),
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private getMemoryUsagePercent(): number {
    const rss = process.memoryUsage.rss();
    // Estimate total system memory (rough heuristic for policy decisions)
    const totalEstimate = 8 * 1024 * 1024 * 1024; // Assume 8GB as baseline
    return (rss / totalEstimate) * 100;
  }
}
