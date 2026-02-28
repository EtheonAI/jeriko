// Layer 0 — Structured JSONL logger with rotation. Minimal internal imports.

import * as fs from "node:fs";
import * as path from "node:path";

// We only import types + pure functions — no circular deps.
import type { LogLevel, LogEntry } from "./types.js";
import { LOG_LEVEL_WEIGHT } from "./types.js";
import { getDataDir } from "./config.js";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface LoggerOptions {
  /** Path to the log file. Default: <dataDir>/agent.log */
  filePath?: string;
  /** Minimum level to write. Default: "info" */
  level?: LogLevel;
  /** Max file size in bytes before rotation. Default: 10MB */
  maxFileSize?: number;
  /** Number of rotated files to keep. Default: 5 */
  maxFiles?: number;
}

export class Logger {
  private filePath: string;
  private level: LogLevel;
  private maxFileSize: number;
  private maxFiles: number;
  private fd: number | null = null;
  private currentSize = 0;

  constructor(opts: LoggerOptions = {}) {
    this.filePath    = opts.filePath ?? path.join(getDataDir(), "agent.log");
    this.level       = opts.level ?? "info";
    this.maxFileSize = opts.maxFileSize ?? 10 * 1024 * 1024;
    this.maxFiles    = opts.maxFiles ?? 5;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  debug(message: string, extra?: Record<string, unknown>): void {
    this.write("debug", message, extra);
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.write("info", message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.write("warn", message, extra);
  }

  error(message: string, extra?: Record<string, unknown>): void {
    this.write("error", message, extra);
  }

  /**
   * Audit log — always written regardless of level setting.
   * Used for security-relevant events (auth, risk assessments, blocked commands).
   */
  audit(message: string, extra?: Record<string, unknown>): void {
    this.writeEntry({
      ts: new Date().toISOString(),
      level: "info",
      audit: true,
      message,
      ...extra,
    });
  }

  /**
   * Close the file descriptor. Call on shutdown.
   */
  close(): void {
    if (this.fd !== null) {
      try { fs.closeSync(this.fd); } catch { /* ignore */ }
      this.fd = null;
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private write(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
    if (LOG_LEVEL_WEIGHT[level] < LOG_LEVEL_WEIGHT[this.level]) return;

    const entry: LogEntry & Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      message,
    };
    if (extra) Object.assign(entry, extra);
    this.writeEntry(entry);
  }

  private writeEntry(entry: Record<string, unknown>): void {
    const line = JSON.stringify(entry) + "\n";
    const bytes = Buffer.byteLength(line, "utf-8");

    this.ensureOpen();
    if (this.fd === null) return; // failed to open — give up silently

    // Rotate if needed
    if (this.currentSize + bytes > this.maxFileSize) {
      this.rotate();
      this.ensureOpen();
      if (this.fd === null) return;
    }

    try {
      fs.writeSync(this.fd, line);
      this.currentSize += bytes;
    } catch {
      // If the write fails (disk full, etc.), close and move on.
      this.close();
    }
  }

  private ensureOpen(): void {
    if (this.fd !== null) return;

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.fd = fs.openSync(this.filePath, "a");

      try {
        const stat = fs.fstatSync(this.fd);
        this.currentSize = stat.size;
      } catch {
        this.currentSize = 0;
      }
    } catch {
      this.fd = null;
    }
  }

  /**
   * Rotate log files:
   *   agent.log   → agent.log.1
   *   agent.log.1 → agent.log.2
   *   ...
   *   agent.log.<maxFiles> → deleted
   */
  private rotate(): void {
    this.close();

    try {
      // Delete the oldest file
      const oldest = `${this.filePath}.${this.maxFiles}`;
      if (fs.existsSync(oldest)) fs.unlinkSync(oldest);

      // Shift existing rotated files up by 1
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const from = `${this.filePath}.${i}`;
        const to = `${this.filePath}.${i + 1}`;
        if (fs.existsSync(from)) fs.renameSync(from, to);
      }

      // Move current log to .1
      if (fs.existsSync(this.filePath)) {
        fs.renameSync(this.filePath, `${this.filePath}.1`);
      }
    } catch {
      // Best effort — if rotation fails, we'll just keep writing
    }

    this.currentSize = 0;
  }
}

// ---------------------------------------------------------------------------
// Default singleton — convenient for most use cases.
// ---------------------------------------------------------------------------

let _default: Logger | undefined;

/**
 * Get the default Logger singleton. Created lazily on first call.
 */
export function getLogger(opts?: LoggerOptions): Logger {
  if (!_default) {
    _default = new Logger(opts);
  }
  return _default;
}
