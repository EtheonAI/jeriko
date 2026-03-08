/**
 * Tests for CLI formatters — pure functions that return styled strings.
 *
 * Each formatter is tested for correct structure and content.
 * ANSI codes are expected (chalk is active) so we test for content presence
 * rather than exact string matches.
 */

import { describe, test, expect } from "bun:test";
import {
  formatTokens,
  estimateCost,
  formatCost,
  formatDuration,
  formatAge,
  formatToolCall,
  formatToolResult,
  formatThinkingDone,
  formatCompaction,
  formatTurnComplete,
  formatCancelled,
  formatError,
  formatSessionList,
  formatHelp,
  formatDelegateStart,
  formatDelegateResult,
  formatParallelStart,
  formatParallelResult,
  formatChannelList,
  formatModelList,
  formatConnectorList,
  formatTriggerList,
  formatSkillList,
  formatSkillDetail,
  formatStatus,
  formatSysInfo,
  formatConfig,
  formatHistory,
  formatHealth,
  formatWelcome,
  formatNewSession,
  formatSessionResume,
  formatSetupProviders,
  SLASH_COMMANDS,
  stripAnsi,
  capitalize,
  pluralize,
  shortenHome,
  extractToolSummary,
  truncateResult,
  safeParseJson,
  formatSessionDetail,
  formatShareCreated,
  formatShareList,
  formatTaskList,
  formatNotificationList,
  formatAuthStatus,
  formatAuthDetail,
} from "../../../src/cli/format.js";

// ---------------------------------------------------------------------------
// formatTokens
// ---------------------------------------------------------------------------

describe("formatTokens", () => {
  test("0 → '0'", () => expect(formatTokens(0)).toBe("0"));
  test("500 → '500'", () => expect(formatTokens(500)).toBe("500"));
  test("1200 → '1.2k'", () => expect(formatTokens(1200)).toBe("1.2k"));
  test("15000 → '15k'", () => expect(formatTokens(15000)).toBe("15k"));
  test("150000 → '150k'", () => expect(formatTokens(150000)).toBe("150k"));
  test("999 stays as 999", () => expect(formatTokens(999)).toBe("999"));
  test("1000 → '1.0k'", () => expect(formatTokens(1000)).toBe("1.0k"));
});

// ---------------------------------------------------------------------------
// estimateCost / formatCost
// ---------------------------------------------------------------------------

describe("estimateCost", () => {
  test("zero tokens = zero cost", () => expect(estimateCost(0, 0)).toBe(0));
  test("1M input tokens at $3/M = $3", () => expect(estimateCost(1_000_000, 0)).toBeCloseTo(3, 2));
  test("1M output tokens at $15/M = $15", () => expect(estimateCost(0, 1_000_000)).toBeCloseTo(15, 2));
  test("custom rates", () => expect(estimateCost(1_000_000, 0, 10, 30)).toBeCloseTo(10, 2));
});

describe("formatCost", () => {
  test("0 → '$0.00'", () => expect(formatCost(0)).toBe("$0.00"));
  test("1.5 → '$1.50'", () => expect(formatCost(1.5)).toBe("$1.50"));
  test("0.12 → '$0.12'", () => expect(formatCost(0.12)).toBe("$0.12"));
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  test("negative → '0s'", () => expect(formatDuration(-1)).toBe("0s"));
  test("500ms → '0.5s'", () => expect(formatDuration(500)).toBe("0.5s"));
  test("2300ms → '2.3s'", () => expect(formatDuration(2300)).toBe("2.3s"));
  test("15000ms → '15s'", () => expect(formatDuration(15000)).toBe("15s"));
  test("65000ms → '1m 5s'", () => expect(formatDuration(65000)).toBe("1m 5s"));
  test("60000ms → '1m'", () => expect(formatDuration(60000)).toBe("1m"));
  test("3661000ms → '1h 1m'", () => expect(formatDuration(3661000)).toBe("1h 1m"));
  test("3600000ms → '1h'", () => expect(formatDuration(3600000)).toBe("1h"));
});

// ---------------------------------------------------------------------------
// capitalize
// ---------------------------------------------------------------------------

describe("capitalize", () => {
  test("capitalizes first letter", () => expect(capitalize("read")).toBe("Read"));
  test("already capitalized", () => expect(capitalize("Read")).toBe("Read"));
  test("empty string", () => expect(capitalize("")).toBe(""));
  test("single char", () => expect(capitalize("a")).toBe("A"));
});

// ---------------------------------------------------------------------------
// pluralize
// ---------------------------------------------------------------------------

