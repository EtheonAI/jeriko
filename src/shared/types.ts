// Layer 0 — Core shared types. Zero internal imports.

/** Standard Jeriko result envelope. Every command returns this shape. */
export type JerikoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: number };

/** Semantic exit codes used across all commands. */
export enum ExitCode {
  OK        = 0,
  GENERAL   = 1,
  NETWORK   = 2,
  AUTH       = 3,
  NOT_FOUND = 5,
  TIMEOUT   = 7,
}

/** Supported output serialization formats. */
export type OutputFormat = "json" | "text" | "logfmt";

/** Supported operating systems. */
export type Platform = "darwin" | "linux" | "win32";

/** Supported CPU architectures. */
export type Arch = "x64" | "arm64";

/** Log severity levels, ordered by verbosity (debug = most verbose). */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Risk classification for commands and tool calls. */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/** Numeric weight for log levels — used for filtering. */
export const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

/** Map of risk levels to numeric severity (0–3). */
export const RISK_WEIGHT: Record<RiskLevel, number> = {
  low:      0,
  medium:   1,
  high:     2,
  critical: 3,
};

/** A structured log entry written to JSONL files. */
export interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

/** Parsed CLI invocation. */
export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positional: string[];
}

