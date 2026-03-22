// Layer 0 barrel — re-exports everything from shared utilities.

export { ok, fail, okResult, failResult, EXIT, setOutputFormat, getOutputFormat } from "./output.js";
export { parseArgs, requireFlag, flagStr, flagBool } from "./args.js";
export { loadConfig, getConfigDir, getDataDir } from "./config.js";
export { Bus, globalBus } from "./bus.js";
export {
  estimateTokens, isOverContextLimit, shouldCompact, contextUsagePercent,
  DEFAULT_CONTEXT_LIMIT, PRE_TRIM_CONTEXT_RATIO, COMPACTION_CONTEXT_RATIO, COMPACT_TARGET_RATIO, MIN_MESSAGES_FOR_COMPACTION,
} from "./tokens.js";
export { escapeAppleScript, escapeShellArg, escapeDoubleQuoted, stripAnsi } from "./escape.js";
export { Logger, getLogger } from "./logger.js";
export { ExitCode, LOG_LEVEL_WEIGHT, RISK_WEIGHT } from "./types.js";
export type {
  JerikoResult,
  OutputFormat,
  Platform,
  Arch,
  LogLevel,
  RiskLevel,
  LogEntry,
  ParsedArgs,

} from "./types.js";
export type {
  JerikoConfig,
  AgentConfig,
  ChannelsConfig,
  ConnectorsConfig,
  SecurityConfig,
  StorageConfig,
  LoggingConfig,
} from "./config.js";
export type { LoggerOptions } from "./logger.js";