describe("pluralize", () => {
  test("1 → singular", () => expect(pluralize(1, "tool call")).toBe("1 tool call"));
  test("0 → plural", () => expect(pluralize(0, "tool call")).toBe("0 tool calls"));
  test("3 → plural", () => expect(pluralize(3, "tool call")).toBe("3 tool calls"));
});

// ---------------------------------------------------------------------------
// shortenHome
// ---------------------------------------------------------------------------

describe("shortenHome", () => {
  test("replaces home dir with ~", () => {
    const home = process.env.HOME ?? "/tmp";
    expect(shortenHome(`${home}/projects`)).toBe("~/projects");
  });

  test("leaves non-home paths unchanged", () => {
    expect(shortenHome("/usr/local/bin")).toBe("/usr/local/bin");
  });
});

// ---------------------------------------------------------------------------
// extractToolSummary
// ---------------------------------------------------------------------------

describe("extractToolSummary", () => {
  test("extracts file_path from object", () => {
    expect(extractToolSummary({ file_path: "test.ts" })).toBe("test.ts");
  });

  test("extracts command from string args", () => {
    expect(extractToolSummary('{"command":"npm test"}')).toBe("npm test");
  });

  test("handles empty object", () => {
    expect(extractToolSummary({})).toBe("");
  });

  test("handles invalid JSON string", () => {
    expect(extractToolSummary("not json")).toBe("");
  });

  test("prefers command over file_path", () => {
    expect(extractToolSummary({ command: "ls", file_path: "test.ts" })).toBe("ls");
  });
});

// ---------------------------------------------------------------------------
// truncateResult
// ---------------------------------------------------------------------------

describe("truncateResult", () => {
  test("returns empty for empty input", () => {
    expect(truncateResult("")).toBe("");
  });

  test("returns full text when under limit", () => {
    expect(truncateResult("line 1\nline 2\nline 3")).toBe("line 1\nline 2\nline 3");
  });

  test("truncates at max lines", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const result = truncateResult(lines, 8);
    expect(result).toContain("line 1");
    expect(result).toContain("line 8");
    expect(result).toContain("12 more lines");
    expect(result).not.toContain("line 9");
  });
});

// ---------------------------------------------------------------------------
// safeParseJson
// ---------------------------------------------------------------------------

