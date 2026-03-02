/**
 * CLI Format — Pure string helper functions.
 *
 * Every function takes data in, returns a string. No side effects, no state.
 * Used by React components and console output to produce formatted text.
 *
 * Re-exports SLASH_COMMANDS from commands.ts for backward compatibility.
 */

import { t, PALETTE } from "./theme.js";
import { buildMascot } from "./lib/mascot.js";
import type { ConnectorInfo, TriggerInfo, SkillInfo, ModelInfo, HistoryEntry } from "./types.js";

// Import + re-export canonical data from commands.ts for backward compat
import { SLASH_COMMANDS, HELP_ENTRIES, COMMAND_CATEGORIES } from "./commands.js";
export { SLASH_COMMANDS, HELP_ENTRIES, COMMAND_CATEGORIES };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum lines shown in a tool result before truncation. */
const MAX_RESULT_LINES = 12;

/** Box-drawing characters. */
const BOX = {
  tl: "╭", tr: "╮", bl: "╰", br: "╯",
  h: "─", v: "│",
} as const;

// ---------------------------------------------------------------------------
// Token / cost / duration formatting
// ---------------------------------------------------------------------------

/**
 * Format a token count for compact display.
 * @example formatTokens(1200) → "1.2k"
 * @example formatTokens(15000) → "15k"
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  const k = tokens / 1000;
  return k < 10 ? `${k.toFixed(1)}k` : `${Math.round(k)}k`;
}

/**
 * Estimate cost from token counts using per-million-token rates.
 * Defaults to approximate Claude Sonnet pricing.
 */
export function estimateCost(
  tokensIn: number,
  tokensOut: number,
  inputRate: number = 3,
  outputRate: number = 15,
): number {
  return (tokensIn * inputRate + tokensOut * outputRate) / 1_000_000;
}

/**
 * Format a dollar cost for display.
 * @example formatCost(0.12) → "$0.12"
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * @example formatDuration(2300) → "2.3s"
 * @example formatDuration(65000) → "1m 5s"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return "0s";

  const totalSeconds = ms / 1000;

  if (totalSeconds < 60) {
    return totalSeconds < 10
      ? `${totalSeconds.toFixed(1)}s`
      : `${Math.round(totalSeconds)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Format a timestamp as a relative age string.
 * @example formatAge(Date.now() - 5000) → "5s ago"
 * @example formatAge(Date.now() - 300000) → "5m ago"
 */
