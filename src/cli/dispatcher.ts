/**
 * Command dispatcher — resolves `jeriko <cmd>` to the correct handler.
 *
 * Resolution order:
 *   1. Built-in commands (always win)
 *   2. Plugin commands (via plugin registry)
 *
 * Global flags (parsed before command):
 *   --format json|text|logfmt
 *   --quiet
 *   --version
 *   --help
 */

import type { OutputFormat } from "../shared/types.js";
import { parseArgs, flagStr, flagBool } from "../shared/args.js";
import { fail, setOutputFormat } from "../shared/output.js";
import { capture } from "../shared/telemetry.js";
import { VERSION } from "../shared/version.js";
import { renderDiagnosticsLine } from "../shared/diagnostics.js";

/** Flags consumed by the dispatcher — stripped before passing to commands.
 *  Note: --help is NOT stripped — commands handle their own --help for per-command docs.
 *  Value flags expect a following argument (e.g., --format json).
 *  Boolean flags are standalone (e.g., --quiet, --version). */
const GLOBAL_VALUE_FLAGS = new Set(["format"]);
const GLOBAL_BOOL_FLAGS = new Set(["quiet", "version"]);
const GLOBAL_FLAGS = new Set([...GLOBAL_VALUE_FLAGS, ...GLOBAL_BOOL_FLAGS]);

// ---------------------------------------------------------------------------
// Command handler interface
// ---------------------------------------------------------------------------

