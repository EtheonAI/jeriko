/**
 * CLI Format — Pure string helper functions.
 *
 * Every function takes data in, returns a string. No side effects, no state.
 * Used by React components and console output to produce formatted text.
 *
 * Re-exports SLASH_COMMANDS from commands.ts for backward compatibility.
 */

import { t, PALETTE, ICONS, BOX, sectionHeader, treeItem, kvPair, hint, statusDot, badge, subSection } from "./theme.js";
import { buildMascot } from "./lib/mascot.js";
import { estimateModelCost, formatModelCost } from "./lib/cost.js";
import type { ConnectorInfo, TriggerInfo, SkillInfo, ModelInfo, HistoryEntry, ProviderInfo, PlanInfo, SessionStats, SessionInfo, ShareInfo, TaskDef, NotificationPref, AuthStatus } from "./types.js";

// Import + re-export canonical data from commands.ts for backward compat
import { SLASH_COMMANDS, HELP_ENTRIES, COMMAND_CATEGORIES } from "./commands.js";
export { SLASH_COMMANDS, HELP_ENTRIES, COMMAND_CATEGORIES };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum lines shown in a tool result before truncation. */
const MAX_RESULT_LINES = 12;

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
  return `${t.blue(ICONS.tool)} ${t.bold(displayName)}${summaryStr}`;
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

  const prefix = `  ${color(ICONS.result)}  `;
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
  if (!summary) return t.dim("Thinking complete");
  const maxLen = 60;
  const truncated = summary.length > maxLen ? summary.slice(0, maxLen) + "…" : summary;
  return t.dim(truncated);
}

/** Format a context compaction event. */
export function formatCompaction(before: number, after: number): string {
  return t.cyan(`Context compacted (${formatTokens(before)} → ${formatTokens(after)} tokens)`);
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
  return t.error(`error: ${message}`);
}

// ---------------------------------------------------------------------------
// Welcome banner — Claude Code-style bordered box with mascot
// ---------------------------------------------------------------------------

/**
 * Render welcome banner: bordered box with centered mascot and info below.
 * Uses box-drawing characters (╭╮╰╯│─) for clean presentation.
 */
export function formatWelcome(version: string, model: string, cwd: string): string {
  const displayCwd = shortenHome(cwd);
  const cat = buildMascot();

  // Box width = mascot width + padding (4 each side)
  const mascotWidth = Math.max(...cat.map((l) => stripAnsi(l).length));
  const innerWidth = Math.max(mascotWidth + 8, 78);

  // ── Build rows ──
  const titleText = ` Jeriko v${version} `;
  const topAfter = BOX.h.repeat(Math.max(0, innerWidth - titleText.length - 3));
  const topLine = t.dim(`${BOX.tl}${BOX.h}${BOX.h}${BOX.h}`) + t.brandBold(titleText) + t.dim(topAfter + BOX.tr);
  const bottomLine = t.dim(`${BOX.bl}${BOX.h.repeat(innerWidth)}${BOX.br}`);

  const rows: string[] = [topLine];

  /** Wrap a content line in box borders, centered or left-padded. */
  const boxLine = (content: string, pad: number = 0): string => {
    const vis = stripAnsi(content).length;
    const left = pad > 0 ? pad : Math.max(0, Math.floor((innerWidth - vis) / 2));
    const right = Math.max(0, innerWidth - vis - left);
    return `${t.dim(BOX.v)}${" ".repeat(left)}${content}${" ".repeat(right)}${t.dim(BOX.v)}`;
  };

  // Empty line
  rows.push(boxLine(""));

  // Mascot — centered
  for (const line of cat) {
    rows.push(boxLine(line));
  }

  // Empty line
  rows.push(boxLine(""));

  // Info line: model · cwd
  const infoLine = `${t.muted("model:")} ${t.text(model)}  ${t.muted(BOX.v)}  ${t.muted("cwd:")} ${t.muted(displayCwd)}`;
  rows.push(boxLine(infoLine, 3));

  // Hints line
  const hintsLine = `${t.muted("/help commands")}  ${t.dim("·")}  ${t.muted("/new session")}  ${t.dim("·")}  ${t.muted("/model switch")}`;
  rows.push(boxLine(hintsLine, 3));

  // Empty line
  rows.push(boxLine(""));

  rows.push(bottomLine);

  return rows.join("\n");
}

/** Format the session resume banner. */
export function formatSessionResume(slug: string, messageCount?: number): string {
  const countSuffix = messageCount ? ` (${messageCount} messages)` : "";
  return t.muted(`Resuming session "${slug}"${countSuffix}`);
}

/** Format the new session banner. */
export function formatNewSession(slug: string, model: string): string {
  return `${statusDot("active")} New session ${t.blue(slug)} ${t.dim(`(${model})`)}`;
}

// ---------------------------------------------------------------------------
// Help — grouped by category
// ---------------------------------------------------------------------------

/**
 * Format the help text with all available commands, grouped by category.
 * Clean indented groups without tree connectors.
 */