export function formatAge(timestampMs: number): string {
  const elapsed = Date.now() - timestampMs;
  if (elapsed < 5000) return "just now";
  if (elapsed < 60_000) return `${Math.round(elapsed / 1000)}s ago`;
  if (elapsed < 3_600_000) return `${Math.round(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.round(elapsed / 3_600_000)}h ago`;
  return `${Math.round(elapsed / 86_400_000)}d ago`;
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

/** Capitalize the first letter of a string. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Pluralize a count + noun pair.
 * @example pluralize(1, "tool call") → "1 tool call"
 * @example pluralize(3, "tool call") → "3 tool calls"
 */
export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count !== 1 ? "s" : ""}`;
}

/** Strip ANSI escape codes from a string to get the visual length. */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Replace the user's home directory prefix with `~` for compact display. */
export function shortenHome(path: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return home && path.startsWith(home) ? "~" + path.slice(home.length) : path;
}

/**
 * Extract the most meaningful argument from a tool call's JSON args.
 * Returns a short summary string (file path, command, URL, etc.).
 */
export function extractToolSummary(args: string | Record<string, unknown>): string {
  const parsed = typeof args === "string" ? safeParseJson(args) : args;
  for (const key of ["command", "file_path", "path", "pattern", "query", "url"]) {
    if (typeof parsed[key] === "string") return parsed[key] as string;
  }
  const firstString = Object.values(parsed).find((v): v is string => typeof v === "string");
  return firstString ?? "";
}

/** Truncate a multi-line string to maxLines, appending a summary of hidden lines. */
export function truncateResult(text: string, maxLines: number = MAX_RESULT_LINES): string {
  if (!text) return "";
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;

  const visible = lines.slice(0, maxLines).join("\n");
  const remaining = lines.length - maxLines;
  return `${visible}\n… (${remaining} more lines)`;
}

/** Safely parse JSON, returning an empty object on failure. */
export function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Tool call formatting — chalk-based (used for console/Static output)
// ---------------------------------------------------------------------------

/**
 * Format a tool call start event.
 * Output: `⏺ Read src/cli/chat.ts`
 */
export function formatToolCall(name: string, args: string): string {
  const displayName = capitalize(name);
  const summary = extractToolSummary(args);
  const summaryStr = summary ? ` ${t.muted(summary)}` : "";
  return `${t.blue("⏺")} ${t.bold(displayName)}${summaryStr}`;
}

/**
 * Format a tool result.
 * Uses `⎿` connector: dim for success, red for error.
 */
export function formatToolResult(name: string, result: string, isError: boolean): string {
  if (!result) return "";

  const color = isError ? t.error : t.dim;
  const lines = result.split("\n");
  const truncated = lines.length > MAX_RESULT_LINES;
  const displayLines = truncated ? lines.slice(0, MAX_RESULT_LINES) : lines;

  const prefix = `  ${color("⎿")}  `;
  const indented = displayLines
    .map((line, i) => (i === 0 ? `${prefix}${t.muted(line)}` : `      ${t.muted(line)}`))
    .join("\n");

  if (truncated) {
    return `${indented}\n      ${t.dim(`… (${lines.length - MAX_RESULT_LINES} more lines)`)}`;
  }

  return indented;
}

// ---------------------------------------------------------------------------
// Status / info formatters
// ---------------------------------------------------------------------------

/** Format the end of a thinking phase. */
export function formatThinkingDone(summary?: string): string {
  if (!summary) return t.dim("✦ Thinking complete");
  const maxLen = 60;
  const truncated = summary.length > maxLen ? summary.slice(0, maxLen) + "…" : summary;
  return t.dim(`✦ ${truncated}`);
}

/** Format a context compaction event. */
export function formatCompaction(before: number, after: number): string {
  return t.cyan(`✻ Context compacted (${formatTokens(before)} → ${formatTokens(after)} tokens)`);
}

/** Format the turn completion status line. */
export function formatTurnComplete(
  model: string,
  tokensIn: number,
  tokensOut: number,
  durationMs: number,
): string {
  const cost = estimateCost(tokensIn, tokensOut);
  const parts = [
    model,
    `${formatTokens(tokensIn)}↑`,
    `${formatTokens(tokensOut)}↓`,
    formatDuration(durationMs),
    formatCost(cost),
  ];
  return t.dim(parts.join(" · "));
}

/** Format a cancellation indicator. */
export function formatCancelled(): string {
  return t.muted("⏎ Cancelled");
}

/** Format an error message. */
export function formatError(message: string): string {
  return t.error(`✗ ${message}`);
}

// ---------------------------------------------------------------------------
// Welcome banner — bot ASCII art + info panel
// ---------------------------------------------------------------------------

/** Gap between the bot art column and the info panel column. */
const COLUMN_GAP = 3;

/** Maximum width for the welcome box. */
const MAX_BOX_WIDTH = 72;

/**
 * Render the welcome banner with bot ASCII art and info panel.
 */
export function formatWelcome(version: string, model: string, cwd: string): string {
  const botArt = buildBotArt();
  const infoPanel = buildInfoPanel(model, cwd);
  const content = mergeColumns(botArt, infoPanel, COLUMN_GAP);

  const maxContentWidth = Math.max(...content.map((l) => stripAnsi(l).length));
  const innerWidth = Math.min(Math.max(maxContentWidth, 60), MAX_BOX_WIDTH - 4);
  const totalWidth = innerWidth + 4;

  // Title border
  const titleColored = ` ${t.brand("✻")} ${t.brandBold(`Jeriko v${version}`)} `;
  const titleVisualLen = stripAnsi(titleColored).length;
  const prefixDashes = 2;
  const remainingDashes = Math.max(0, totalWidth - 2 - prefixDashes - titleVisualLen);
  const topBorder = `${BOX.tl}${BOX.h.repeat(prefixDashes)}${titleColored}${BOX.h.repeat(remainingDashes)}${BOX.tr}`;
  const bottomBorder = `${BOX.bl}${BOX.h.repeat(totalWidth - 2)}${BOX.br}`;

  const lines = [topBorder];
  for (const line of content) {
    const visualLen = stripAnsi(line).length;
    const padding = Math.max(0, innerWidth - visualLen);
    lines.push(`${BOX.v} ${line}${" ".repeat(padding)} ${BOX.v}`);
  }
  lines.push(bottomBorder);

  return lines.join("\n");
}

/**
 * Build the bot ASCII art — delegates to the shared mascot module.
 */
function buildBotArt(): string[] {
  return buildMascot();
}

/**
 * Build the info panel (right column).
 */
function buildInfoPanel(model: string, cwd: string): string[] {
  const displayCwd = shortenCwd(cwd);

  return [
    "",
    "",
    `${t.dim("Model")}     ${t.text(model)}`,
    `${t.dim("Session")}   ${t.muted("new")}`,
    `${t.dim("cwd")}       ${t.muted(displayCwd)}`,
    "",
    `${t.brand("/help")} ${t.dim("for commands")} ${t.dim("·")} ${t.brand("/new")} ${t.dim("for fresh session")}`,
    `${t.dim("Ctrl+C to interrupt · /exit to quit")}`,
  ];
}

/** Merge two columns side by side. */
function mergeColumns(left: string[], right: string[], gap: number): string[] {
  const maxLines = Math.max(left.length, right.length);
  const leftWidth = left.length > 0
    ? Math.max(...left.map((l) => stripAnsi(l).length))
    : 0;
  const gapStr = " ".repeat(gap);

  const merged: string[] = [];
  for (let i = 0; i < maxLines; i++) {
    const l = left[i] ?? " ".repeat(leftWidth);
    const lPadded = l + " ".repeat(Math.max(0, leftWidth - stripAnsi(l).length));
    const r = right[i] ?? "";
    merged.push(`${lPadded}${gapStr}${r}`);
  }
  return merged;
}

/** Shorten cwd for banner display. */
function shortenCwd(cwd: string): string {
  let display = shortenHome(cwd);
  const maxWidth = 40;
  if (display.length > maxWidth) {
    display = "…" + display.slice(-(maxWidth - 1));
  }
  return display;
}

/** Format the session resume banner. */
export function formatSessionResume(slug: string, messageCount?: number): string {
  const countSuffix = messageCount ? ` (${messageCount} messages)` : "";
  return t.muted(`Resuming session "${slug}"${countSuffix}`);
}

/** Format the new session banner. */
export function formatNewSession(slug: string, model: string): string {
  return `${t.green("●")} New session ${t.blue(slug)} ${t.dim(`(${model})`)}`;
}

// ---------------------------------------------------------------------------
// Help — grouped by category
// ---------------------------------------------------------------------------

/**
 * Format the help text with all available commands, grouped by category.
 */
export function formatHelp(): string {
  const lines = [
    "",
    t.header("  Commands"),
    t.dim("  " + "─".repeat(46)),
  ];

  for (const category of COMMAND_CATEGORIES) {
    lines.push("");
    lines.push(`  ${t.muted(`── ${category.label} ──`)}`);
    for (const [cmd, desc] of category.commands) {
      lines.push(`  ${t.brand(cmd.padEnd(18))} ${t.muted(desc)}`);
    }
  }

  lines.push("");
  lines.push(t.dim("  Type exit or /quit to leave."));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Session list
// ---------------------------------------------------------------------------

/**
 * Format a list of sessions as a table.
 */
export function formatSessionList(
  sessions: ReadonlyArray<{
    id?: string;
    slug: string;
    title: string;
    model: string;
    token_count: number;
    updated_at: number;
  }>,
  currentId?: string | null,
  currentSlug?: string | null,
): string {
  if (sessions.length === 0) return t.muted("  No sessions found.");

  const lines: string[] = [
    "",
    t.header("  Sessions"),
    t.dim("  " + "─".repeat(46)),
  ];

  for (const s of sessions) {
    const date = new Date(s.updated_at).toLocaleDateString();
    const isCurrent = (currentSlug && s.slug === currentSlug)
      || (currentId && s.id && s.id === currentId)
      || false;
    const marker = isCurrent ? t.brand(" ← current") : "";
    const slugStr = t.blue(s.slug.padEnd(20));
    const titleStr = s.title === s.slug ? "" : t.text(` ${s.title}`);
    const meta = t.dim(`  ${s.model} · ${formatTokens(s.token_count)} tokens · ${date}`);
    lines.push(`  ${slugStr}${titleStr}${meta}${marker}`);
  }

  lines.push("");
  lines.push(t.dim("  Use /resume <slug> to switch sessions."));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Sub-agent formatting (chalk-based)
// ---------------------------------------------------------------------------

/** Format the start of a delegate sub-agent. */
export function formatDelegateStart(agentType: string, prompt: string): string {
  const label = capitalize(agentType);
  const summary = prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt;
  return `${t.purple("⏺")} ${t.bold(label)}  ${t.muted(summary)}`;
}

/** Format the start of a parallel task fan-out. */
export function formatParallelStart(taskCount: number): string {
  return `${t.purple("⏺")} ${t.bold("Parallel")}  ${t.muted(`${taskCount} task${taskCount !== 1 ? "s" : ""}`)}`;
}

/** Format the completion of a delegate tool call. */
export function formatDelegateResult(result: string, durationMs: number): string {
  try {
    const parsed = JSON.parse(result);
    if (!parsed.ok) {
      return `  ${t.error("⎿")}  ${t.error(parsed.error ?? "Sub-agent failed")}`;
    }
    const toolCount = parsed.context?.toolCalls?.length ?? 0;
    const totalTokens = (parsed.tokensIn ?? 0) + (parsed.tokensOut ?? 0);
    const summary = t.muted(
      `Done (${pluralize(toolCount, "tool call")} · ${formatTokens(totalTokens)} tokens · ${formatDuration(durationMs)})`,
    );
    return `  ${t.dim("⎿")}  ${summary}`;
  } catch {
    return `  ${t.dim("⎿")}  ${t.muted("Done")}`;
  }
}

/** Format the completion of a parallel_tasks tool call. */
export function formatParallelResult(result: string): string {
  try {
    const parsed = JSON.parse(result);
    if (!parsed.ok) {
      return `  ${t.error("⎿")}  ${t.error(parsed.error ?? "Parallel execution failed")}`;
    }

    const results = parsed.results as Array<{
      label: string;
      status: string;
      agentType: string;
      tokensIn: number;
      tokensOut: number;
      durationMs: number;
      context?: { toolCalls?: unknown[] };
    }>;

    if (!results || results.length === 0) {
      return `  ${t.dim("⎿")}  ${t.muted("Done (no results)")}`;
    }

    const lines: string[] = [];
    for (const r of results) {
      const icon = r.status === "success" ? t.green("✓") : t.error("✗");
      const label = capitalize(r.agentType);
      const toolCount = r.context?.toolCalls?.length ?? 0;
      const totalTokens = (r.tokensIn ?? 0) + (r.tokensOut ?? 0);
      lines.push(
        `  ${t.dim("⎿")}  ${icon} ${t.blue(label)}  ${t.muted(
          `${pluralize(toolCount, "tool call")} · ${formatTokens(totalTokens)} tokens · ${formatDuration(r.durationMs)}`,
        )}`,
      );
    }
    return lines.join("\n");
  } catch {
    return `  ${t.dim("⎿")}  ${t.muted("Done")}`;
  }
}

// ---------------------------------------------------------------------------
// Setup wizard formatting
// ---------------------------------------------------------------------------

/**
 * Format the provider selection list for the setup wizard.
 */
export function formatSetupProviders(
  providers: ReadonlyArray<{ name: string; needsApiKey: boolean }>,
  selectedIndex: number,
): string {
  const lines = [
    "",
    t.brandBold("  Welcome to Jeriko"),
    "",
    t.muted("  Choose your AI provider:"),
    "",
  ];

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]!;
    const isSelected = i === selectedIndex;
    const marker = isSelected ? t.brand("  ▸ ") : "    ";
    const name = isSelected ? t.brandBold(p.name) : t.text(p.name);
    const tag = i === 0 ? t.green(" (recommended)") : "";
    const noKey = !p.needsApiKey ? t.dim(" — no API key needed") : "";
    lines.push(`${marker}${name}${tag}${noKey}`);
  }

  lines.push("");
  lines.push(t.dim("  ↑↓ to navigate · Enter to select"));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Channel management
// ---------------------------------------------------------------------------

/**
 * Format a list of channels with their connection status.
 */
export function formatChannelList(
  channels: ReadonlyArray<{
    name: string;
    status: string;
    error?: string;
    connected_at?: string;
  }>,
): string {
  if (channels.length === 0) return t.muted("  No channels configured.");

  const statusColor: Record<string, (s: string) => string> = {
    connected:    t.green,
    disconnected: t.dim,
    failed:       t.error,
  };

  const lines: string[] = [
    "",
    t.header("  Channels"),
    t.dim("  " + "─".repeat(46)),
  ];

  for (const ch of channels) {
    const colorFn = statusColor[ch.status] ?? t.dim;
    const statusStr = colorFn(ch.status);
    const errorStr = ch.error ? t.error(` — ${ch.error}`) : "";
    const sinceStr = ch.status === "connected" && ch.connected_at
      ? t.dim(` (since ${new Date(ch.connected_at).toLocaleTimeString()})`)
      : "";
    lines.push(`  ${t.blue(ch.name.padEnd(16))} ${statusStr}${errorStr}${sinceStr}`);
  }

  lines.push("");
  lines.push(t.dim("  Use /channel connect <name> or /channel disconnect <name>."));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Model list
// ---------------------------------------------------------------------------

/**
 * Format a list of available models with capability icons.
 */
export function formatModelList(
  models: ReadonlyArray<ModelInfo>,
  currentModel: string,
): string {
  if (models.length === 0) return t.muted("  No models available.");

  const lines: string[] = [
    "",
    t.header("  Models"),
    t.dim("  " + "─".repeat(46)),
  ];

  for (const m of models) {
    const isCurrent = m.id === currentModel || m.name === currentModel;
    const marker = isCurrent ? t.brand(" ← active") : "";
    const caps: string[] = [];
    if (m.supportsTools) caps.push("tools");
    if (m.supportsVision) caps.push("vision");
    if (m.contextWindow) caps.push(`${formatTokens(m.contextWindow)} ctx`);
    const capsStr = caps.length > 0 ? t.dim(` (${caps.join(", ")})`) : "";

    lines.push(`  ${t.blue(m.id.padEnd(24))} ${t.muted(m.provider)}${capsStr}${marker}`);
  }

  lines.push("");
  lines.push(t.dim("  Use /model <name> to switch."));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Connector list
// ---------------------------------------------------------------------------

/**
 * Format a list of connectors with status colors.
 */
export function formatConnectorList(connectors: ReadonlyArray<ConnectorInfo>): string {
  if (connectors.length === 0) return t.muted("  No connectors configured.");

  const statusColor: Record<string, (s: string) => string> = {
    connected:    t.green,
    disconnected: t.dim,
    error:        t.error,
  };

  const lines: string[] = [
    "",
    t.header("  Connectors"),
    t.dim("  " + "─".repeat(46)),
  ];

  for (const c of connectors) {
    const colorFn = statusColor[c.status] ?? t.dim;
    const statusStr = colorFn(c.status);
    const errorStr = c.error ? t.error(` — ${c.error}`) : "";
    lines.push(`  ${t.blue(c.name.padEnd(16))} ${t.muted(c.type.padEnd(10))} ${statusStr}${errorStr}`);
  }

  lines.push("");
  lines.push(t.dim("  Use /connect <name> or /disconnect <name>."));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Trigger list
// ---------------------------------------------------------------------------

/**
 * Format a list of triggers with type and status.
 */
export function formatTriggerList(triggers: ReadonlyArray<TriggerInfo>): string {
  if (triggers.length === 0) return t.muted("  No triggers configured.");

  const lines: string[] = [
    "",
    t.header("  Triggers"),
    t.dim("  " + "─".repeat(46)),
  ];

  for (const tr of triggers) {
    const statusStr = tr.enabled ? t.green("enabled") : t.dim("disabled");
    const runStr = t.muted(`${tr.runCount} runs`);
    const lastRun = tr.lastRunAt ? t.dim(` · last ${formatAge(tr.lastRunAt)}`) : "";
    const errorStr = tr.error ? t.error(` — ${tr.error}`) : "";
    lines.push(`  ${t.blue(tr.name.padEnd(20))} ${t.muted(tr.type.padEnd(10))} ${statusStr}  ${runStr}${lastRun}${errorStr}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Skill list / detail