export interface CommandHandler {
  /** Machine-readable command name (e.g. "sys", "exec", "stripe") */
  name: string;
  /** One-line description shown in help output */
  description: string;
  /** Category for grouping in discover/help (set during registration) */
  category?: string;
  /** Execute the command with its own sub-arguments */
  run(args: string[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Command registry — all built-in commands registered at import time
// ---------------------------------------------------------------------------

const registry = new Map<string, CommandHandler>();

function register(handler: CommandHandler, category?: string): void {
  if (category) handler.category = category;
  registry.set(handler.name, handler);
}

function registerAll(handlers: CommandHandler[], category: string): void {
  for (const h of handlers) register(h, category);
}

/**
 * Return all registered commands. Loads them first if needed.
 * Used by `discover` to enumerate commands without filesystem scanning.
 */
export async function getCommands(): Promise<ReadonlyMap<string, CommandHandler>> {
  if (registry.size === 0) await loadBuiltinCommands();
  return registry;
}

/** Lazily load and register all built-in commands. */
async function loadBuiltinCommands(): Promise<void> {
  // System
  const { command: sys } = await import("./commands/system/sys.js");
  const { command: exec } = await import("./commands/system/exec.js");
  const { command: proc } = await import("./commands/system/proc.js");
  const { command: net } = await import("./commands/system/net.js");

  // Files
  const { command: fs } = await import("./commands/files/fs.js");
  const { command: doc } = await import("./commands/files/doc.js");

  // Browser
  const { command: browse } = await import("./commands/browser/browse.js");
  const { command: search } = await import("./commands/browser/search.js");
  const { command: screenshot } = await import("./commands/browser/screenshot.js");

  // Comms
  const { command: email } = await import("./commands/comms/email.js");
  const { command: msg } = await import("./commands/comms/msg.js");
  const { command: notify } = await import("./commands/comms/notify.js");
  const { command: audio } = await import("./commands/comms/audio.js");

  // OS
  const { command: notes } = await import("./commands/os/notes.js");
  const { command: remind } = await import("./commands/os/remind.js");
  const { command: calendar } = await import("./commands/os/calendar.js");
  const { command: contacts } = await import("./commands/os/contacts.js");
  const { command: music } = await import("./commands/os/music.js");
  const { command: clipboard } = await import("./commands/os/clipboard.js");
  const { command: window } = await import("./commands/os/window.js");
  const { command: camera } = await import("./commands/os/camera.js");
  const { command: open } = await import("./commands/os/open.js");
  const { command: location } = await import("./commands/os/location.js");

  // Integrations
  const { command: stripe } = await import("./commands/integrations/stripe.js");
  const { command: github } = await import("./commands/integrations/github.js");
  const { command: paypal } = await import("./commands/integrations/paypal.js");
  const { command: vercel } = await import("./commands/integrations/vercel.js");
  const { command: twilio } = await import("./commands/integrations/twilio.js");
  const { command: x } = await import("./commands/integrations/x.js");
  const { command: gdrive } = await import("./commands/integrations/gdrive.js");
  const { command: gmail } = await import("./commands/integrations/gmail.js");
  const { command: hubspot } = await import("./commands/integrations/hubspot.js");
  const { command: shopify } = await import("./commands/integrations/shopify.js");
  const { command: slack } = await import("./commands/integrations/slack.js");
  const { command: discord } = await import("./commands/integrations/discord.js");
  const { command: sendgrid } = await import("./commands/integrations/sendgrid.js");
  const { command: square } = await import("./commands/integrations/square.js");
  const { command: gitlab } = await import("./commands/integrations/gitlab.js");
  const { command: cloudflare } = await import("./commands/integrations/cloudflare.js");
  const { command: notion } = await import("./commands/integrations/notion.js");
  const { command: linear } = await import("./commands/integrations/linear.js");
  const { command: jira } = await import("./commands/integrations/jira.js");
  const { command: airtable } = await import("./commands/integrations/airtable.js");
  const { command: asana } = await import("./commands/integrations/asana.js");
  const { command: mailchimp } = await import("./commands/integrations/mailchimp.js");
  const { command: dropbox } = await import("./commands/integrations/dropbox.js");
  const { command: connectors } = await import("./commands/integrations/connectors.js");

  // Dev
  const { command: code } = await import("./commands/dev/code.js");
  const { command: create } = await import("./commands/dev/create.js");
  const { command: dev } = await import("./commands/dev/dev.js");
  const { command: parallel } = await import("./commands/dev/parallel.js");

  // Agent
  const { command: ask } = await import("./commands/agent/ask.js");
  const { command: memory } = await import("./commands/agent/memory.js");
  const { command: discover } = await import("./commands/agent/discover.js");
  const { command: prompt } = await import("./commands/agent/prompt.js");
  const { command: skill } = await import("./commands/agent/skill.js");
  const { command: share } = await import("./commands/agent/share.js");
  const { command: provider } = await import("./commands/agent/provider.js");

  // Automation
  const { command: init } = await import("./commands/automation/init.js");
  const { command: onboard } = await import("./commands/automation/onboard.js");
  const { command: server } = await import("./commands/automation/server.js");
  const { command: task } = await import("./commands/automation/task.js");
  const { command: setup } = await import("./commands/automation/setup.js");
  const { command: update } = await import("./commands/automation/update.js");

  // Plugin
  const { command: install } = await import("./commands/plugin/install.js");
  const { command: trust } = await import("./commands/plugin/trust.js");
  const { command: uninstall } = await import("./commands/plugin/uninstall.js");

  // Billing
  const { planCommand, upgradeCommand, billingCommand } = await import("./commands/billing.js");

  registerAll([sys, exec, proc, net], "system");
  registerAll([fs, doc], "files");
  registerAll([browse, search, screenshot], "browser");
  registerAll([email, msg, notify, audio], "comms");
  registerAll([notes, remind, calendar, contacts, music, clipboard, window, camera, open, location], "os");
  registerAll([
    stripe, github, paypal, vercel, twilio, x, gdrive, gmail, hubspot, shopify,
    slack, discord, sendgrid, square, gitlab, cloudflare,
    notion, linear, jira, airtable, asana, mailchimp, dropbox,
    connectors,
  ], "integrations");
  registerAll([code, create, dev, parallel], "dev");
  registerAll([ask, memory, discover, prompt, skill, share, provider], "agent");
  registerAll([init, onboard, server, task, setup, update], "automation");
  registerAll([install, trust, uninstall], "plugin");
  registerAll([planCommand, upgradeCommand, billingCommand], "billing");
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------


function printVersion(): void {
  console.log(renderDiagnosticsLine());
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`jeriko ${VERSION} — Unix-first CLI toolkit for AI agents\n`);
  console.log("Usage: jeriko [global-flags] <command> [args...]\n");
  console.log("Global flags:");
  console.log("  --format json|text|logfmt   Output format (default: json)");
  console.log("  --quiet                     Suppress non-essential output");
  console.log("  --version                   Print version and exit");
  console.log("  --help                      Print this help and exit\n");
  console.log("Commands:");

  const sorted = [...registry.values()].sort((a, b) => a.name.localeCompare(b.name));
  const maxLen = Math.max(...sorted.map((c) => c.name.length));

  for (const cmd of sorted) {
    const padding = " ".repeat(maxLen - cmd.name.length + 2);
    console.log(`  ${cmd.name}${padding}${cmd.description}`);
  }

  console.log("\nRun 'jeriko <command> --help' for command-specific help.");
  console.log("Run 'jeriko' with no arguments to start interactive chat.");
}

/**
 * Remove global flags (--format, --quiet) from a command's argument list
 * so they don't interfere with command-specific flag parsing.
 */
function stripGlobalFlags(args: string[]): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    // --flag=value form
    if (arg.startsWith("--") && arg.includes("=")) {
      const key = arg.slice(2, arg.indexOf("="));
      if (GLOBAL_FLAGS.has(key)) {
        i++;
        continue;
      }
    }

    // --flag value form
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (GLOBAL_BOOL_FLAGS.has(key)) {
        i++;
        continue;
      }
      if (GLOBAL_VALUE_FLAGS.has(key)) {
        // Skip the following value argument too
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          i += 2;
        } else {
          i++;
        }
        continue;
      }
    }

