// Cron trigger — wraps croner for scheduled execution.

import { Cron, type CronOptions } from "croner";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

export class CronTrigger {
  private job: Cron | null = null;
  private expression: string;
  private timezone: string | undefined;

  constructor(expression: string, timezone?: string) {
    this.expression = expression;
    this.timezone = timezone;
  }

  /**
   * Start the cron job. Calls `onTick` each time the schedule fires.
   */
  start(onTick: () => void): void {
    if (this.job) {
      this.stop();
    }

    const opts: CronOptions = {};
    if (this.timezone) {
      opts.timezone = this.timezone;
    }

    this.job = new Cron(this.expression, opts, () => {
      try {
        onTick();
      } catch (err) {
        log.error(`Cron tick error (${this.expression}): ${err}`);
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