// ---------------------------------------------------------------------------

/**
 * Format a list of installed skills.
 */
export function formatSkillList(skills: ReadonlyArray<SkillInfo>): string {
  if (skills.length === 0) return t.muted("  No skills installed.");

  const lines: string[] = [
    "",
    t.header("  Skills"),
    t.dim("  " + "─".repeat(46)),
  ];

  for (const s of skills) {
    const invocable = s.userInvocable ? t.cyan(" ⚡") : "";
    lines.push(`  ${t.blue(s.name.padEnd(20))} ${t.muted(s.description)}${invocable}`);
  }

  lines.push("");
  lines.push(t.dim("  Use /skill <name> for details. ⚡ = user-invocable"));
  return lines.join("\n");
}

/**
 * Format skill details with description and body.
 */
export function formatSkillDetail(name: string, description: string, body: string): string {
  const lines: string[] = [
    "",
    t.header(`  ${capitalize(name)}`),
    t.dim("  " + "─".repeat(46)),
    `  ${t.muted(description)}`,
    "",
  ];

  if (body) {
    const bodyLines = body.split("\n");
    const displayLines = bodyLines.length > 30
      ? [...bodyLines.slice(0, 30), `… (${bodyLines.length - 30} more lines)`]
      : bodyLines;
    for (const line of displayLines) {
      lines.push(`  ${t.text(line)}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Status / system info
// ---------------------------------------------------------------------------

/**
 * Format daemon status information.
 */
export function formatStatus(status: {
  phase: string;
  uptime: number;
  memoryMb?: number;
  sessionCount?: number;
  activeChannels?: number;
}): string {
  const lines: string[] = [
    "",
    t.header("  Daemon Status"),
    t.dim("  " + "─".repeat(46)),
  ];

  const phaseColor = status.phase === "running" ? t.green : t.yellow;
  lines.push(`  ${t.dim("Phase")}       ${phaseColor(status.phase)}`);
  lines.push(`  ${t.dim("Uptime")}      ${t.text(formatDuration(status.uptime))}`);
  if (status.memoryMb !== undefined) {
    lines.push(`  ${t.dim("Memory")}      ${t.text(`${status.memoryMb.toFixed(1)} MB`)}`);
  }
  if (status.sessionCount !== undefined) {
    lines.push(`  ${t.dim("Sessions")}    ${t.text(String(status.sessionCount))}`);
  }
  if (status.activeChannels !== undefined) {
    lines.push(`  ${t.dim("Channels")}    ${t.text(String(status.activeChannels))}`);
  }

  return lines.join("\n");
}

/**
 * Format system information (CPU, memory, platform).
 */
export function formatSysInfo(): string {
  const os = require("node:os");
  const lines: string[] = [
    "",
    t.header("  System Info"),
    t.dim("  " + "─".repeat(46)),
    `  ${t.dim("Platform")}    ${t.text(`${os.platform()} ${os.arch()}`)}`,
    `  ${t.dim("OS")}          ${t.text(os.release())}`,
    `  ${t.dim("CPUs")}        ${t.text(`${os.cpus().length} cores`)}`,
    `  ${t.dim("Memory")}      ${t.text(`${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB total`)}`,
    `  ${t.dim("Free")}        ${t.text(`${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)} GB free`)}`,
    `  ${t.dim("Hostname")}    ${t.text(os.hostname())}`,
    `  ${t.dim("User")}        ${t.text(os.userInfo().username)}`,
    `  ${t.dim("Shell")}       ${t.text(process.env.SHELL ?? "unknown")}`,
    `  ${t.dim("cwd")}         ${t.text(shortenHome(process.cwd()))}`,
  ];

  return lines.join("\n");
}

/**
 * Format configuration tree (sanitized — no secrets).
 */
export function formatConfig(config: Record<string, unknown>): string {
  const lines: string[] = [
    "",
    t.header("  Configuration"),
    t.dim("  " + "─".repeat(46)),
  ];

  const sensitiveKeys = new Set(["apiKey", "token", "secret", "password", "key"]);

  function renderObj(obj: Record<string, unknown>, depth: number): void {
    const indent = "  ".repeat(depth + 1);
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      // Redact sensitive values
      if (sensitiveKeys.has(key) && typeof value === "string" && value.length > 0) {
        lines.push(`${indent}${t.dim(key)}: ${t.muted("••••••")}`);
        continue;
      }

      if (typeof value === "object" && !Array.isArray(value)) {
        lines.push(`${indent}${t.blue(key)}:`);
        renderObj(value as Record<string, unknown>, depth + 1);
      } else if (Array.isArray(value)) {
        lines.push(`${indent}${t.dim(key)}: ${t.muted(`[${value.length} items]`)}`);
      } else {
        lines.push(`${indent}${t.dim(key)}: ${t.text(String(value))}`);
      }
    }
  }

  renderObj(config, 0);
  return lines.join("\n");
}

/**
 * Format message history.
 */
export function formatHistory(entries: ReadonlyArray<HistoryEntry>): string {
  if (entries.length === 0) return t.muted("  No messages in current session.");

  const lines: string[] = [
    "",
    t.header("  History"),
    t.dim("  " + "─".repeat(46)),
  ];

  for (const entry of entries) {
    const roleColor = entry.role === "user" ? t.brand : entry.role === "assistant" ? t.blue : t.dim;
    const content = entry.content.length > 80
      ? entry.content.slice(0, 80) + "…"
      : entry.content;
    lines.push(`  ${roleColor(entry.role.padEnd(10))} ${t.text(content)}`);
  }

  lines.push("");
  lines.push(t.dim(`  ${entries.length} messages total.`));
  return lines.join("\n");
}

/**
 * Format connector health check results.
 */
export function formatHealth(
  results: ReadonlyArray<{
    name: string;
    healthy: boolean;
    latencyMs: number;
    error?: string;
  }>,
): string {
  if (results.length === 0) return t.muted("  No connectors to check.");

  const lines: string[] = [
    "",
    t.header("  Health Check"),
    t.dim("  " + "─".repeat(46)),
  ];

  for (const r of results) {
    const icon = r.healthy ? t.green("✓") : t.error("✗");
    const latency = t.muted(`${r.latencyMs}ms`);
    const errorStr = r.error ? t.error(` — ${r.error}`) : "";
    lines.push(`  ${icon} ${t.blue(r.name.padEnd(16))} ${latency}${errorStr}`);
  }

  return lines.join("\n");
}