    result.push(arg);
    i++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Fuzzy matching — suggest similar commands on typo
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }

  return dp[m]![n]!;
}

function suggestSimilar(input: string): string[] {
  const suggestions: Array<{ name: string; dist: number }> = [];
  for (const name of registry.keys()) {
    const dist = levenshtein(input.toLowerCase(), name.toLowerCase());
    if (dist <= 2) {
      suggestions.push({ name, dist });
    }
  }
  return suggestions.sort((a, b) => a.dist - b.dist).map((s) => s.name);
}

// ---------------------------------------------------------------------------
// Dispatcher — main entry
// ---------------------------------------------------------------------------

/** Global output format, set by --format flag. Read by output helpers. */
export let outputFormat: OutputFormat = "json";

/** Whether --quiet was passed globally. */
export let quiet = false;

export async function dispatcher(argv: string[]): Promise<void> {
  // Parse global flags early — before loading commands
  const parsed = parseArgs(argv);
  const formatFlag = flagStr(parsed, "format", "json");
  if (formatFlag === "json" || formatFlag === "text" || formatFlag === "logfmt") {
    outputFormat = formatFlag;
    setOutputFormat(formatFlag);
  }
  quiet = flagBool(parsed, "quiet");

  // --version — fast path, no command loading needed
  if (flagBool(parsed, "version")) {
    printVersion();
    process.exit(0);
  }

  // Load all built-in commands (deferred until actually needed)
  await loadBuiltinCommands();

  // --help with no command
  if (flagBool(parsed, "help") && parsed.positional.length === 0) {
    printHelp();
    process.exit(0);
  }

  // No command → interactive chat REPL
  if (parsed.positional.length === 0) {
    const { startChat } = await import("./chat.js");
    await startChat();
    return;
  }

  // Resolve command (length > 0 guaranteed by the early-return above).
  //
  // We use `positionalIndices[0]` rather than `argv.indexOf(cmdName)` so
  // that a flag value identical to a command name (e.g. `--format new`
  // where "new" is also a command) doesn't misdirect the slice. The
  // parser already knows the authoritative index of every positional;
  // trust it instead of re-scanning.
  const cmdName = parsed.positional[0]!;
  const cmdArgStart = parsed.positionalIndices[0]! + 1;
  const cmdArgs = stripGlobalFlags(argv.slice(cmdArgStart));

  // --help with a command → pass --help through to the command
  const handler = registry.get(cmdName);

  if (!handler) {
    const similar = suggestSimilar(cmdName);
    let message = `Unknown command: "${cmdName}"`;
    if (similar.length > 0) {
      message += `\n\nDid you mean?\n${similar.map((s) => `  jeriko ${s}`).join("\n")}`;
    }
    fail(message);
  }

  capture("command_run", { command: cmdName });

  try {
    await handler.run(cmdArgs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Command "${cmdName}" failed: ${message}`);
  }
}
