// File-watch trigger — uses fs.watch for file system event monitoring.

import { watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";
import { getLogger } from "../../../shared/logger.js";
import type { FileConfig } from "./engine.js";

const log = getLogger();

export type FileEventType = "create" | "modify" | "delete";
export type FileWatchCallback = (event: FileEventType, path: string) => void;

export class FileWatchTrigger {
  private watchers: FSWatcher[] = [];
  private paths: string[];
  private events: Set<FileEventType>;
  private debounceMs: number;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = false;

  constructor(config: FileConfig) {
    this.paths = config.paths.map((p) => resolve(p));
    this.events = new Set(config.events ?? ["create", "modify", "delete"]);
    this.debounceMs = config.debounceMs ?? 500;
  }

  /**
   * Start watching all configured paths. Calls `onEvent` for each matching event.
   */
  start(onEvent: FileWatchCallback): void {
    if (this.running) return;

    for (const watchPath of this.paths) {
      try {
        const watcher = watch(
          watchPath,
          { recursive: true },
          (eventType, filename) => {
            if (!filename) return;

            const fullPath = resolve(watchPath, filename);
            const mappedEvent = this.mapEvent(eventType);
            if (!mappedEvent || !this.events.has(mappedEvent)) return;

            // Debounce: coalesce rapid events on the same file
            const existing = this.debounceTimers.get(fullPath);
            if (existing) {
              clearTimeout(existing);
            }

            const timer = setTimeout(() => {
              this.debounceTimers.delete(fullPath);
              try {
                onEvent(mappedEvent, fullPath);
              } catch (err) {
                log.error(`File watch handler error: ${err}`);
              }
            }, this.debounceMs);

            this.debounceTimers.set(fullPath, timer);
          },
        );

        this.watchers.push(watcher);
        log.debug(`File watch started: ${watchPath}`);
      } catch (err) {
        log.error(`Failed to watch "${watchPath}": ${err}`);
      }
    }

    this.running = true;
  }

  /**
   * Stop all file watchers and clear debounce timers.
   */
  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.running = false;
    log.debug("File watch stopped");
  }

  /**
   * Returns true if watchers are active.
   */
  isRunning(): boolean {
    return this.running;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Map Node's fs.watch event type to our FileEventType.
   * fs.watch only emits "rename" and "change" — we approximate the rest.
   */
  private mapEvent(fsEvent: string): FileEventType | null {
    switch (fsEvent) {
      case "rename":
        // "rename" fires for both create and delete. Without stating the file
        // to check existence, we report "create" as the more common case.
        // The calling code can stat if needed.
        return "create";
      case "change":
        return "modify";
      default:
        return null;
    }
  }
}
