// Cron trigger — wraps croner for scheduled execution.

import { Cron, type CronOptions } from "croner";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

export class CronTrigger {
  private job: Cron | null = null;
  private expression: string;
  private timezone: string | undefined;
  private executing = false;

  constructor(expression: string, timezone?: string) {
    this.expression = expression;
    this.timezone = timezone;
  }

  /**
   * Start the cron job. Calls `onTick` each time the schedule fires.
   * Skips tick if the previous execution is still running (overlap protection).
   */
  start(onTick: () => void | Promise<void>): void {
    if (this.job) {
      this.stop();
    }

    const opts: CronOptions = {};
    if (this.timezone) {
      opts.timezone = this.timezone;
    }

    this.job = new Cron(this.expression, opts, async () => {
      if (this.executing) {
        log.warn(`Cron tick skipped (previous still running): "${this.expression}"`);
        return;
      }
      this.executing = true;
      try {
        await onTick();
      } catch (err) {
        log.error(`Cron tick error (${this.expression}): ${err}`);
      } finally {
        this.executing = false;
      }
    });

    log.debug(`Cron started: "${this.expression}" (tz=${this.timezone ?? "local"})`);
  }

  /**
   * Stop the cron job.
   */
  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      log.debug(`Cron stopped: "${this.expression}"`);
    }
  }

  /**
   * Returns true if the job is currently scheduled.
   */
  isRunning(): boolean {
    return this.job !== null && this.job.isRunning();
  }

  /**
   * Get the next scheduled run time as a Date, or null if stopped.
   */
  nextRun(): Date | null {
    if (!this.job) return null;
    return this.job.nextRun() ?? null;
  }

  /**
   * Get the previous run time, or null if never fired.
   */
  previousRun(): Date | null {
    if (!this.job) return null;
    return this.job.previousRun() ?? null;
  }
}