describe("safeParseJson", () => {
  test("parses valid JSON", () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  test("returns empty object for invalid JSON", () => {
    expect(safeParseJson("not json")).toEqual({});
  });

  test("returns empty object for empty string", () => {
    expect(safeParseJson("")).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// formatToolCall
// ---------------------------------------------------------------------------

describe("formatToolCall", () => {
  test("uses ⏺ marker", () => {
    const result = stripAnsi(formatToolCall("read", '{"file_path":"src/chat.ts"}'));
    expect(result).toContain("⏺");
    expect(result).not.toContain("⎿");
  });

  test("capitalizes tool name", () => {
    const result = stripAnsi(formatToolCall("read", '{"file_path":"src/chat.ts"}'));
    expect(result).toContain("Read");
  });

  test("extracts file_path from args", () => {
    const result = stripAnsi(formatToolCall("read", '{"file_path":"src/chat.ts"}'));
    expect(result).toContain("src/chat.ts");
  });

  test("extracts command from args", () => {
    const result = stripAnsi(formatToolCall("bash", '{"command":"npm test"}'));
    expect(result).toContain("npm test");
    expect(result).toContain("Bash");
  });

  test("handles invalid JSON args gracefully", () => {
    const result = stripAnsi(formatToolCall("bash", "not json"));
    expect(result).toContain("Bash");
  });

  test("handles empty args", () => {
    const result = stripAnsi(formatToolCall("read", '{}'));
    expect(result).toContain("⏺");
    expect(result).toContain("Read");
  });
});

// ---------------------------------------------------------------------------
// formatToolResult
// ---------------------------------------------------------------------------

describe("formatToolResult", () => {
  test("returns empty string for empty result", () => {
    expect(formatToolResult("read", "", false)).toBe("");
  });

  test("contains ⎿ connector", () => {
    const result = stripAnsi(formatToolResult("read", "file contents", false));
    expect(result).toContain("⎿");
  });

  test("truncates results longer than 12 lines", () => {
    const longResult = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const result = stripAnsi(formatToolResult("read", longResult, false));
    expect(result).toContain("more lines");
    expect(result).toContain("8 more lines");
  });
});

// ---------------------------------------------------------------------------
// formatThinkingDone
// ---------------------------------------------------------------------------

describe("formatThinkingDone", () => {
  test("default message without summary", () => {
    const result = stripAnsi(formatThinkingDone());
    expect(result).toContain("Thinking complete");
  });

  test("truncates long summaries", () => {
    const longSummary = "a".repeat(100);
    const result = stripAnsi(formatThinkingDone(longSummary));
    expect(result).toContain("…");
  });
});

// ---------------------------------------------------------------------------
// formatTurnComplete
// ---------------------------------------------------------------------------

describe("formatTurnComplete", () => {
  test("contains model name", () => {
    const result = stripAnsi(formatTurnComplete("claude", 1200, 340, 2300));
    expect(result).toContain("claude");
  });

  test("uses ↑/↓ arrows for token counts", () => {
    const result = stripAnsi(formatTurnComplete("claude", 1200, 340, 2300));
    expect(result).toContain("1.2k↑");
    expect(result).toContain("340↓");
  });

  test("parts are separated by ·", () => {
    const result = stripAnsi(formatTurnComplete("claude", 1200, 340, 2300));
    expect(result.split("·").length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// formatCancelled / formatError / formatCompaction
// ---------------------------------------------------------------------------

describe("formatCancelled", () => {
  test("contains cancellation indicator", () => {
    const result = stripAnsi(formatCancelled());
    expect(result).toContain("⏎");
    expect(result).toContain("Cancelled");
  });
});

describe("formatError", () => {
  test("contains the error message", () => {
    const result = stripAnsi(formatError("something broke"));
    expect(result).toContain("something broke");
    expect(result).toContain("error:");
  });
});

describe("formatCompaction", () => {
  test("contains both token counts", () => {
    const result = stripAnsi(formatCompaction(12000, 4000));
    expect(result).toContain("12k");
    expect(result).toContain("4.0k");
    expect(result).toContain("Context compacted");
  });
});

// ---------------------------------------------------------------------------
// formatSessionList
// ---------------------------------------------------------------------------

describe("formatSessionList", () => {
  const sessions = [
    { slug: "bold-nexus-001", title: "Test Session", model: "claude", token_count: 1200, updated_at: Date.now() },
    { slug: "calm-prism-042", title: "calm-prism-042", model: "gpt4", token_count: 500, updated_at: Date.now() },
  ];

  test("returns 'No sessions found' for empty list", () => {
    expect(stripAnsi(formatSessionList([]))).toContain("No sessions found");
  });

  test("lists session slugs", () => {
    const result = stripAnsi(formatSessionList(sessions));
    expect(result).toContain("bold-nexus-001");
    expect(result).toContain("calm-prism-042");
  });

  test("shows current session marker", () => {
    const result = stripAnsi(formatSessionList(sessions, null, "bold-nexus-001"));
    expect(result).toContain("current");
  });
});

// ---------------------------------------------------------------------------
// formatHelp
// ---------------------------------------------------------------------------

describe("formatHelp", () => {
  test("lists all slash commands", () => {
    const result = stripAnsi(formatHelp());
    expect(result).toContain("/new");
    expect(result).toContain("/sessions");
    expect(result).toContain("/help");
    expect(result).toContain("exit");
  });

  test("contains header", () => {
    expect(stripAnsi(formatHelp())).toContain("Commands");
  });
});

// ---------------------------------------------------------------------------
// Sub-agent formatting
// ---------------------------------------------------------------------------

describe("formatDelegateStart", () => {
  test("includes capitalized agent type", () => {
    expect(stripAnsi(formatDelegateStart("explore", "Search for patterns"))).toContain("Explore");
  });

  test("contains ⏺ indicator", () => {
    expect(stripAnsi(formatDelegateStart("task", "Do something"))).toContain("⏺");
  });
});

describe("formatDelegateResult", () => {
  test("renders successful result with metrics", () => {
    const json = JSON.stringify({
      ok: true,
      context: { toolCalls: [{ name: "read" }, { name: "write" }] },
      tokensIn: 1500,
      tokensOut: 500,
    });
    const result = stripAnsi(formatDelegateResult(json, 3000));
    expect(result).toContain("Done");
    expect(result).toContain("2 tool calls");
  });

  test("handles malformed JSON gracefully", () => {
    expect(stripAnsi(formatDelegateResult("not json", 1000))).toContain("Done");
  });
});

describe("formatParallelStart", () => {
  test("shows task count", () => {
    expect(stripAnsi(formatParallelStart(3))).toContain("3 tasks");
  });

  test("singular task", () => {
    const result = stripAnsi(formatParallelStart(1));
    expect(result).toContain("1 task");
    expect(result).not.toContain("1 tasks");
  });
});

describe("formatParallelResult", () => {
  test("renders multiple sub-agent results", () => {
    const json = JSON.stringify({
      ok: true,
      results: [
        { label: "task1", status: "success", agentType: "explore", tokensIn: 1000, tokensOut: 500, durationMs: 2000, context: { toolCalls: [{ name: "read" }] } },
        { label: "task2", status: "error", agentType: "research", tokensIn: 0, tokensOut: 0, durationMs: 1000, context: { toolCalls: [] } },
      ],
    });
    const result = stripAnsi(formatParallelResult(json));
    expect(result).toContain("Explore");
    expect(result).toContain("Research");
    expect(result).toContain("✓");
    expect(result).toContain("✗");
  });

  test("handles empty results", () => {
    expect(stripAnsi(formatParallelResult(JSON.stringify({ ok: true, results: [] })))).toContain("no results");
  });
});

// ---------------------------------------------------------------------------
// formatWelcome
// ---------------------------------------------------------------------------

describe("formatWelcome", () => {
  test("contains version and branding", () => {
    const result = stripAnsi(formatWelcome("2.0.0", "claude", "/tmp"));
    expect(result).toContain("Jeriko");
    expect(result).toContain("v2.0.0");
  });

  test("contains cat mascot", () => {
    const result = stripAnsi(formatWelcome("2.0.0", "claude", "/tmp"));
    expect(result).toContain("⣿");
  });

  test("shows model", () => {
    const result = stripAnsi(formatWelcome("2.0.0", "claude", "/tmp"));
    expect(result).toContain("model");
    expect(result).toContain("claude");
  });

  test("shows cwd", () => {
    const result = stripAnsi(formatWelcome("2.0.0", "claude", "/tmp"));
    expect(result).toContain("cwd");
  });

  test("has stacked layout with mascot and info panel", () => {
    const result = stripAnsi(formatWelcome("2.0.0", "claude", "/tmp"));
    // Mascot on top, info panel below
    expect(result).toContain("Jeriko");
    expect(result).toContain("model");
    expect(result).toContain("claude");
    // Bordered info panel with separator lines
    expect(result).toContain("─");
  });

  test("shows help hints", () => {
    const result = stripAnsi(formatWelcome("2.0.0", "claude", "/tmp"));
    expect(result).toContain("/help");
    expect(result).toContain("/new");
  });

  test("shortens home directory in cwd", () => {
    const home = process.env.HOME ?? "/tmp";
    expect(stripAnsi(formatWelcome("2.0.0", "claude", `${home}/projects`))).toContain("~/projects");
  });
});

// ---------------------------------------------------------------------------
// formatNewSession / formatSessionResume
// ---------------------------------------------------------------------------

describe("formatNewSession", () => {
  test("contains slug and model", () => {
    const result = stripAnsi(formatNewSession("bold-nexus-001", "claude"));
    expect(result).toContain("bold-nexus-001");
    expect(result).toContain("claude");
  });
});

describe("formatSessionResume", () => {
  test("contains slug and message count", () => {
    const result = stripAnsi(formatSessionResume("bold-nexus-001", 42));
    expect(result).toContain("bold-nexus-001");
    expect(result).toContain("42 messages");
  });

  test("omits count when undefined", () => {
    expect(stripAnsi(formatSessionResume("bold-nexus-001"))).not.toContain("messages");
  });
});

// ---------------------------------------------------------------------------
// formatSetupProviders
// ---------------------------------------------------------------------------

describe("formatSetupProviders", () => {
  const providers = [
    { name: "Claude (Anthropic)", needsApiKey: true },
    { name: "GPT (OpenAI)", needsApiKey: true },
    { name: "Local (Ollama)", needsApiKey: false },
  ];

  test("lists all providers", () => {
    const result = stripAnsi(formatSetupProviders(providers, 0));
    expect(result).toContain("Claude (Anthropic)");
    expect(result).toContain("GPT (OpenAI)");
    expect(result).toContain("Local (Ollama)");
  });

  test("marks first as recommended", () => {
    expect(stripAnsi(formatSetupProviders(providers, 0))).toContain("recommended");
  });
});

// ---------------------------------------------------------------------------
// formatChannelList
// ---------------------------------------------------------------------------

describe("formatChannelList", () => {
  test("returns 'No channels' for empty list", () => {
    expect(stripAnsi(formatChannelList([]))).toContain("No channels");
  });

  test("lists all channels", () => {
    const channels = [
      { name: "telegram", status: "connected", connected_at: new Date().toISOString() },
      { name: "whatsapp", status: "disconnected" },
    ];
    const result = stripAnsi(formatChannelList(channels));
    expect(result).toContain("telegram");
    expect(result).toContain("whatsapp");
  });
});

// ---------------------------------------------------------------------------
// SLASH_COMMANDS (re-exported from commands.ts)
// ---------------------------------------------------------------------------

describe("SLASH_COMMANDS", () => {
  test("contains all expected commands", () => {
    expect(SLASH_COMMANDS.has("/help")).toBe(true);
    expect(SLASH_COMMANDS.has("/new")).toBe(true);
    expect(SLASH_COMMANDS.has("/sessions")).toBe(true);
    expect(SLASH_COMMANDS.has("/resume")).toBe(true);
    expect(SLASH_COMMANDS.has("/model")).toBe(true);
  });

  test("has all 37 slash commands", () => {
    expect(SLASH_COMMANDS.size).toBe(37);
  });

  test("contains new v3 commands", () => {
    expect(SLASH_COMMANDS.has("/models")).toBe(true);
    expect(SLASH_COMMANDS.has("/history")).toBe(true);
    expect(SLASH_COMMANDS.has("/clear")).toBe(true);
    expect(SLASH_COMMANDS.has("/compact")).toBe(true);
    expect(SLASH_COMMANDS.has("/connectors")).toBe(true);
    expect(SLASH_COMMANDS.has("/connect")).toBe(true);
    expect(SLASH_COMMANDS.has("/disconnect")).toBe(true);
    expect(SLASH_COMMANDS.has("/triggers")).toBe(true);
    expect(SLASH_COMMANDS.has("/skills")).toBe(true);
    expect(SLASH_COMMANDS.has("/skill")).toBe(true);
    expect(SLASH_COMMANDS.has("/status")).toBe(true);
    expect(SLASH_COMMANDS.has("/health")).toBe(true);
    expect(SLASH_COMMANDS.has("/sys")).toBe(true);
    expect(SLASH_COMMANDS.has("/config")).toBe(true);
    expect(SLASH_COMMANDS.has("/session")).toBe(true);
    expect(SLASH_COMMANDS.has("/share")).toBe(true);
    expect(SLASH_COMMANDS.has("/cost")).toBe(true);
    expect(SLASH_COMMANDS.has("/billing")).toBe(true);
    expect(SLASH_COMMANDS.has("/kill")).toBe(true);
    expect(SLASH_COMMANDS.has("/archive")).toBe(true);
    expect(SLASH_COMMANDS.has("/auth")).toBe(true);
    expect(SLASH_COMMANDS.has("/tasks")).toBe(true);
    expect(SLASH_COMMANDS.has("/notifications")).toBe(true);
    expect(SLASH_COMMANDS.has("/cancel")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stripAnsi
// ---------------------------------------------------------------------------

describe("stripAnsi", () => {
  test("strips ANSI escape codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
  });

  test("passes through plain strings", () => {
    expect(stripAnsi("hello")).toBe("hello");
  });

  test("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatAge
// ---------------------------------------------------------------------------

describe("formatAge", () => {
  test("just now for recent timestamps", () => {
    expect(formatAge(Date.now())).toBe("just now");
  });

  test("seconds ago for < 1 minute", () => {
    const result = formatAge(Date.now() - 30000);
    expect(result).toContain("s ago");
  });

  test("minutes ago for < 1 hour", () => {
    const result = formatAge(Date.now() - 300000);
    expect(result).toContain("m ago");
  });

  test("hours ago for < 1 day", () => {
    const result = formatAge(Date.now() - 7200000);
    expect(result).toContain("h ago");
  });

  test("days ago for >= 1 day", () => {
    const result = formatAge(Date.now() - 172800000);
    expect(result).toContain("d ago");
  });
});

// ---------------------------------------------------------------------------
// formatModelList
// ---------------------------------------------------------------------------

describe("formatModelList", () => {
  const models = [
    { id: "claude", name: "Claude Sonnet", provider: "anthropic", contextWindow: 200000, supportsTools: true, supportsVision: true },
    { id: "gpt4", name: "GPT-4o", provider: "openai", contextWindow: 128000, supportsTools: true, supportsVision: false },
  ];

  test("returns 'No models' for empty list", () => {
    expect(stripAnsi(formatModelList([], "claude"))).toContain("No models");
  });

  test("lists model IDs and providers", () => {
    const result = stripAnsi(formatModelList(models, "claude"));
    expect(result).toContain("claude");
    expect(result).toContain("anthropic");
    expect(result).toContain("gpt4");
    expect(result).toContain("openai");
  });

  test("marks active model", () => {
    const result = stripAnsi(formatModelList(models, "claude"));
    // Active model is marked with ● symbol
    expect(result).toContain("●");
  });

  test("shows capability indicators", () => {
    const result = stripAnsi(formatModelList(models, "claude"));
    // Tools shown as icon 🔧
    expect(result).toContain("🔧");
    expect(result).toContain("200k ctx");
  });
});

// ---------------------------------------------------------------------------
// formatConnectorList
// ---------------------------------------------------------------------------

describe("formatConnectorList", () => {
  test("returns 'No connectors' for empty list", () => {
    expect(stripAnsi(formatConnectorList([]))).toContain("No connectors");
  });

  test("lists connectors with status", () => {
    const connectors = [
      { name: "github", type: "oauth", status: "connected" as const },
      { name: "stripe", type: "api-key", status: "disconnected" as const },
    ];
    const result = stripAnsi(formatConnectorList(connectors));
    expect(result).toContain("github");
    expect(result).toContain("stripe");
    expect(result).toContain("connected");
    expect(result).toContain("disconnected");
  });
});

// ---------------------------------------------------------------------------
// formatTriggerList
// ---------------------------------------------------------------------------

describe("formatTriggerList", () => {
  test("returns 'No triggers' for empty list", () => {
    expect(stripAnsi(formatTriggerList([]))).toContain("No triggers");
  });

  test("lists triggers with status", () => {
    const triggers = [
      { id: "t-1", name: "deploy-check", type: "cron", enabled: true, runCount: 42 },
      { id: "t-2", name: "backup", type: "webhook", enabled: false, runCount: 7 },
    ];
    const result = stripAnsi(formatTriggerList(triggers));
    expect(result).toContain("deploy-check");
    expect(result).toContain("backup");
    expect(result).toContain("enabled");
    expect(result).toContain("disabled");
    expect(result).toContain("42 runs");
  });
});

// ---------------------------------------------------------------------------
// formatSkillList / formatSkillDetail
// ---------------------------------------------------------------------------

describe("formatSkillList", () => {
  test("returns 'No skills' for empty list", () => {
    expect(stripAnsi(formatSkillList([]))).toContain("No skills");
  });

  test("lists skills with names", () => {
    const skills = [
      { name: "commit", description: "Create commits", userInvocable: true },
      { name: "review", description: "Code review", userInvocable: false },
    ];
    const result = stripAnsi(formatSkillList(skills));
    expect(result).toContain("commit");
    expect(result).toContain("review");
  });
});

describe("formatSkillDetail", () => {
  test("shows skill name and description", () => {
    const result = stripAnsi(formatSkillDetail("commit", "Create git commits", "Run git commit..."));
    expect(result).toContain("Commit");
    expect(result).toContain("Create git commits");
    expect(result).toContain("Run git commit");
  });
});

// ---------------------------------------------------------------------------
// formatStatus
// ---------------------------------------------------------------------------

describe("formatStatus", () => {
  test("shows daemon phase and uptime", () => {
    const result = stripAnsi(formatStatus({ phase: "running", uptime: 3600000 }));
    expect(result).toContain("running");
    expect(result).toContain("1h");
  });
});

// ---------------------------------------------------------------------------
// formatSysInfo
// ---------------------------------------------------------------------------

describe("formatSysInfo", () => {
  test("contains system information", () => {
    const result = stripAnsi(formatSysInfo());
    expect(result).toContain("Platform");
    expect(result).toContain("CPUs");
    expect(result).toContain("Memory");
  });
});

// ---------------------------------------------------------------------------
// formatConfig
// ---------------------------------------------------------------------------

describe("formatConfig", () => {
  test("renders config tree", () => {
    const config = { agent: { model: "claude", maxTokens: 8192 } };
    const result = stripAnsi(formatConfig(config));
    expect(result).toContain("agent");
    expect(result).toContain("model");
    expect(result).toContain("claude");
  });

  test("redacts sensitive values", () => {
    const config = { apiKey: "sk-secret-key-12345" };
    const result = stripAnsi(formatConfig(config));
    expect(result).not.toContain("sk-secret");
    expect(result).toContain("••••••");
  });
});

// ---------------------------------------------------------------------------
// formatHistory
// ---------------------------------------------------------------------------

describe("formatHistory", () => {
  test("returns 'No messages' for empty list", () => {
    expect(stripAnsi(formatHistory([]))).toContain("No messages");
  });

  test("shows message roles and content", () => {
    const entries = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const result = stripAnsi(formatHistory(entries));
    expect(result).toContain("user");
    expect(result).toContain("assistant");
    expect(result).toContain("Hello");
    expect(result).toContain("Hi there!");
  });

  test("truncates long messages", () => {
    const entries = [{ role: "user", content: "a".repeat(200) }];
    const result = stripAnsi(formatHistory(entries));
    expect(result).toContain("…");
  });
});

// ---------------------------------------------------------------------------
// formatHealth
// ---------------------------------------------------------------------------

describe("formatHealth", () => {
  test("returns 'No connectors' for empty list", () => {
    expect(stripAnsi(formatHealth([]))).toContain("No connectors");
  });

  test("shows health status with icons", () => {
    const results = [
      { name: "github", healthy: true, latencyMs: 120 },
      { name: "stripe", healthy: false, latencyMs: 0, error: "timeout" },
    ];
    const result = stripAnsi(formatHealth(results));
    expect(result).toContain("✓");
    expect(result).toContain("✗");
    expect(result).toContain("github");
    expect(result).toContain("120ms");
    expect(result).toContain("timeout");
  });
});

// ---------------------------------------------------------------------------
// formatHelp (updated — grouped by category)
// ---------------------------------------------------------------------------

describe("formatHelp (v3)", () => {
  test("contains category headers", () => {
    const result = stripAnsi(formatHelp());
    expect(result).toContain("Session");
    expect(result).toContain("Model");
    expect(result).toContain("Management");
    expect(result).toContain("System");
  });

  test("contains new v3 commands", () => {
    const result = stripAnsi(formatHelp());
    expect(result).toContain("/model");
    expect(result).toContain("/model add");
    expect(result).toContain("/skills");
    expect(result).toContain("/status");
    expect(result).toContain("/config");
    expect(result).toContain("/session");
    expect(result).toContain("/share");
  });
});

// ---------------------------------------------------------------------------
// Session detail
// ---------------------------------------------------------------------------

describe("formatSessionDetail", () => {
  test("shows session info", () => {
    const session = {
      id: "abc123",
      slug: "bright-fox-7",
      title: "Test session",
      model: "claude",
      tokenCount: 5000,
      updatedAt: Date.now() - 60000,
    };
    const result = stripAnsi(formatSessionDetail(session, "claude-sonnet-4-6"));
    expect(result).toContain("Current Session");
    expect(result).toContain("abc123");
    expect(result).toContain("bright-fox-7");
    expect(result).toContain("Test session");
    expect(result).toContain("claude-sonnet-4-6");
    expect(result).toContain("5.0k");
  });

  test("shows stats when provided", () => {
    const session = {
      id: "abc123",
      slug: "bright-fox-7",
      title: "Test session",
      model: "claude",
      tokenCount: 5000,
      updatedAt: Date.now(),
    };
    const stats = { tokensIn: 1000, tokensOut: 500, turns: 3, durationMs: 5000 };
    const result = stripAnsi(formatSessionDetail(session, "claude", stats));
    expect(result).toContain("Session Stats");
    expect(result).toContain("Turns");
    expect(result).toContain("3");
  });

  test("hides stats section when no turns", () => {
    const session = {
      id: "abc123",
      slug: "bright-fox-7",
      title: "Test",
      model: "claude",
      tokenCount: 0,
      updatedAt: Date.now(),
    };
    const result = stripAnsi(formatSessionDetail(session, "claude"));
    expect(result).not.toContain("Session Stats");
  });
});

// ---------------------------------------------------------------------------
// Share formatting
// ---------------------------------------------------------------------------

describe("formatShareCreated", () => {
  test("shows share URL and details", () => {
    const share = {
      shareId: "abc123",
      url: "https://bot.jeriko.ai/s/abc123",
      sessionId: "session-1",
      title: "Test session",
      model: "claude",
      messageCount: 10,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    const result = stripAnsi(formatShareCreated(share));
    expect(result).toContain("Session shared");
    expect(result).toContain("https://bot.jeriko.ai/s/abc123");
    expect(result).toContain("10");
    expect(result).toContain("claude");
    expect(result).toContain("30 days");
  });

  test("handles null expiry", () => {
    const share = {
      shareId: "abc123",
      url: "https://bot.jeriko.ai/s/abc123",
      sessionId: "session-1",
      title: "Test",
      model: "gpt",
      messageCount: 5,
      createdAt: Date.now(),
      expiresAt: null,
    };
    const result = stripAnsi(formatShareCreated(share));
    expect(result).not.toContain("Expires");
  });
});

describe("formatShareList", () => {
  test("shows empty state", () => {
    const result = stripAnsi(formatShareList([]));
    expect(result).toContain("No active shares");
  });

  test("shows shares with details", () => {
    const shares = [
      {
        shareId: "abc123",
        url: "https://bot.jeriko.ai/s/abc123",
        sessionId: "s1",
        title: "Test",
        model: "claude",
        messageCount: 10,
        createdAt: Date.now() - 3600000,
        expiresAt: null,
      },
      {
        shareId: "def456",
        url: "https://bot.jeriko.ai/s/def456",
        sessionId: "s1",
        title: "Test 2",
        model: "gpt",
        messageCount: 5,
        createdAt: Date.now() - 7200000,
        expiresAt: null,
      },
    ];
    const result = stripAnsi(formatShareList(shares));
    expect(result).toContain("Shares (2)");
    expect(result).toContain("abc123");
    expect(result).toContain("def456");
    expect(result).toContain("10 msgs");
    expect(result).toContain("5 msgs");
    expect(result).toContain("/share revoke");
  });
});

// ---------------------------------------------------------------------------
// formatTaskList
// ---------------------------------------------------------------------------

describe("formatTaskList", () => {
  test("shows tasks header when empty", () => {
    const result = stripAnsi(formatTaskList([]));
    expect(result).toContain("Tasks (0)");
  });

  test("formats a list of tasks", () => {
    const tasks = [
      { id: "abc1", name: "backup", type: "once", command: "tar -czf ~/backup.tar.gz", enabled: true, created_at: "2025-01-01" },
      { id: "def2", name: "cleanup", type: "once", command: "rm -rf /tmp/old", enabled: false, created_at: "2025-01-02" },
    ];
    const result = stripAnsi(formatTaskList(tasks));
    expect(result).toContain("Tasks (2)");
    expect(result).toContain("backup");
    expect(result).toContain("cleanup");
  });
});

// ---------------------------------------------------------------------------
// formatNotificationList
// ---------------------------------------------------------------------------

describe("formatNotificationList", () => {
  test("shows default message when empty", () => {
    const result = stripAnsi(formatNotificationList([]));
    expect(result).toMatch(/[Nn]o notification|default/);
  });

  test("formats notification preferences", () => {
    const prefs = [
      { channel: "telegram", chatId: "123", enabled: true },
      { channel: "whatsapp", chatId: "456", enabled: false },
    ];
    const result = stripAnsi(formatNotificationList(prefs));
    expect(result).toContain("Notifications (2)");
    expect(result).toContain("telegram");
    expect(result).toContain("whatsapp");
    expect(result).toContain("ON");
    expect(result).toContain("OFF");
  });
});

// ---------------------------------------------------------------------------
// formatAuthStatus
// ---------------------------------------------------------------------------

describe("formatAuthStatus", () => {
  test("shows 'no connectors' when empty", () => {
    const result = stripAnsi(formatAuthStatus([]));
    expect(result).toMatch(/[Nn]o connectors/);
  });

  test("formats connector auth status", () => {
    const connectors = [
      {
        name: "stripe",
        label: "Stripe",
        description: "Payment processing",
        configured: true,
        required: [{ variable: "STRIPE_SECRET_KEY", label: "STRIPE_SECRET_KEY", set: true }],
        optional: [],
      },
      {
        name: "github",
        label: "GitHub",
        description: "Source code hosting",
        configured: false,
        required: [{ variable: "GITHUB_TOKEN", label: "GITHUB_TOKEN", set: false }],
        optional: [{ variable: "GITHUB_ORG", set: false }],
      },
    ];
    const result = stripAnsi(formatAuthStatus(connectors));
    expect(result).toContain("Connector Authentication");
    expect(result).toContain("Stripe");
    expect(result).toContain("configured");
    expect(result).toContain("GitHub");
    expect(result).toContain("not configured");
    expect(result).toContain("/auth");
  });
});

// ---------------------------------------------------------------------------
// formatAuthDetail
// ---------------------------------------------------------------------------

describe("formatAuthDetail", () => {
  test("formats detail for a connector with single key", () => {
    const connector = {
      name: "stripe",
      label: "Stripe",
      description: "Payment processing",
      configured: false,
      required: [{ variable: "STRIPE_SECRET_KEY", label: "STRIPE_SECRET_KEY", set: false }],
      optional: [],
    };
    const result = stripAnsi(formatAuthDetail(connector));
    expect(result).toContain("Stripe");
    expect(result).toContain("Payment processing");
    expect(result).toContain("not configured");
    expect(result).toContain("STRIPE_SECRET_KEY");
    expect(result).toContain("/auth stripe");
  });

  test("formats detail for a connector with multiple keys", () => {
    const connector = {
      name: "paypal",
      label: "PayPal",
      description: "PayPal payments",
      configured: false,
      required: [
        { variable: "PAYPAL_CLIENT_ID", label: "PAYPAL_CLIENT_ID", set: false },
        { variable: "PAYPAL_CLIENT_SECRET", label: "PAYPAL_CLIENT_SECRET", set: false },
      ],
      optional: [{ variable: "PAYPAL_MODE", set: false }],
    };
    const result = stripAnsi(formatAuthDetail(connector));
    expect(result).toContain("PayPal");
    expect(result).toContain("Required:");
    expect(result).toContain("PAYPAL_CLIENT_ID");
    expect(result).toContain("PAYPAL_CLIENT_SECRET");
    expect(result).toContain("Optional:");
    expect(result).toContain("PAYPAL_MODE");
  });
});