export function formatHelp(): string {
  const lines = [
    "",
    sectionHeader("Commands"),
  ];

  for (const category of COMMAND_CATEGORIES) {
    lines.push("");
    lines.push(`    ${t.text(category.label)}`);
    for (const [cmd, desc] of category.commands) {
      lines.push(`      ${t.brand(cmd.padEnd(20))} ${t.muted(desc)}`);
    }
  }

  lines.push("");
  lines.push(hint("Type", "exit", `or ${t.muted("/quit")} ${t.dim("to leave.")}`));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Session list
// ---------------------------------------------------------------------------

/**
 * Format a list of sessions as a structured list with status indicators.
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
    sectionHeader("Sessions"),
  ];

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]!;
    const isCurrent = (currentSlug && s.slug === currentSlug)
      || (currentId && s.id && s.id === currentId)
      || false;
    const marker = isCurrent ? t.brand(" ← current") : "";
    const icon = statusDot(isCurrent ? "active" : "inactive");
    const slugStr = isCurrent ? t.brandBold(s.slug.padEnd(18)) : t.blue(s.slug.padEnd(18));
    const titleStr = s.title === s.slug ? "" : t.text(` ${s.title}`);
    const age = formatAge(s.updated_at);
    const meta = t.dim(`  ${s.model} ${ICONS.dot} ${formatTokens(s.token_count)} tokens ${ICONS.dot} ${age}`);
    lines.push(treeItem(i === sessions.length - 1, `${icon} ${slugStr}${titleStr}${meta}${marker}`));
  }

  lines.push("");
  lines.push(hint("Use", "/resume <slug>", "to switch sessions."));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Sub-agent formatting (chalk-based)
// ---------------------------------------------------------------------------

/** Format the start of a delegate sub-agent. */
export function formatDelegateStart(agentType: string, prompt: string): string {
  const label = capitalize(agentType);
  const summary = prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt;
  return `${t.purple(ICONS.tool)} ${t.bold(label)}  ${t.muted(summary)}`;
}

/** Format the start of a parallel task fan-out. */
export function formatParallelStart(taskCount: number): string {
  return `${t.purple(ICONS.tool)} ${t.bold("Parallel")}  ${t.muted(`${taskCount} task${taskCount !== 1 ? "s" : ""}`)}`;
}

/** Format the completion of a delegate tool call. */
export function formatDelegateResult(result: string, durationMs: number): string {
  try {
    const parsed = JSON.parse(result);
    if (!parsed.ok) {
      return `  ${t.error(ICONS.result)}  ${t.error(parsed.error ?? "Sub-agent failed")}`;
    }
    const toolCount = parsed.context?.toolCalls?.length ?? 0;
    const totalTokens = (parsed.tokensIn ?? 0) + (parsed.tokensOut ?? 0);
    const summary = t.muted(
      `Done (${pluralize(toolCount, "tool call")} ${ICONS.dot} ${formatTokens(totalTokens)} tokens ${ICONS.dot} ${formatDuration(durationMs)})`,
    );
    return `  ${t.dim(ICONS.result)}  ${summary}`;
  } catch {
    return `  ${t.dim(ICONS.result)}  ${t.muted("Done")}`;
  }
}

/** Format the completion of a parallel_tasks tool call. */
export function formatParallelResult(result: string): string {
  try {
    const parsed = JSON.parse(result);
    if (!parsed.ok) {
      return `  ${t.error(ICONS.result)}  ${t.error(parsed.error ?? "Parallel execution failed")}`;
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
      return `  ${t.dim(ICONS.result)}  ${t.muted("Done (no results)")}`;
    }

    const lines: string[] = [];
    for (const r of results) {
      const icon = r.status === "success" ? t.green(ICONS.success) : t.error(ICONS.error);
      const label = capitalize(r.agentType);
      const toolCount = r.context?.toolCalls?.length ?? 0;
      const totalTokens = (r.tokensIn ?? 0) + (r.tokensOut ?? 0);
      lines.push(
        `  ${t.dim(ICONS.result)}  ${icon} ${t.blue(label)}  ${t.muted(
          `${pluralize(toolCount, "tool call")} ${ICONS.dot} ${formatTokens(totalTokens)} tokens ${ICONS.dot} ${formatDuration(r.durationMs)}`,
        )}`,
      );
    }
    return lines.join("\n");
  } catch {
    return `  ${t.dim(ICONS.result)}  ${t.muted("Done")}`;
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
    const marker = isSelected ? t.brand(`  ${ICONS.arrow} `) : "    ";
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
 * Map a connection status string to a semantic dot state.
 */
function connectionState(status: string): "active" | "inactive" | "error" {
  if (status === "connected") return "active";
  if (status === "failed" || status === "error") return "error";
  return "inactive";
}

/**
 * Map a connection status string to a color function.
 */
function connectionColor(status: string): (s: string) => string {
  if (status === "connected") return t.green;
  if (status === "failed" || status === "error") return t.error;
  return t.dim;
}

/**
 * Format a list of channels with their connection status.
 * Uses status dots for at-a-glance readability.
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

  const lines: string[] = [
    "",
    sectionHeader("Channels"),
  ];

  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i]!;
    const icon = statusDot(connectionState(ch.status));
    const colorFn = connectionColor(ch.status);
    const statusStr = colorFn(ch.status);
    const errorStr = ch.error ? t.error(` — ${ch.error}`) : "";
    const sinceStr = ch.status === "connected" && ch.connected_at
      ? t.dim(` (since ${new Date(ch.connected_at).toLocaleTimeString()})`)
      : "";
    lines.push(treeItem(i === channels.length - 1, `${icon} ${t.blue(ch.name.padEnd(14))} ${statusStr}${errorStr}${sinceStr}`));
  }

  lines.push("");
  lines.push(hint("Use", "/channel connect <name>", `or ${t.muted("/channel disconnect <name>")}`));
  return lines.join("\n");
}

/**
 * Channel help text — shows usage and available channels.
 */
export function formatChannelHelp(): string {
  const lines = [
    "",
    sectionHeader("Channel Management"),
    "",
    treeItem(false, `${t.blue("/channel connect <name>")}     ${t.muted("Connect a channel")}`),
    treeItem(false, `${t.blue("/channel disconnect <name>")}  ${t.muted("Disconnect a channel")}`),
    treeItem(false, `${t.blue("/channel add <name>")}         ${t.muted("Add and connect a new channel")}`),
    treeItem(false, `${t.blue("/channel remove <name>")}      ${t.muted("Remove a channel")}`),
    treeItem(true,  `${t.blue("/channels")}                   ${t.muted("List all channels")}`),
    "",
    `  ${t.muted("Available channels:")}`,
    treeItem(false, `${t.text("telegram")}     ${t.muted("Bot token from @BotFather")}`),
    treeItem(true,  `${t.text("whatsapp")}     ${t.muted("QR code scan (multi-device)")}`),
    "",
  ];
  return lines.join("\n");
}

/**
 * Channel setup hint — tells the user what config/env var is needed.
 */
export function formatChannelSetupHint(channel: string): string {
  const hints: Record<string, string> = {
    telegram: [
      `  ${t.dim("To set up Telegram:")}`,
      `  1. Create a bot with ${t.blue("@BotFather")} on Telegram`,
      `  2. Copy the bot token`,
      `  3. Set it: ${t.blue("export JERIKO_TELEGRAM_TOKEN=<your-token>")}`,
      `  4. Restart the daemon: ${t.blue("jeriko server restart")}`,
      `  5. Then: ${t.blue("/channel connect telegram")}`,
    ].join("\n"),
    whatsapp: [
      `  ${t.dim("To set up WhatsApp:")}`,
      `  1. Set: ${t.blue("export WHATSAPP_ENABLED=true")}`,
      `  2. Restart the daemon: ${t.blue("jeriko server restart")}`,
      `  3. Connect: ${t.blue("/channel connect whatsapp")}`,
      `  4. Scan the QR code that appears in the daemon logs`,
      `     ${t.dim("Check logs:")} ${t.blue("jeriko server logs")}`,
    ].join("\n"),
  };

  return hints[channel] ?? t.dim(`  Check your config for "${channel}" settings.`);
}

// ---------------------------------------------------------------------------
// Model list
// ---------------------------------------------------------------------------

/** Capability flag icons for model display. */
const MODEL_CAPS = {
  reasoning: "⚡",
  tools:     "🔧",
} as const;

/**
 * Format a list of available models with context window, costs, and capability icons.
 *
 * Icons:
 *   ⚡ = reasoning/thinking mode
 *   🔧 = tool/function calling
 *
 * Example output:
 *   ● claude-sonnet-4-6   200k ctx   $3/$15    ⚡🔧
 *     gpt-4o              128k ctx   $2.5/$10  🔧
 *     ollama:llama3.2     128k ctx   free      🔧
 */
export function formatModelList(
  models: ReadonlyArray<ModelInfo>,
  currentModel: string,
  providers?: ReadonlyArray<ProviderInfo>,
): string {
  const lines: string[] = [
    "",
    sectionHeader("Models", 62),
  ];

  // ── Active providers with their models ───────────────────────────────
  // Group models by provider
  const byProvider = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const group = byProvider.get(m.provider) ?? [];
    group.push(m);
    byProvider.set(m.provider, group);
  }

  // Limit models per provider to keep it readable
  const MAX_MODELS_PER_PROVIDER = 5;

  if (byProvider.size > 0) {
    for (const [provider, providerModels] of byProvider) {
      // Sort: current model first, then by capabilities (tools + reasoning), then by context
      const sorted = [...providerModels].sort((a, b) => {
        const aCurrent = a.id === currentModel || a.name === currentModel ? 1 : 0;
        const bCurrent = b.id === currentModel || b.name === currentModel ? 1 : 0;
        if (aCurrent !== bCurrent) return bCurrent - aCurrent;
        const aScore = (a.supportsTools ? 2 : 0) + (a.supportsReasoning ? 2 : 0) + (a.contextWindow ?? 0) / 100000;
        const bScore = (b.supportsTools ? 2 : 0) + (b.supportsReasoning ? 2 : 0) + (b.contextWindow ?? 0) / 100000;
        return bScore - aScore;
      });

      const displayed = sorted.slice(0, MAX_MODELS_PER_PROVIDER);
      const remaining = sorted.length - displayed.length;

      lines.push(subSection(provider));

      for (const m of displayed) {
        const isCurrent = m.id === currentModel || m.name === currentModel;
        const marker = isCurrent ? t.brand(ICONS.active) : " ";

        // Show as provider:model for custom providers, just model for built-in
        const isBuiltIn = ["anthropic", "openai", "local"].includes(provider);
        const displayName = isBuiltIn ? m.id : `${provider}:${m.id}`;
        const truncated = displayName.length > 30 ? displayName.slice(0, 27) + "…" : displayName;
        const idStr = isCurrent ? t.brandBold(truncated.padEnd(30)) : t.blue(truncated.padEnd(30));

        // Context window
        const ctxStr = m.contextWindow
          ? t.muted(`${formatTokens(m.contextWindow)} ctx`.padEnd(10))
          : t.dim("—".padEnd(10));

        // Cost
        let costStr: string;
        if (m.costInput && m.costOutput) {
          costStr = t.muted(`$${m.costInput}/$${m.costOutput}`.padEnd(12));
        } else if (m.costInput === 0 && m.costOutput === 0) {
          costStr = t.green("free".padEnd(12));
        } else {
          costStr = t.dim("—".padEnd(12));
        }

        // Capability icons
        const caps: string[] = [];
        if (m.supportsReasoning) caps.push(MODEL_CAPS.reasoning);
        if (m.supportsTools) caps.push(MODEL_CAPS.tools);
        const capsStr = caps.length > 0 ? caps.join("") : "";

        lines.push(`  ${marker} ${idStr} ${ctxStr} ${costStr} ${capsStr}`);
      }

      if (remaining > 0) {
        lines.push(t.dim(`      +${remaining} more`));
      }
    }
  } else {
    lines.push(t.muted("  No models loaded yet."));
  }

  // ── Available providers (not configured) ─────────────────────────────
  if (providers && providers.length > 0) {
    const available = providers.filter((p) => p.type === "available");
    if (available.length > 0) {
      lines.push("");
      lines.push(subSection("Add a provider"));
      // Show top providers in a compact grid
      const top = available.slice(0, 8);
      for (const p of top) {
        const envHint = p.envKey ? t.dim(p.envKey) : "";
        lines.push(`    ${t.dim(p.id.padEnd(16))} ${t.dim(p.name.padEnd(20))} ${envHint}`);
      }
      if (available.length > top.length) {
        lines.push(t.dim(`      +${available.length - top.length} more (use /models to see all)`));
      }
    }
  }

  lines.push("");
  lines.push(`  ${t.dim(`${MODEL_CAPS.reasoning} reasoning ${ICONS.dot} ${MODEL_CAPS.tools} tools`)}`);
  lines.push(`  ${hint("Switch:", "/model <name>", "")} ${t.dim(ICONS.dot)} ${hint("Add provider:", "/model add", "")}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Connector list
// ---------------------------------------------------------------------------

/**
 * Format a list of connectors with status dots and type labels.
 */
export function formatConnectorList(connectors: ReadonlyArray<ConnectorInfo>): string {
  if (connectors.length === 0) return t.muted("  No connectors configured.");

  const lines: string[] = [
    "",
    sectionHeader("Connectors"),
  ];

  for (let i = 0; i < connectors.length; i++) {
    const c = connectors[i]!;
    const icon = statusDot(connectionState(c.status));
    const colorFn = connectionColor(c.status);
    const statusStr = colorFn(c.status);
    const errorStr = c.error ? t.error(` — ${c.error}`) : "";
    lines.push(treeItem(i === connectors.length - 1, `${icon} ${t.blue(c.name.padEnd(14))} ${t.muted(c.type.padEnd(8))} ${statusStr}${errorStr}`));
  }

  lines.push("");
  lines.push(hint("Use", "/connect <name>", `or ${t.muted("/disconnect <name>")}`));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Trigger list
// ---------------------------------------------------------------------------

/**
 * Format a list of triggers with type, status, and run stats.
 */
export function formatTriggerList(triggers: ReadonlyArray<TriggerInfo>): string {
  if (triggers.length === 0) return t.muted("  No triggers configured.");

  const lines: string[] = [
    "",
    sectionHeader("Triggers"),
  ];

  for (let i = 0; i < triggers.length; i++) {
    const tr = triggers[i]!;
    const icon = statusDot(tr.enabled ? "active" : "inactive");
    const statusStr = tr.enabled ? t.green("enabled") : t.dim("disabled");
    const runStr = t.muted(`${tr.runCount} runs`);
    const lastRun = tr.lastRunAt ? t.dim(` ${ICONS.dot} last ${formatAge(tr.lastRunAt)}`) : "";
    const errorStr = tr.error ? t.error(` — ${tr.error}`) : "";
    lines.push(treeItem(i === triggers.length - 1, `${icon} ${t.blue(tr.name.padEnd(18))} ${t.muted(tr.type.padEnd(8))} ${statusStr}  ${runStr}${lastRun}${errorStr}`));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Skill list / detail
// ---------------------------------------------------------------------------

/**
 * Format a list of installed skills with invocable markers.
 */
export function formatSkillList(skills: ReadonlyArray<SkillInfo>): string {
  if (skills.length === 0) return t.muted("  No skills installed.");

  const lines: string[] = [
    "",
    sectionHeader("Skills"),
  ];

  for (let i = 0; i < skills.length; i++) {
    const s = skills[i]!;
    const invocable = s.userInvocable ? t.cyan(` ${MODEL_CAPS.reasoning}`) : "";
    lines.push(treeItem(i === skills.length - 1, `${t.blue(s.name.padEnd(18))} ${t.muted(s.description)}${invocable}`));
  }

  lines.push("");
  lines.push(`  ${hint("Use", "/skill <name>", "for details.")} ${t.cyan(MODEL_CAPS.reasoning)} ${t.dim("= user-invocable")}`);
  return lines.join("\n");
}

/**
 * Format skill details with description and body.
 */
export function formatSkillDetail(name: string, description: string, body: string): string {
  const lines: string[] = [
    "",
    sectionHeader(capitalize(name)),
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
 * Format daemon status information with status dot.
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
    sectionHeader("Daemon Status"),
  ];

  const phaseState = status.phase === "running" ? "active" as const : "warning" as const;
  const phaseColor = status.phase === "running" ? t.green : t.yellow;
  lines.push(kvPair("Phase", `${statusDot(phaseState)} ${phaseColor(status.phase)}`));
  lines.push(kvPair("Uptime", t.text(formatDuration(status.uptime))));
  if (status.memoryMb !== undefined) {
    lines.push(kvPair("Memory", t.text(`${status.memoryMb.toFixed(1)} MB`)));
  }
  if (status.sessionCount !== undefined) {
    lines.push(kvPair("Sessions", t.text(String(status.sessionCount))));
  }
  if (status.activeChannels !== undefined) {
    lines.push(kvPair("Channels", t.text(String(status.activeChannels))));
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
    sectionHeader("System Info"),
    kvPair("Platform", t.text(`${os.platform()} ${os.arch()}`)),
    kvPair("OS", t.text(os.release())),
    kvPair("CPUs", t.text(`${os.cpus().length} cores`)),
    kvPair("Memory", t.text(`${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB total`)),
    kvPair("Free", t.text(`${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)} GB free`)),
    kvPair("Hostname", t.text(os.hostname())),
    kvPair("User", t.text(os.userInfo().username)),
    kvPair("Shell", t.text(process.env.SHELL ?? "unknown")),
    kvPair("cwd", t.text(shortenHome(process.cwd()))),
  ];

  return lines.join("\n");
}

/**
 * Format configuration tree (sanitized — no secrets).
 */
export function formatConfig(config: Record<string, unknown>): string {
  const lines: string[] = [
    "",
    sectionHeader("Configuration"),
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
    sectionHeader("History"),
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
 * Format connector health check results with latency indicators.
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
    sectionHeader("Health Check"),
  ];

  for (const r of results) {
    const icon = r.healthy ? t.green(ICONS.success) : t.error(ICONS.error);
    const latencyColor = r.latencyMs < 200 ? t.green : r.latencyMs < 500 ? t.yellow : t.orange;
    const latency = latencyColor(`${r.latencyMs}ms`);
    const errorStr = r.error ? t.error(` — ${r.error}`) : "";
    lines.push(`  ${icon} ${t.blue(r.name.padEnd(16))} ${latency}${errorStr}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Provider list
// ---------------------------------------------------------------------------

/**
 * Format a list of providers grouped by type with status indicators.
 */
export function formatProviderList(
  providers: ReadonlyArray<ProviderInfo>,
  activeModel?: string,
): string {
  if (providers.length === 0) return t.muted("  No providers configured.");

  const lines: string[] = [
    "",
    sectionHeader("Providers", 56),
  ];

  // Group by type
  const builtIn = providers.filter((p) => p.type === "built-in");
  const custom = providers.filter((p) => p.type === "custom");
  const discovered = providers.filter((p) => p.type === "discovered");
  const available = providers.filter((p) => p.type === "available");

  // Active providers (built-in + custom + discovered)
  if (builtIn.length > 0) {
    lines.push(subSection("Built-in"));
    for (const p of builtIn) {
      const isActive = activeModel?.startsWith(p.id) ?? false;
      const marker = isActive ? t.brand(ICONS.active) : " ";
      lines.push(`  ${marker} ${t.blue(p.id.padEnd(16))} ${t.muted(p.name)}`);
    }
  }

  if (custom.length > 0) {
    lines.push(subSection("Custom"));
    for (const p of custom) {
      const isActive = activeModel?.startsWith(p.id) ?? false;
      const marker = isActive ? t.brand(ICONS.active) : " ";
      const modelStr = p.defaultModel ? t.muted(` (${p.defaultModel})`) : "";
      lines.push(`  ${marker} ${t.blue(p.id.padEnd(16))} ${t.muted(p.name)}${modelStr}`);
    }
  }

  if (discovered.length > 0) {
    lines.push(subSection("Auto-discovered"));
    for (const p of discovered) {
      const isActive = activeModel?.startsWith(p.id) ?? false;
      const marker = isActive ? t.brand(ICONS.active) : " ";
      const modelStr = p.defaultModel ? t.muted(` (${p.defaultModel})`) : "";
      lines.push(`  ${marker} ${t.green(p.id.padEnd(16))} ${t.muted(p.name)}${modelStr}`);
    }
  }

  if (available.length > 0) {
    lines.push(subSection("Available (set env var to enable)"));
    for (const p of available) {
      const envStr = p.envKey ? t.dim(p.envKey) : "";
      lines.push(`    ${t.dim(p.id.padEnd(16))} ${t.dim(p.name.padEnd(20))} ${envStr}`);
    }
  }

  lines.push("");
  lines.push(hint("Set the env var to auto-enable, or use", "/model add <id>", ""));
  return lines.join("\n");
}

/**
 * Format a provider-added confirmation.
 */
export function formatProviderAdded(id: string, name: string): string {
  return `${t.green(ICONS.success)} Provider ${t.blue(name)} (${id}) added`;
}

/**
 * Format a provider-removed confirmation.
 */
export function formatProviderRemoved(id: string): string {
  return `${t.green(ICONS.success)} Provider ${t.blue(id)} removed`;
}

// ---------------------------------------------------------------------------
// Billing plan
// ---------------------------------------------------------------------------

/**
 * Format billing plan info with usage progress bars and tier badge.
 */
export function formatPlan(plan: PlanInfo): string {
  const lines: string[] = [
    "",
    sectionHeader("Billing Plan"),
  ];

  // Tier badge + status
  const tierBadge = plan.tier === "free" ? badge(plan.label, "muted") : badge(plan.label, "brand");
  const statusColor = plan.status === "active" ? t.green : plan.status === "past_due" ? t.yellow : t.dim;
  lines.push(kvPair("Tier", `${tierBadge} ${statusColor(`(${plan.status})`)}`));

  if (plan.email) {
    lines.push(kvPair("Email", t.text(plan.email)));
  }

  // Connector usage
  const connLimit = plan.connectors.limit === "unlimited" ? "∞" : String(plan.connectors.limit);
  const connPct = typeof plan.connectors.limit === "number" && plan.connectors.limit > 0
    ? Math.round((plan.connectors.used / plan.connectors.limit) * 100)
    : 0;
  const connBar = typeof plan.connectors.limit === "number"
    ? ` ${formatProgressBar(connPct)}`
    : "";
  lines.push(kvPair("Connectors", `${t.text(`${plan.connectors.used}/${connLimit}`)}${connBar}`));

  // Trigger usage
  const trigLimit = plan.triggers.limit === "unlimited" ? "∞" : String(plan.triggers.limit);
  const trigPct = typeof plan.triggers.limit === "number" && plan.triggers.limit > 0
    ? Math.round((plan.triggers.used / plan.triggers.limit) * 100)
    : 0;
  const trigBar = typeof plan.triggers.limit === "number"
    ? ` ${formatProgressBar(trigPct)}`
    : "";
  lines.push(kvPair("Triggers", `${t.text(`${plan.triggers.used}/${trigLimit}`)}${trigBar}`));

  // Warnings
  if (plan.pastDue) {
    lines.push(`  ${t.yellow(ICONS.warning)} ${t.yellow("Payment past due — update billing to avoid service interruption")}`);
  }
  if (plan.gracePeriod) {
    lines.push(`  ${t.yellow(ICONS.warning)} ${t.yellow("Grace period active — subscription lapsed")}`);
  }

  if (plan.tier === "free") {
    lines.push("");
    lines.push(`  ${t.dim("Upgrade:")} ${t.brand("jeriko upgrade --email you@example.com")}`);
  }

  return lines.join("\n");
}

/**
 * Format a compact progress bar with color thresholds.
 * @example formatProgressBar(75) → "████████░░" (75% filled)
 */
function formatProgressBar(pct: number, width: number = 10): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const color = clamped >= 90 ? t.red : clamped >= 70 ? t.yellow : t.green;
  return color(ICONS.filled.repeat(filled)) + t.dim(ICONS.empty.repeat(empty));
}

// ---------------------------------------------------------------------------
// Session cost breakdown
// ---------------------------------------------------------------------------

/**
 * Format per-session cost breakdown with model-aware pricing.
 */
export function formatSessionCost(stats: SessionStats, model: string): string {
  const totalCost = estimateModelCost(stats.tokensIn, stats.tokensOut, model);
  const fmtCost = formatModelCost;

  const lines: string[] = [
    "",
    sectionHeader("Session Cost"),
    kvPair("Model", t.text(model)),
    kvPair("Tokens In", t.text(formatTokens(stats.tokensIn))),
    kvPair("Tokens Out", t.text(formatTokens(stats.tokensOut))),
    kvPair("Turns", t.text(String(stats.turns))),
    kvPair("Duration", t.text(formatDuration(stats.durationMs))),
    kvPair("Total Cost", totalCost > 0 ? t.brand(fmtCost(totalCost)) : t.green("free")),
  ];

  if (stats.turns > 0) {
    const perTurn = totalCost / stats.turns;
    lines.push(kvPair("Per Turn", perTurn > 0 ? t.muted(fmtCost(perTurn)) : t.dim("—")));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Enhanced config display
// ---------------------------------------------------------------------------

/**
 * Format configuration as structured sections with status indicators.
 *
 * Output:
 *   Agent:    claude-sonnet-4 · 4096 tokens · temp 0.3
 *   Channels: telegram ✓ · whatsapp ✗
 *   Providers: 2 custom (openrouter, deepinfra)
 *   Security: 1 allowed path · 3 blocked commands · 5 sensitive keys
 *   Logging:  info · 10MB rotation · 5 files
 */
export function formatConfigStructured(config: Record<string, unknown>): string {
  const lines: string[] = [
    "",
    sectionHeader("Configuration"),
  ];

  // Agent section
  const agent = config.agent as Record<string, unknown> | undefined;
  if (agent) {
    const model = (agent.model as string) ?? "unknown";
    const maxTokens = (agent.maxTokens as number) ?? 4096;
    const temp = (agent.temperature as number) ?? 0.3;
    const thinking = (agent.extendedThinking as boolean) ? ` ${ICONS.dot} thinking` : "";
    lines.push(kvPair("Agent", `${t.text(model)} ${t.muted(`${ICONS.dot} ${maxTokens} tokens ${ICONS.dot} temp ${temp}${thinking}`)}`));
  }

  // Channels section
  const channels = config.channels as Record<string, unknown> | undefined;
  if (channels) {
    const channelStatuses: string[] = [];
    const channelNames = ["telegram", "whatsapp"] as const;
    for (const name of channelNames) {
      const ch = channels[name] as Record<string, unknown> | undefined;
      if (!ch) {
        channelStatuses.push(`${name} ${t.dim(ICONS.error)}`);
        continue;
      }
      let hasConfig = false;
      if (name === "whatsapp") hasConfig = !!(ch.enabled as boolean);
      else if (name === "telegram") hasConfig = !!(ch.token as string);
      channelStatuses.push(hasConfig ? `${name} ${t.green(ICONS.success)}` : `${name} ${t.dim(ICONS.error)}`);
    }
    lines.push(kvPair("Channels", t.muted(channelStatuses.join(` ${ICONS.dot} `))));
  }

  // Providers section
  const providers = config.providers as Array<Record<string, unknown>> | undefined;
  if (providers && providers.length > 0) {
    const ids = providers.map((p) => p.id as string).join(", ");
    lines.push(kvPair("Providers", `${t.text(`${providers.length} custom`)} ${t.muted(`(${ids})`)}`));
  } else {
    lines.push(kvPair("Providers", t.muted("built-in only")));
  }

  // Security section
  const security = config.security as Record<string, unknown> | undefined;
  if (security) {
    const paths = Array.isArray(security.allowedPaths) ? security.allowedPaths.length : 0;
    const cmds = Array.isArray(security.blockedCommands) ? security.blockedCommands.length : 0;
    const keys = Array.isArray(security.sensitiveKeys) ? security.sensitiveKeys.length : 0;
    lines.push(kvPair("Security", t.muted(`${paths} allowed path${paths !== 1 ? "s" : ""} ${ICONS.dot} ${cmds} blocked cmd${cmds !== 1 ? "s" : ""} ${ICONS.dot} ${keys} sensitive key${keys !== 1 ? "s" : ""}`)));
  }

  // Logging section
  const logging = config.logging as Record<string, unknown> | undefined;
  if (logging) {
    const level = (logging.level as string) ?? "info";
    const maxSize = (logging.maxFileSize as number) ?? 0;
    const maxFiles = (logging.maxFiles as number) ?? 0;
    const sizeStr = maxSize >= 1_048_576 ? `${Math.round(maxSize / 1_048_576)}MB` : `${Math.round(maxSize / 1024)}KB`;
    lines.push(kvPair("Logging", t.muted(`${level} ${ICONS.dot} ${sizeStr} rotation ${ICONS.dot} ${maxFiles} files`)));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Session detail
// ---------------------------------------------------------------------------

/**
 * Format current session details for /session command.
 */
export function formatSessionDetail(
  session: SessionInfo,
  currentModel: string,
  stats?: SessionStats,
): string {
  const lines: string[] = [
    "",
    sectionHeader("Current Session"),
    kvPair("ID", t.muted(session.id)),
    kvPair("Slug", t.blue(session.slug)),
    kvPair("Title", t.text(session.title)),
    kvPair("Model", t.cyan(currentModel)),
    kvPair("Tokens", t.text(formatTokens(session.tokenCount))),
    kvPair("Updated", t.muted(formatAge(session.updatedAt))),
  ];

  if (stats && stats.turns > 0) {
    lines.push("");
    lines.push(`  ${t.header("Session Stats")}`);
    lines.push(kvPair("Turns", t.text(String(stats.turns))));
    lines.push(kvPair("Tokens", t.text(`${formatTokens(stats.tokensIn)} in / ${formatTokens(stats.tokensOut)} out`)));
    lines.push(kvPair("Duration", t.text(formatDuration(stats.durationMs))));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Share formatting
// ---------------------------------------------------------------------------

/**
 * Format share creation result for /share command.
 */
export function formatShareCreated(share: ShareInfo): string {
  const lines: string[] = [];
  lines.push(`${t.green(ICONS.success)} ${t.green("Session shared")}`);
  lines.push("");
  lines.push(kvPair("URL", t.blue(share.url)));
  lines.push(kvPair("Messages", t.text(String(share.messageCount))));
  lines.push(kvPair("Model", t.text(share.model)));

  if (share.expiresAt) {
    const expiresIn = share.expiresAt - Date.now();
    const days = Math.ceil(expiresIn / (1000 * 60 * 60 * 24));
    lines.push(kvPair("Expires", t.muted(`in ${days} day${days === 1 ? "" : "s"}`)));
  }

  return lines.join("\n");
}

/**
 * Format share list for /share list command.
 */
export function formatShareList(shares: ReadonlyArray<ShareInfo>): string {
  if (shares.length === 0) {
    return t.muted("No active shares for this session.");
  }

  const lines: string[] = [
    "",
    sectionHeader(`Shares (${shares.length})`),
  ];

  for (let i = 0; i < shares.length; i++) {
    const s = shares[i]!;
    const age = formatAge(s.createdAt);
    lines.push(treeItem(i === shares.length - 1, `${t.cyan(s.shareId)}  ${s.messageCount} msgs  ${t.muted(age)}`));
    lines.push(`      ${t.dim(s.url)}`);
  }

  lines.push("");
  lines.push(hint("Revoke:", "/share revoke <id>", ""));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * Format a task category list (triggers, schedules, or crons).
 */
export function formatTaskCategory(title: string, tasks: ReadonlyArray<TaskDef>, description: string): string {
  const lines: string[] = ["", sectionHeader(title)];
  lines.push(`  ${t.dim(description)}`);
  lines.push("");

  if (tasks.length === 0) {
    lines.push(t.muted("  None configured."));
    return lines.join("\n");
  }

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    const status = task.enabled ? statusDot("active") : statusDot("inactive");
    const label = task.enabled ? t.green("enabled") : t.muted("disabled");
    lines.push(treeItem(
      i === tasks.length - 1,
      `${status} ${t.bold(task.name)}  ${t.dim(task.id)}  ${label}  ${t.muted(task.type)}`,
    ));
    if (task.command) lines.push(`      ${t.muted(task.command)}`);
  }

  return lines.join("\n");
}

/**
 * Format the /task hub view with categorized counts and recent tasks.
 */
export function formatTaskHub(
  total: number,
  triggerCount: number,
  scheduleCount: number,
  cronCount: number,
  tasks: ReadonlyArray<TaskDef>,
): string {
  const lines: string[] = ["", sectionHeader(`Tasks (${total})`)];

  lines.push(`  ${t.blue("Triggers")}:  ${triggerCount}  ${t.dim("(webhook, file, http, email)")}`);
  lines.push(`  ${t.blue("Schedules")}: ${scheduleCount}  ${t.dim("(daily, weekly, monthly, custom)")}`);
  lines.push(`  ${t.blue("Cron")}:      ${cronCount}  ${t.dim("(cron expressions, one-time)")}`);

  if (tasks.length > 0) {
    lines.push("");
    const recent = tasks.slice(0, 8);
    for (let i = 0; i < recent.length; i++) {
      const task = recent[i]!;
      const status = task.enabled ? statusDot("active") : statusDot("inactive");
      const label = task.enabled ? t.green("on") : t.muted("off");
      lines.push(treeItem(
        i === recent.length - 1,
        `${status} ${t.bold(task.name)}  ${t.dim(task.type)}  ${label}`,
      ));
    }
    if (tasks.length > 8) lines.push(t.dim(`  ... and ${tasks.length - 8} more`));
  }

  lines.push("");
  lines.push(hint("Drill down:", "/task trigger /task schedule /task cron", ""));
  return lines.join("\n");
}

/** @deprecated Use formatTaskHub or formatTaskCategory instead. */
export function formatTaskList(tasks: ReadonlyArray<TaskDef>): string {
  return formatTaskHub(tasks.length, 0, 0, 0, tasks);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Format notification preferences for the /notifications command.
 */
export function formatNotificationList(prefs: ReadonlyArray<NotificationPref>): string {
  if (prefs.length === 0) {
    return t.muted("No notification preferences set. All chats receive notifications by default.");
  }

  const lines: string[] = [
    "",
    sectionHeader(`Notifications (${prefs.length})`),
  ];

  for (let i = 0; i < prefs.length; i++) {
    const pref = prefs[i]!;
    const status = pref.enabled ? t.green("ON") : t.muted("OFF");
    lines.push(treeItem(
      i === prefs.length - 1,
      `${pref.channel}:${pref.chatId}  ${status}`,
    ));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Format connector auth status for the /auth command.
 */
export function formatAuthStatus(connectors: ReadonlyArray<AuthStatus>): string {
  if (connectors.length === 0) {
    return t.muted("No connectors available.");
  }

  const lines: string[] = [
    "",
    sectionHeader("Connector Authentication"),
  ];

  for (let i = 0; i < connectors.length; i++) {
    const c = connectors[i]!;
    const status = c.configured ? statusDot("active") : statusDot("inactive");
    const label = c.configured ? t.green("configured") : t.yellow("not configured");
    lines.push(treeItem(
      i === connectors.length - 1,
      `${status} ${t.bold(c.label)}  ${label}`,
    ));
    lines.push(`      ${t.muted(c.description)}`);

    for (const req of c.required) {
      const dot = req.set ? t.green("\u25CF") : t.muted("\u25CB");
      lines.push(`      ${dot} ${req.label}`);
    }
  }

  lines.push("");
  lines.push(hint("Set keys:", "/auth <connector> <key1> [key2...]", ""));
  return lines.join("\n");
}

/**
 * Format auth connector detail for a single connector.
 */
export function formatAuthDetail(c: AuthStatus): string {
  const lines: string[] = [
    "",
    `${t.bold(c.label)} \u2014 ${c.description}`,
    `Status: ${c.configured ? t.green("configured \u25CF") : t.yellow("not configured \u25CB")}`,
    "",
    "Required:",
  ];

  for (const req of c.required) {
    const dot = req.set ? t.green("\u25CF") : t.muted("\u25CB");
    lines.push(`  ${dot} ${req.label}`);
  }

  if (c.optional.length > 0) {
    lines.push("Optional:");
    for (const opt of c.optional) {
      const dot = opt.set ? t.green("\u25CF") : t.muted("\u25CB");
      lines.push(`  ${dot} ${opt.variable}`);
    }
  }

  lines.push("");
  if (c.required.length === 1) {
    lines.push(hint("Set:", `/auth ${c.name} <key>`, ""));
  } else {
    const varNames = c.required.map((r) => `<${r.variable}>`).join(" ");
    lines.push(hint("Set:", `/auth ${c.name} ${varNames}`, ""));
  }

  return lines.join("\n");
}
