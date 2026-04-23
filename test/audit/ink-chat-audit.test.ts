/**
 * Ink Chat CLI audit test suite.
 *
 * Tests pure logic extracted from the interactive CLI:
 *   - Reducer state transitions (all 23 action types)
 *   - Slash command parsing and completion
 *   - Phase transitions and guards
 *   - Cost calculation
 *   - Markdown rendering
 *   - Syntax highlighting
 *   - Input history
 *   - Autocomplete matching
 *   - Context bar computation
 *   - Sub-agent derived state
 *   - Format helpers
 */

import { describe, expect, test, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

// Reducer
import { appReducer } from "../../src/cli/hooks/useAppReducer.js";
import {
  createInitialState,
  emptyStats,
  emptyContextInfo,
  isPhase,
  type AppState,
  type AppAction,
  type DisplayToolCall,
  type SubAgentState,
  type Phase,
} from "../../src/cli/types.js";

// Commands
import {
  parseSlashCommand,
  slashCompleter,
  isExitCommand,
  SLASH_COMMANDS,
  COMMAND_CATEGORIES,
  HELP_ENTRIES,
  SUB_AGENT_TOOLS,
} from "../../src/cli/commands.js";

// Autocomplete
import {
  shouldShowAutocomplete,
  filterCommands,
  navigateSelection,
  emptyAutocompleteState,
  computeAutocompleteState,
  type AutocompleteState,
} from "../../src/cli/lib/autocomplete.js";

// Cost
import {
  getModelRates,
  estimateModelCost,
  formatModelCost,
} from "../../src/cli/lib/cost.js";

// History
import { InputHistory } from "../../src/cli/lib/history.js";

// Markdown + syntax highlighter (post-Subsystem 6 barrel)
import { renderMarkdown, highlightCode, supportedLanguages } from "../../src/cli/rendering/index.js";

// Setup
import {
  needsSetup,
  validateApiKey,
  getProviderOptions,
  PROVIDER_OPTIONS,
} from "../../src/cli/lib/setup.js";

// Context bar
import { computeContextBar } from "../../src/cli/components/ContextBar.js";

// Autocomplete component helper
import { computeVisibleWindow } from "../../src/cli/components/Autocomplete.js";

// Sub-agent derived state
import {
  deriveSubAgentState,
  getAgentTypeColor,
  AGENT_TYPE_COLORS,
} from "../../src/cli/hooks/useSubAgents.js";

// Format helpers
import {
  formatTokens,
  formatDuration,
  capitalize,
  pluralize,
  shortenHome,
  extractToolSummary,
  truncateResult,
  safeParseJson,
  formatError,
  estimateCost,
  formatCost,
} from "../../src/cli/format.js";

// Theme
import { PALETTE, ICONS } from "../../src/cli/theme.js";

// ===========================================================================
// 1. Reducer State Transitions
// ===========================================================================

describe("appReducer", () => {
  let state: AppState;

  beforeEach(() => {
    state = createInitialState({});
  });

  // ── Phase transitions ──────────────────────────────────────────

  test("SET_PHASE transitions to any valid phase", () => {
    const phases: Phase[] = ["idle", "thinking", "streaming", "tool-executing", "sub-executing", "wizard"];
    for (const phase of phases) {
      const next = appReducer(state, { type: "SET_PHASE", phase });
      expect(next.phase).toBe(phase);
    }
  });

  // ── Messages ───────────────────────────────────────────────────

  test("ADD_MESSAGE appends to messages array", () => {
    const msg = { id: "1", role: "user" as const, content: "hello", timestamp: 1 };
    const next = appReducer(state, { type: "ADD_MESSAGE", message: msg });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]!.content).toBe("hello");
  });

  test("ADD_MESSAGE preserves existing messages", () => {
    const msg1 = { id: "1", role: "user" as const, content: "a", timestamp: 1 };
    const msg2 = { id: "2", role: "assistant" as const, content: "b", timestamp: 2 };
    let s = appReducer(state, { type: "ADD_MESSAGE", message: msg1 });
    s = appReducer(s, { type: "ADD_MESSAGE", message: msg2 });
    expect(s.messages).toHaveLength(2);
    expect(s.messages[0]!.role).toBe("user");
    expect(s.messages[1]!.role).toBe("assistant");
  });

  test("CLEAR_MESSAGES resets to empty", () => {
    const msg = { id: "1", role: "user" as const, content: "a", timestamp: 1 };
    let s = appReducer(state, { type: "ADD_MESSAGE", message: msg });
    s = appReducer(s, { type: "CLEAR_MESSAGES" });
    expect(s.messages).toHaveLength(0);
  });

  // ── Streaming text ─────────────────────────────────────────────

  test("APPEND_STREAM_TEXT concatenates content", () => {
    let s = appReducer(state, { type: "APPEND_STREAM_TEXT", content: "Hello" });
    s = appReducer(s, { type: "APPEND_STREAM_TEXT", content: " world" });
    expect(s.streamText).toBe("Hello world");
  });

  test("CLEAR_STREAM resets to empty string", () => {
    let s = appReducer(state, { type: "APPEND_STREAM_TEXT", content: "text" });
    s = appReducer(s, { type: "CLEAR_STREAM" });
    expect(s.streamText).toBe("");
  });

  // ── Tool calls ─────────────────────────────────────────────────

  test("TOOL_CALL_START adds to liveToolCalls", () => {
    const tc: DisplayToolCall = {
      id: "tc1", name: "read", args: { path: "test.ts" },
      status: "running", startTime: Date.now(),
    };
    const next = appReducer(state, { type: "TOOL_CALL_START", toolCall: tc });
    expect(next.liveToolCalls).toHaveLength(1);
    expect(next.liveToolCalls[0]!.name).toBe("read");
  });

  test("TOOL_CALL_RESULT updates matching tool call", () => {
    const tc: DisplayToolCall = {
      id: "tc1", name: "read", args: {},
      status: "running", startTime: Date.now() - 1000,
    };
    let s = appReducer(state, { type: "TOOL_CALL_START", toolCall: tc });
    s = appReducer(s, { type: "TOOL_CALL_RESULT", id: "tc1", result: "42 lines", isError: false });
    expect(s.liveToolCalls[0]!.status).toBe("completed");
    expect(s.liveToolCalls[0]!.result).toBe("42 lines");
    expect(s.liveToolCalls[0]!.isError).toBe(false);
    expect(s.liveToolCalls[0]!.durationMs).toBeGreaterThan(0);
  });

  test("TOOL_CALL_RESULT ignores non-matching id", () => {
    const tc: DisplayToolCall = {
      id: "tc1", name: "read", args: {},
      status: "running", startTime: Date.now(),
    };
    let s = appReducer(state, { type: "TOOL_CALL_START", toolCall: tc });
    s = appReducer(s, { type: "TOOL_CALL_RESULT", id: "tc999", result: "oops", isError: true });
    expect(s.liveToolCalls[0]!.status).toBe("running");
    expect(s.liveToolCalls[0]!.result).toBeUndefined();
  });

  test("CLEAR_TOOL_CALLS resets to empty", () => {
    const tc: DisplayToolCall = {
      id: "tc1", name: "read", args: {},
      status: "running", startTime: Date.now(),
    };
    let s = appReducer(state, { type: "TOOL_CALL_START", toolCall: tc });
    s = appReducer(s, { type: "CLEAR_TOOL_CALLS" });
    expect(s.liveToolCalls).toHaveLength(0);
  });

  test("SET_CURRENT_TOOL updates currentTool", () => {
    let s = appReducer(state, { type: "SET_CURRENT_TOOL", name: "Bash" });
    expect(s.currentTool).toBe("Bash");
    s = appReducer(s, { type: "SET_CURRENT_TOOL", name: undefined });
    expect(s.currentTool).toBeUndefined();
  });

  // ── Freeze assistant message ───────────────────────────────────

  test("FREEZE_ASSISTANT_MESSAGE creates message from stream data", () => {
    const tcs: DisplayToolCall[] = [{
      id: "tc1", name: "read", args: {}, status: "completed",
      startTime: Date.now(), result: "ok",
    }];
    const next = appReducer(state, {
      type: "FREEZE_ASSISTANT_MESSAGE",
      id: "msg1",
      text: "The answer is 42.",
      toolCalls: tcs,
    });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]!.role).toBe("assistant");
    expect(next.messages[0]!.content).toBe("The answer is 42.");
    expect(next.messages[0]!.toolCalls).toHaveLength(1);
  });

  test("FREEZE_ASSISTANT_MESSAGE skips when both text and toolCalls empty", () => {
    const next = appReducer(state, {
      type: "FREEZE_ASSISTANT_MESSAGE",
      id: "msg1",
      text: "",
      toolCalls: [],
    });
    expect(next.messages).toHaveLength(0);
  });

  test("FREEZE_ASSISTANT_MESSAGE keeps text-only message (no tool calls)", () => {
    const next = appReducer(state, {
      type: "FREEZE_ASSISTANT_MESSAGE",
      id: "msg1",
      text: "Hello",
      toolCalls: [],
    });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]!.toolCalls).toBeUndefined();
  });

  // ── Stats ──────────────────────────────────────────────────────

  test("UPDATE_STATS accumulates tokens and turns", () => {
    let s = appReducer(state, { type: "UPDATE_STATS", tokensIn: 100, tokensOut: 50, durationMs: 1000 });
    expect(s.stats.tokensIn).toBe(100);
    expect(s.stats.tokensOut).toBe(50);
    expect(s.stats.turns).toBe(1);
    expect(s.stats.durationMs).toBe(1000);

    s = appReducer(s, { type: "UPDATE_STATS", tokensIn: 200, tokensOut: 100, durationMs: 2000 });
    expect(s.stats.tokensIn).toBe(300);
    expect(s.stats.tokensOut).toBe(150);
    expect(s.stats.turns).toBe(2);
    expect(s.stats.durationMs).toBe(3000);
  });

  test("RESET_STATS zeros everything", () => {
    let s = appReducer(state, { type: "UPDATE_STATS", tokensIn: 100, tokensOut: 50, durationMs: 1000 });
    s = appReducer(s, { type: "RESET_STATS" });
    expect(s.stats).toEqual(emptyStats());
  });

  // ── Model / Session ────────────────────────────────────────────

  test("SET_MODEL updates model name", () => {
    const next = appReducer(state, { type: "SET_MODEL", model: "gpt-4o" });
    expect(next.model).toBe("gpt-4o");
  });

  test("SET_SESSION_SLUG updates session slug", () => {
    const next = appReducer(state, { type: "SET_SESSION_SLUG", slug: "bold-nexus" });
    expect(next.sessionSlug).toBe("bold-nexus");
  });

  // ── Context window ─────────────────────────────────────────────

  test("UPDATE_CONTEXT sets totalTokens", () => {
    const next = appReducer(state, { type: "UPDATE_CONTEXT", totalTokens: 50000 });
    expect(next.context.totalTokens).toBe(50000);
  });

  test("CONTEXT_COMPACTED updates tokens and compaction count", () => {
    const next = appReducer(state, { type: "CONTEXT_COMPACTED", before: 150000, after: 80000 });
    expect(next.context.totalTokens).toBe(80000);
    expect(next.context.compactionCount).toBe(1);
    expect(next.context.lastCompactedAt).toBeGreaterThan(0);
  });

  test("CONTEXT_COMPACTED increments count on repeated compactions", () => {
    let s = appReducer(state, { type: "CONTEXT_COMPACTED", before: 150000, after: 80000 });
    s = appReducer(s, { type: "CONTEXT_COMPACTED", before: 120000, after: 60000 });
    expect(s.context.compactionCount).toBe(2);
    expect(s.context.totalTokens).toBe(60000);
  });

  // ── Sub-agent live monitoring ──────────────────────────────────

  test("SUB_AGENT_STARTED adds agent to map", () => {
    const next = appReducer(state, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "child1",
      parentSessionId: "parent1",
      label: "Research",
      agentType: "research",
    });
    expect(next.subAgents.size).toBe(1);
    const agent = next.subAgents.get("child1")!;
    expect(agent.label).toBe("Research");
    expect(agent.phase).toBe("running");
    expect(agent.toolCallCount).toBe(0);
  });

  test("SUB_AGENT_TEXT_DELTA appends to stream preview", () => {
    let s = appReducer(state, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "child1",
      parentSessionId: "p",
      label: "R",
      agentType: "research",
    });
    s = appReducer(s, { type: "SUB_AGENT_TEXT_DELTA", childSessionId: "child1", content: "Hello " });
    s = appReducer(s, { type: "SUB_AGENT_TEXT_DELTA", childSessionId: "child1", content: "world" });
    expect(s.subAgents.get("child1")!.streamPreview).toBe("Hello world");
  });

  test("SUB_AGENT_TEXT_DELTA truncates to 120 chars", () => {
    let s = appReducer(state, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "child1",
      parentSessionId: "p",
      label: "R",
      agentType: "research",
    });
    const longText = "A".repeat(200);
    s = appReducer(s, { type: "SUB_AGENT_TEXT_DELTA", childSessionId: "child1", content: longText });
    expect(s.subAgents.get("child1")!.streamPreview.length).toBe(120);
  });

  test("SUB_AGENT_TEXT_DELTA ignores unknown childSessionId", () => {
    const next = appReducer(state, { type: "SUB_AGENT_TEXT_DELTA", childSessionId: "unknown", content: "x" });
    expect(next).toBe(state);
  });

  test("SUB_AGENT_TOOL_CALL updates current tool and increments count", () => {
    let s = appReducer(state, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "child1",
      parentSessionId: "p",
      label: "R",
      agentType: "research",
    });
    s = appReducer(s, { type: "SUB_AGENT_TOOL_CALL", childSessionId: "child1", toolName: "read" });
    const agent = s.subAgents.get("child1")!;
    expect(agent.currentTool).toBe("read");
    expect(agent.toolCallCount).toBe(1);

    s = appReducer(s, { type: "SUB_AGENT_TOOL_CALL", childSessionId: "child1", toolName: "bash" });
    expect(s.subAgents.get("child1")!.toolCallCount).toBe(2);
  });

  test("SUB_AGENT_TOOL_RESULT clears current tool", () => {
    let s = appReducer(state, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "child1",
      parentSessionId: "p",
      label: "R",
      agentType: "research",
    });
    s = appReducer(s, { type: "SUB_AGENT_TOOL_CALL", childSessionId: "child1", toolName: "read" });
    s = appReducer(s, { type: "SUB_AGENT_TOOL_RESULT", childSessionId: "child1", toolCallId: "tc1", isError: false });
    expect(s.subAgents.get("child1")!.currentTool).toBeNull();
  });

  test("SUB_AGENT_COMPLETE marks agent as completed or error", () => {
    let s = appReducer(state, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "child1",
      parentSessionId: "p",
      label: "R",
      agentType: "research",
    });
    s = appReducer(s, { type: "SUB_AGENT_COMPLETE", childSessionId: "child1", status: "success", durationMs: 5000 });
    const agent = s.subAgents.get("child1")!;
    expect(agent.phase).toBe("completed");
    expect(agent.durationMs).toBe(5000);
    expect(agent.currentTool).toBeNull();
  });

  test("SUB_AGENT_COMPLETE with error status sets error phase", () => {
    let s = appReducer(state, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "child1",
      parentSessionId: "p",
      label: "R",
      agentType: "research",
    });
    s = appReducer(s, { type: "SUB_AGENT_COMPLETE", childSessionId: "child1", status: "error", durationMs: 2000 });
    expect(s.subAgents.get("child1")!.phase).toBe("error");
  });

  test("CLEAR_SUB_AGENTS resets map", () => {
    let s = appReducer(state, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "child1",
      parentSessionId: "p",
      label: "R",
      agentType: "research",
    });
    s = appReducer(s, { type: "CLEAR_SUB_AGENTS" });
    expect(s.subAgents.size).toBe(0);
  });

  // ── Compound: RESET_TURN ───────────────────────────────────────

  test("RESET_TURN resets all live state to idle", () => {
    let s = appReducer(state, { type: "SET_PHASE", phase: "streaming" });
    s = appReducer(s, { type: "APPEND_STREAM_TEXT", content: "partial" });
    s = appReducer(s, {
      type: "TOOL_CALL_START",
      toolCall: { id: "tc1", name: "read", args: {}, status: "running", startTime: Date.now() },
    });
    s = appReducer(s, { type: "SET_CURRENT_TOOL", name: "Read" });
    s = appReducer(s, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "child1",
      parentSessionId: "p",
      label: "R",
      agentType: "research",
    });

    s = appReducer(s, { type: "RESET_TURN" });
    expect(s.phase).toBe("idle");
    expect(s.streamText).toBe("");
    expect(s.liveToolCalls).toHaveLength(0);
    expect(s.currentTool).toBeUndefined();
    expect(s.subAgents.size).toBe(0);
  });

  test("RESET_TURN preserves messages, stats, model, context", () => {
    const msg = { id: "1", role: "user" as const, content: "hello", timestamp: 1 };
    let s = appReducer(state, { type: "ADD_MESSAGE", message: msg });
    s = appReducer(s, { type: "UPDATE_STATS", tokensIn: 100, tokensOut: 50, durationMs: 1000 });
    s = appReducer(s, { type: "SET_MODEL", model: "gpt-4o" });
    s = appReducer(s, { type: "UPDATE_CONTEXT", totalTokens: 5000 });

    s = appReducer(s, { type: "RESET_TURN" });
    expect(s.messages).toHaveLength(1);
    expect(s.stats.tokensIn).toBe(100);
    expect(s.model).toBe("gpt-4o");
    expect(s.context.totalTokens).toBe(5000);
  });

  // ── Default case ───────────────────────────────────────────────

  test("unknown action type returns state unchanged", () => {
    const next = appReducer(state, { type: "UNKNOWN_ACTION" } as unknown as AppAction);
    expect(next).toBe(state);
  });
});

// ===========================================================================
// 2. Initial State
// ===========================================================================

describe("createInitialState", () => {
  test("defaults to idle phase, claude model, new session", () => {
    const s = createInitialState({});
    expect(s.phase).toBe("idle");
    expect(s.model).toBe("claude");
    expect(s.sessionSlug).toBe("new");
    expect(s.messages).toHaveLength(0);
    expect(s.streamText).toBe("");
    expect(s.liveToolCalls).toHaveLength(0);
    expect(s.subAgents.size).toBe(0);
    expect(s.stats).toEqual(emptyStats());
    expect(s.context).toEqual(emptyContextInfo());
  });

  test("respects overrides", () => {
    const s = createInitialState({ phase: "wizard", model: "gpt-4o", sessionSlug: "test-slug" });
    expect(s.phase).toBe("wizard");
    expect(s.model).toBe("gpt-4o");
    expect(s.sessionSlug).toBe("test-slug");
  });
});

// ===========================================================================
// 3. Phase Type Guard
// ===========================================================================

describe("isPhase", () => {
  test("returns true for all valid phases", () => {
    const valid: Phase[] = ["idle", "thinking", "streaming", "tool-executing", "sub-executing", "wizard"];
    for (const p of valid) {
      expect(isPhase(p)).toBe(true);
    }
  });

  test("returns false for invalid values", () => {
    expect(isPhase("running")).toBe(false);
    expect(isPhase("")).toBe(false);
    expect(isPhase(null)).toBe(false);
    expect(isPhase(42)).toBe(false);
    expect(isPhase(undefined)).toBe(false);
  });
});

// ===========================================================================
// 4. Slash Command Parsing
// ===========================================================================

describe("parseSlashCommand", () => {
  test("parses simple command", () => {
    const result = parseSlashCommand("/help");
    expect(result).toEqual({ name: "/help", args: "" });
  });

  test("parses command with args", () => {
    const result = parseSlashCommand("/resume bold-nexus");
    expect(result).toEqual({ name: "/resume", args: "bold-nexus" });
  });

  test("handles leading whitespace", () => {
    const result = parseSlashCommand("  /help");
    expect(result).toEqual({ name: "/help", args: "" });
  });

  test("returns null for non-slash input", () => {
    expect(parseSlashCommand("hello world")).toBeNull();
    expect(parseSlashCommand("")).toBeNull();
  });

  test("returns null for exit commands starting with /", () => {
    expect(parseSlashCommand("/exit")).toBeNull();
    expect(parseSlashCommand("/quit")).toBeNull();
  });

  test("preserves multi-word args", () => {
    const result = parseSlashCommand("/model openrouter:deepseek-v3");
    expect(result).toEqual({ name: "/model", args: "openrouter:deepseek-v3" });
  });
});

// ===========================================================================
// 5. Exit Command Detection
// ===========================================================================

describe("isExitCommand", () => {
  test("recognizes exit commands", () => {
    expect(isExitCommand("exit")).toBe(true);
    expect(isExitCommand("quit")).toBe(true);
    expect(isExitCommand(".exit")).toBe(true);
    expect(isExitCommand("/exit")).toBe(true);
    expect(isExitCommand("/quit")).toBe(true);
  });

  test("handles whitespace", () => {
    expect(isExitCommand("  exit  ")).toBe(true);
    expect(isExitCommand("  quit  ")).toBe(true);
  });

  test("rejects non-exit input", () => {
    expect(isExitCommand("/help")).toBe(false);
    expect(isExitCommand("hello")).toBe(false);
    expect(isExitCommand("")).toBe(false);
  });
});

// ===========================================================================
// 6. Slash Command Completion
// ===========================================================================

describe("slashCompleter", () => {
  test("returns all commands for /", () => {
    const [completions, line] = slashCompleter("/");
    expect(completions.length).toBeGreaterThan(20);
    expect(line).toBe("/");
  });

  test("filters by prefix", () => {
    const [completions] = slashCompleter("/he");
    expect(completions).toContain("/help");
    expect(completions.every((c) => c.startsWith("/he"))).toBe(true);
  });

  test("returns empty for non-slash input", () => {
    const [completions, line] = slashCompleter("hello");
    expect(completions).toHaveLength(0);
    expect(line).toBe("hello");
  });

  test("returns all commands when no match found", () => {
    const [completions] = slashCompleter("/zzzzz");
    expect(completions.length).toBeGreaterThan(20);
  });
});

// ===========================================================================
// 7. Command Registry Consistency
// ===========================================================================

describe("command registry", () => {
  test("SLASH_COMMANDS has all expected commands", () => {
    const expected = [
      "/help", "/new", "/sessions", "/resume",
      "/history", "/clear", "/compact", "/share", "/kill", "/archive",
      "/model", "/channels",
      "/connectors",
      "/tasks", "/skills", "/notifications",
      "/plan", "/upgrade", "/billing", "/cost",
      "/onboard", "/status", "/sys", "/config", "/theme",
      "/stop",
    ];
    for (const cmd of expected) {
      expect(SLASH_COMMANDS.has(cmd)).toBe(true);
    }
  });

  test("COMMAND_CATEGORIES covers all SLASH_COMMANDS", () => {
    // Extract base command names from category entries
    const categoryCommands = new Set<string>();
    for (const cat of COMMAND_CATEGORIES) {
      for (const [cmdStr] of cat.commands) {
        const name = cmdStr.split(" ")[0]!;
        categoryCommands.add(name);
      }
    }
    // Every SLASH_COMMANDS entry should appear in categories
    // (some may be aliases like /models that only appear in SLASH_COMMANDS)
    for (const cmd of SLASH_COMMANDS.keys()) {
      // Aliases like /models and /switch may not be in categories directly
      if (cmd === "/models" || cmd === "/switch") continue;
      expect(categoryCommands.has(cmd)).toBe(true);
    }
  });

  test("HELP_ENTRIES is flattened from COMMAND_CATEGORIES", () => {
    let totalCommands = 0;
    for (const cat of COMMAND_CATEGORIES) {
      totalCommands += cat.commands.length;
    }
    expect(HELP_ENTRIES.length).toBe(totalCommands);
  });

  test("SUB_AGENT_TOOLS contains expected tool names", () => {
    expect(SUB_AGENT_TOOLS.has("delegate")).toBe(true);
    expect(SUB_AGENT_TOOLS.has("parallel_tasks")).toBe(true);
    expect(SUB_AGENT_TOOLS.size).toBe(2);
  });
});

// ===========================================================================
// 8. Autocomplete Logic
// ===========================================================================

describe("autocomplete", () => {
  const testCommands: ReadonlyMap<string, { description: string }> = new Map([
    ["/help", { description: "Show help" }],
    ["/health", { description: "Check health" }],
    ["/history", { description: "Show history" }],
    ["/model", { description: "Switch model" }],
    ["/models", { description: "List models" }],
  ]);

  describe("shouldShowAutocomplete", () => {
    test("shows for slash prefix without space", () => {
      expect(shouldShowAutocomplete("/")).toBe(true);
      expect(shouldShowAutocomplete("/he")).toBe(true);
      expect(shouldShowAutocomplete("/model")).toBe(true);
    });

    test("hides when space present (entering args)", () => {
      expect(shouldShowAutocomplete("/model gpt")).toBe(false);
      expect(shouldShowAutocomplete("/resume ")).toBe(false);
    });

    test("hides for non-slash input", () => {
      expect(shouldShowAutocomplete("hello")).toBe(false);
      expect(shouldShowAutocomplete("")).toBe(false);
    });

    test("handles leading whitespace with slash", () => {
      expect(shouldShowAutocomplete("  /he")).toBe(true);
    });
  });

  describe("filterCommands", () => {
    test("filters by prefix", () => {
      const items = filterCommands("/he", testCommands);
      expect(items.length).toBe(2);
      expect(items.map((i) => i.name)).toContain("/help");
      expect(items.map((i) => i.name)).toContain("/health");
    });

    test("returns all for just /", () => {
      const items = filterCommands("/", testCommands);
      expect(items.length).toBe(5);
    });

    test("case insensitive", () => {
      const items = filterCommands("/HE", testCommands);
      expect(items.length).toBe(2);
    });

    test("returns empty for no match", () => {
      const items = filterCommands("/zz", testCommands);
      expect(items.length).toBe(0);
    });
  });

  describe("navigateSelection", () => {
    test("moves down", () => {
      const state: AutocompleteState = {
        items: [{ name: "/a", description: "" }, { name: "/b", description: "" }],
        selectedIndex: 0,
        visible: true,
      };
      expect(navigateSelection(state, "down")).toBe(1);
    });

    test("wraps down to 0", () => {
      const state: AutocompleteState = {
        items: [{ name: "/a", description: "" }, { name: "/b", description: "" }],
        selectedIndex: 1,
        visible: true,
      };
      expect(navigateSelection(state, "down")).toBe(0);
    });

    test("moves up", () => {
      const state: AutocompleteState = {
        items: [{ name: "/a", description: "" }, { name: "/b", description: "" }],
        selectedIndex: 1,
        visible: true,
      };
      expect(navigateSelection(state, "up")).toBe(0);
    });

    test("wraps up to last", () => {
      const state: AutocompleteState = {
        items: [{ name: "/a", description: "" }, { name: "/b", description: "" }],
        selectedIndex: 0,
        visible: true,
      };
      expect(navigateSelection(state, "up")).toBe(1);
    });

    test("returns -1 for empty items", () => {
      const state: AutocompleteState = { items: [], selectedIndex: -1, visible: false };
      expect(navigateSelection(state, "down")).toBe(-1);
      expect(navigateSelection(state, "up")).toBe(-1);
    });
  });

  describe("emptyAutocompleteState", () => {
    test("returns correct defaults", () => {
      const s = emptyAutocompleteState();
      expect(s.items).toHaveLength(0);
      expect(s.selectedIndex).toBe(-1);
      expect(s.visible).toBe(false);
    });
  });

  describe("computeAutocompleteState", () => {
    test("returns visible state with items for valid prefix", () => {
      const s = computeAutocompleteState("/he", testCommands);
      expect(s.visible).toBe(true);
      expect(s.items.length).toBe(2);
      expect(s.selectedIndex).toBe(0);
    });

    test("returns empty for non-matching prefix", () => {
      const s = computeAutocompleteState("/zz", testCommands);
      expect(s.visible).toBe(false);
      expect(s.items).toHaveLength(0);
    });

    test("returns empty for non-slash input", () => {
      const s = computeAutocompleteState("hello", testCommands);
      expect(s.visible).toBe(false);
    });
  });
});

// ===========================================================================
// 9. Autocomplete Visible Window
// ===========================================================================

describe("computeVisibleWindow", () => {
  test("shows all items when fewer than maxVisible", () => {
    const { start, end } = computeVisibleWindow(5, 2, 8);
    expect(start).toBe(0);
    expect(end).toBe(5);
  });

  test("scrolls to center selected item", () => {
    const { start, end } = computeVisibleWindow(20, 10, 8);
    expect(end - start).toBe(8);
    // Selected item (10) should be within the window
    expect(start).toBeLessThanOrEqual(10);
    expect(end).toBeGreaterThan(10);
  });

  test("clamps at beginning", () => {
    const { start, end } = computeVisibleWindow(20, 0, 8);
    expect(start).toBe(0);
    expect(end).toBe(8);
  });

  test("clamps at end", () => {
    const { start, end } = computeVisibleWindow(20, 19, 8);
    expect(end).toBe(20);
    expect(start).toBe(12);
  });
});

// ===========================================================================
// 10. Cost Calculation
// ===========================================================================

describe("cost", () => {
  describe("getModelRates", () => {
    test("matches Claude models", () => {
      const sonnet = getModelRates("claude-sonnet-4-20250514");
      expect(sonnet.inputPerMillion).toBe(3);
      expect(sonnet.outputPerMillion).toBe(15);

      const opus = getModelRates("claude-opus-4-20250514");
      expect(opus.inputPerMillion).toBe(15);
      expect(opus.outputPerMillion).toBe(75);
    });

    test("matches GPT models", () => {
      const gpt4o = getModelRates("gpt-4o-2024-05-13");
      expect(gpt4o.inputPerMillion).toBe(2.5);

      const mini = getModelRates("gpt-4o-mini");
      expect(mini.inputPerMillion).toBe(0.15);
    });

    test("matches generic claude prefix", () => {
      const rates = getModelRates("claude");
      expect(rates.inputPerMillion).toBe(3);
    });

    test("local/ollama models are free", () => {
      expect(getModelRates("ollama-llama3").inputPerMillion).toBe(0);
      expect(getModelRates("local-model").inputPerMillion).toBe(0);
    });

    test("unknown models get default rates", () => {
      const rates = getModelRates("some-unknown-model");
      expect(rates.inputPerMillion).toBe(3);
      expect(rates.outputPerMillion).toBe(15);
    });
  });

  describe("estimateModelCost", () => {
    test("calculates cost correctly", () => {
      // 1M tokens in + 1M tokens out for claude-sonnet
      const cost = estimateModelCost(1_000_000, 1_000_000, "claude-sonnet-4");
      expect(cost).toBeCloseTo(18, 1); // $3 in + $15 out
    });

    test("zero tokens = zero cost", () => {
      expect(estimateModelCost(0, 0, "claude")).toBe(0);
    });

    test("local models are free", () => {
      expect(estimateModelCost(100000, 50000, "ollama")).toBe(0);
    });
  });

  describe("formatModelCost", () => {
    test("formats normal costs", () => {
      expect(formatModelCost(0.12)).toBe("$0.12");
      expect(formatModelCost(1.5)).toBe("$1.50");
    });

    test("formats zero", () => {
      expect(formatModelCost(0)).toBe("$0.00");
    });

    test("formats very small costs with 4 decimals", () => {
      expect(formatModelCost(0.0023)).toBe("$0.0023");
    });
  });
});

// ===========================================================================
// 11. Input History
// ===========================================================================

describe("InputHistory", () => {
  let history: InputHistory;

  beforeEach(() => {
    history = new InputHistory({ filePath: null, maxSize: 5 });
  });

  test("starts empty", () => {
    expect(history.isEmpty).toBe(true);
    expect(history.length).toBe(0);
  });

  test("push adds entries", () => {
    history.push("hello");
    expect(history.length).toBe(1);
    expect(history.get(0)).toBe("hello");
  });

  test("push trims whitespace", () => {
    history.push("  hello  ");
    expect(history.get(0)).toBe("hello");
  });

  test("push skips empty strings", () => {
    history.push("");
    history.push("   ");
    expect(history.length).toBe(0);
  });

  test("push deduplicates consecutive", () => {
    history.push("hello");
    history.push("hello");
    expect(history.length).toBe(1);
  });

  test("push allows non-consecutive duplicates", () => {
    history.push("hello");
    history.push("world");
    history.push("hello");
    expect(history.length).toBe(3);
  });

  test("push enforces maxSize", () => {
    for (let i = 0; i < 10; i++) {
      history.push(`entry-${i}`);
    }
    expect(history.length).toBe(5);
    // Should keep the last 5
    expect(history.get(0)).toBe("entry-5");
    expect(history.get(4)).toBe("entry-9");
  });

  test("prev navigates backward", () => {
    history.push("a");
    history.push("b");
    history.push("c");

    let idx = history.length; // draft position (3)
    idx = history.prev(idx);  // → 2 (last entry "c")
    expect(idx).toBe(2);
    expect(history.get(idx)).toBe("c");

    idx = history.prev(idx);  // → 1 ("b")
    expect(idx).toBe(1);
    expect(history.get(idx)).toBe("b");

    idx = history.prev(idx);  // → 0 ("a")
    expect(idx).toBe(0);

    idx = history.prev(idx);  // stays at 0
    expect(idx).toBe(0);
  });

  test("next navigates forward", () => {
    history.push("a");
    history.push("b");
    let idx = 0;
    idx = history.next(idx);
    expect(idx).toBe(1);
    idx = history.next(idx);
    expect(idx).toBe(2); // draft position
    idx = history.next(idx);
    expect(idx).toBe(2); // stays at draft
  });

  test("get returns empty for out-of-bounds", () => {
    history.push("a");
    expect(history.get(-1)).toBe("");
    expect(history.get(1)).toBe(""); // draft position
    expect(history.get(100)).toBe("");
  });

  test("clear removes all entries", () => {
    history.push("a");
    history.push("b");
    history.clear();
    expect(history.length).toBe(0);
    expect(history.isEmpty).toBe(true);
  });

  test("toArray returns copy", () => {
    history.push("a");
    history.push("b");
    const arr = history.toArray();
    expect(arr).toEqual(["a", "b"]);
    arr.push("c"); // mutating copy
    expect(history.length).toBe(2); // original unchanged
  });
});

// ===========================================================================
// 12. Markdown Rendering
// ===========================================================================

describe("renderMarkdown", () => {
  test("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  test("renders plain text unchanged (no markdown patterns)", () => {
    const text = "Hello world";
    const rendered = renderMarkdown(text);
    // Should contain the original text (may have ANSI wrappers)
    expect(rendered).toContain("Hello world");
  });

  test("renders bold text", () => {
    const rendered = renderMarkdown("**bold text**");
    // Should contain the text (bold is applied via chalk)
    expect(rendered).toContain("bold text");
    // Should NOT contain the ** markers
    expect(rendered).not.toContain("**");
  });

  test("renders italic text", () => {
    const rendered = renderMarkdown("_italic text_");
    expect(rendered).toContain("italic text");
    // The underscore markers should be consumed
  });

  test("renders inline code", () => {
    const rendered = renderMarkdown("use `npm install` to install");
    expect(rendered).toContain("npm install");
  });

  test("renders code blocks", () => {
    const md = "```js\nconst x = 1;\n```";
    const rendered = renderMarkdown(md);
    expect(rendered).toContain("const");
    expect(rendered).toContain("x");
    expect(rendered).toContain("1");
  });

  test("renders headers", () => {
    const rendered = renderMarkdown("# Main Header");
    expect(rendered).toContain("Main Header");
  });

  test("renders unordered lists", () => {
    const rendered = renderMarkdown("- item one\n- item two");
    expect(rendered).toContain("item one");
    expect(rendered).toContain("item two");
  });

  test("renders blockquotes", () => {
    const rendered = renderMarkdown("> quoted text");
    expect(rendered).toContain("quoted text");
  });

  test("renders links", () => {
    const rendered = renderMarkdown("[click here](https://example.com)");
    expect(rendered).toContain("click here");
    expect(rendered).toContain("example.com");
  });

  test("renders strikethrough", () => {
    const rendered = renderMarkdown("~~deleted~~");
    expect(rendered).toContain("deleted");
  });

  test("handles unclosed code blocks", () => {
    const md = "```js\nconst x = 1;";
    // Should not throw
    const rendered = renderMarkdown(md);
    expect(rendered).toContain("const");
  });
});

// ===========================================================================
// 13. Syntax Highlighting
// ===========================================================================

describe("syntax highlighting", () => {
  test("supportedLanguages returns expected languages", () => {
    const langs = supportedLanguages();
    expect(langs).toContain("js");
    expect(langs).toContain("typescript");
    expect(langs).toContain("python");
    expect(langs).toContain("bash");
    expect(langs).toContain("json");
    expect(langs).toContain("sql");
    expect(langs).toContain("go");
  });

  test("highlightCode returns string for known language", () => {
    const result = highlightCode("const x = 42;", "js");
    expect(typeof result).toBe("string");
    expect(result).toContain("const");
    expect(result).toContain("42");
  });

  test("highlightCode handles unknown language gracefully", () => {
    const result = highlightCode("some code", "brainfuck");
    expect(typeof result).toBe("string");
    expect(result).toContain("some code");
  });

  test("highlightCode processes Python", () => {
    const result = highlightCode("def hello():\n  return True", "python");
    expect(result).toContain("def");
    expect(result).toContain("hello");
    expect(result).toContain("True");
  });

  test("highlightCode processes JSON", () => {
    const result = highlightCode('{"key": "value", "count": 42}', "json");
    expect(result).toContain("key");
    expect(result).toContain("value");
    expect(result).toContain("42");
  });

  test("highlightCode processes bash", () => {
    const result = highlightCode("echo $HOME", "bash");
    expect(result).toContain("echo");
    expect(result).toContain("$HOME");
  });

  test("highlightCode handles empty string", () => {
    const result = highlightCode("", "js");
    expect(result).toBe("");
  });
});

// ===========================================================================
// 14. Context Bar Computation
// ===========================================================================

describe("computeContextBar", () => {
  test("hidden below 50% usage", () => {
    const bar = computeContextBar(50000, { totalTokens: 50000, maxTokens: 200000, compactionCount: 0 });
    expect(bar.visible).toBe(false);
  });

  test("visible at 50% usage", () => {
    const bar = computeContextBar(100000, { totalTokens: 100000, maxTokens: 200000, compactionCount: 0 });
    expect(bar.visible).toBe(true);
    expect(bar.percentage).toBeCloseTo(0.5, 2);
  });

  test("warning tone below 80%", () => {
    // Subsystem 5 changed computeContextBar to return a semantic Tone
    // instead of a hex color, so this bar is now theme-invariant.
    const bar = computeContextBar(120000, { totalTokens: 120000, maxTokens: 200000, compactionCount: 0 });
    expect(bar.visible).toBe(true);
    expect(bar.tone).toBe("warning");
  });

  test("error tone at 80%+", () => {
    const bar = computeContextBar(180000, { totalTokens: 180000, maxTokens: 200000, compactionCount: 0 });
    expect(bar.visible).toBe(true);
    expect(bar.tone).toBe("error");
  });

  test("hidden when maxTokens is 0", () => {
    const bar = computeContextBar(1000, { totalTokens: 1000, maxTokens: 0, compactionCount: 0 });
    expect(bar.visible).toBe(false);
  });

  test("caps at 100%", () => {
    const bar = computeContextBar(300000, { totalTokens: 300000, maxTokens: 200000, compactionCount: 0 });
    expect(bar.percentage).toBe(1);
    expect(bar.filledWidth).toBe(30);
  });

  test("shows compaction count in label", () => {
    const bar = computeContextBar(120000, { totalTokens: 120000, maxTokens: 200000, compactionCount: 3 });
    expect(bar.label).toContain("compacted 3x");
  });
});

// ===========================================================================
// 15. Sub-Agent Derived State
// ===========================================================================

describe("deriveSubAgentState", () => {
  function makeAgent(overrides: Partial<SubAgentState> = {}): SubAgentState {
    return {
      childSessionId: "c1",
      parentSessionId: "p1",
      label: "Test",
      agentType: "general",
      phase: "running",
      currentTool: null,
      streamPreview: "",
      toolCallCount: 0,
      startTime: Date.now(),
      ...overrides,
    };
  }

  test("empty map returns zeros", () => {
    const derived = deriveSubAgentState(new Map());
    expect(derived.total).toBe(0);
    expect(derived.runningCount).toBe(0);
    expect(derived.completedCount).toBe(0);
    expect(derived.errorCount).toBe(0);
    expect(derived.hasRunning).toBe(false);
    expect(derived.sorted).toHaveLength(0);
  });

  test("counts by phase", () => {
    const agents = new Map<string, SubAgentState>([
      ["a", makeAgent({ childSessionId: "a", phase: "running" })],
      ["b", makeAgent({ childSessionId: "b", phase: "completed" })],
      ["c", makeAgent({ childSessionId: "c", phase: "error" })],
      ["d", makeAgent({ childSessionId: "d", phase: "running" })],
    ]);
    const derived = deriveSubAgentState(agents);
    expect(derived.total).toBe(4);
    expect(derived.runningCount).toBe(2);
    expect(derived.completedCount).toBe(1);
    expect(derived.errorCount).toBe(1);
    expect(derived.hasRunning).toBe(true);
  });

  test("sorts running first, then completed, then error", () => {
    const agents = new Map<string, SubAgentState>([
      ["a", makeAgent({ childSessionId: "a", phase: "error", startTime: 100 })],
      ["b", makeAgent({ childSessionId: "b", phase: "running", startTime: 200 })],
      ["c", makeAgent({ childSessionId: "c", phase: "completed", startTime: 50 })],
    ]);
    const derived = deriveSubAgentState(agents);
    expect(derived.sorted[0]!.phase).toBe("running");
    expect(derived.sorted[1]!.phase).toBe("completed");
    expect(derived.sorted[2]!.phase).toBe("error");
  });

  test("secondary sort by startTime within same phase", () => {
    const agents = new Map<string, SubAgentState>([
      ["a", makeAgent({ childSessionId: "a", phase: "running", startTime: 300 })],
      ["b", makeAgent({ childSessionId: "b", phase: "running", startTime: 100 })],
      ["c", makeAgent({ childSessionId: "c", phase: "running", startTime: 200 })],
    ]);
    const derived = deriveSubAgentState(agents);
    expect(derived.sorted[0]!.childSessionId).toBe("b"); // earliest
    expect(derived.sorted[1]!.childSessionId).toBe("c");
    expect(derived.sorted[2]!.childSessionId).toBe("a"); // latest
  });
});

describe("getAgentTypeColor", () => {
  test("returns known semantic tones", () => {
    // Subsystem 5 migrated AGENT_TYPE_COLORS from PALETTE-alias strings
    // (cyan/green/blue/red) to semantic Tone literals (info/success/tool/error).
    // The function name is retained as a back-compat alias of getAgentTypeTone.
    expect(getAgentTypeColor("research")).toBe("info");
    expect(getAgentTypeColor("task")).toBe("success");
    expect(getAgentTypeColor("explore")).toBe("tool");
    expect(getAgentTypeColor("plan")).toBe("purple");
    expect(getAgentTypeColor("general")).toBe("text");
  });

  test("falls back for unknown types", () => {
    const color = getAgentTypeColor("unknown-type");
    expect(typeof color).toBe("string");
    expect(color.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 16. Format Helpers
// ===========================================================================

describe("format helpers", () => {
  describe("formatTokens", () => {
    test("small numbers as-is", () => {
      expect(formatTokens(0)).toBe("0");
      expect(formatTokens(999)).toBe("999");
    });

    test("thousands with k suffix", () => {
      expect(formatTokens(1200)).toBe("1.2k");
      expect(formatTokens(5000)).toBe("5.0k");
      expect(formatTokens(9999)).toBe("10.0k");
    });

    test("large numbers rounded", () => {
      expect(formatTokens(15000)).toBe("15k");
      expect(formatTokens(200000)).toBe("200k");
    });
  });

  describe("formatDuration", () => {
    test("sub-second", () => {
      expect(formatDuration(500)).toBe("0.5s");
    });

    test("seconds", () => {
      expect(formatDuration(3200)).toBe("3.2s");
    });

    test("minutes", () => {
      expect(formatDuration(125000)).toBe("2m 5s");
    });
  });

  describe("capitalize", () => {
    test("capitalizes first letter", () => {
      expect(capitalize("hello")).toBe("Hello");
      expect(capitalize("HELLO")).toBe("HELLO");
    });

    test("handles empty string", () => {
      expect(capitalize("")).toBe("");
    });
  });

  describe("pluralize", () => {
    test("singular for 1", () => {
      expect(pluralize(1, "item")).toBe("1 item");
    });

    test("plural for 0 and >1", () => {
      expect(pluralize(0, "item")).toBe("0 items");
      expect(pluralize(5, "item")).toBe("5 items");
    });
  });

  describe("shortenHome", () => {
    test("replaces home directory with ~", () => {
      const home = process.env.HOME || "/Users/test";
      const shortened = shortenHome(`${home}/projects/test`);
      expect(shortened).toContain("~");
      expect(shortened).toContain("projects/test");
    });

    test("returns non-home paths unchanged", () => {
      expect(shortenHome("/etc/config")).toBe("/etc/config");
    });
  });

  describe("extractToolSummary", () => {
    test("extracts file_path from args object", () => {
      expect(extractToolSummary({ file_path: "/src/app.tsx" })).toBe("/src/app.tsx");
    });

    test("extracts command from args object", () => {
      expect(extractToolSummary({ command: "npm test" })).toBe("npm test");
    });

    test("handles string args", () => {
      const result = extractToolSummary("some-string");
      expect(typeof result).toBe("string");
    });
  });

  describe("truncateResult", () => {
    test("short text unchanged", () => {
      expect(truncateResult("hello")).toBe("hello");
    });

    test("long text truncated", () => {
      const longText = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
      const result = truncateResult(longText, 5);
      const lines = result.split("\n");
      expect(lines.length).toBeLessThanOrEqual(6); // 5 + possible truncation indicator
    });
  });

  describe("safeParseJson", () => {
    test("parses valid JSON", () => {
      const result = safeParseJson('{"ok":true,"data":"test"}');
      expect(result.ok).toBe(true);
      expect(result.data).toBe("test");
    });

    test("returns empty object for invalid JSON", () => {
      const result = safeParseJson("not json");
      expect(typeof result).toBe("object");
    });
  });

  describe("formatError", () => {
    test("formats error message", () => {
      const result = formatError("Something went wrong");
      expect(result).toContain("Something went wrong");
    });
  });

  describe("estimateCost", () => {
    test("calculates with default rates", () => {
      // 1M in + 1M out at default Claude rates ($3/$15 per M)
      const cost = estimateCost(1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(18, 1);
    });

    test("calculates with custom rates", () => {
      const cost = estimateCost(1_000_000, 1_000_000, 10, 30);
      expect(cost).toBe(40);
    });
  });

  describe("formatCost", () => {
    test("formats dollar amounts", () => {
      expect(formatCost(0)).toBe("$0.00");
      expect(formatCost(1.5)).toBe("$1.50");
      expect(formatCost(0.123)).toBe("$0.12");
    });
  });
});

// ===========================================================================
// 17. Setup Validation
// ===========================================================================

describe("setup", () => {
  describe("validateApiKey", () => {
    test("accepts valid keys", () => {
      expect(validateApiKey("sk-abcdefghij")).toBe(true);
      expect(validateApiKey("a".repeat(50))).toBe(true);
    });

    test("rejects short keys", () => {
      expect(validateApiKey("short")).toBe(false);
      expect(validateApiKey("")).toBe(false);
    });

    test("rejects keys with whitespace", () => {
      expect(validateApiKey("key with spaces")).toBe(false);
      expect(validateApiKey("key\twith\ttabs")).toBe(false);
    });
  });

  describe("getProviderOptions", () => {
    test("returns at least built-in providers", () => {
      const providers = getProviderOptions();
      expect(providers.length).toBeGreaterThanOrEqual(3);
      const ids = providers.map((p) => p.id);
      expect(ids).toContain("anthropic");
      expect(ids).toContain("openai");
      expect(ids).toContain("local");
    });

    test("local provider does not need API key", () => {
      const providers = getProviderOptions();
      const local = providers.find((p) => p.id === "local");
      expect(local).toBeDefined();
      expect(local!.needsApiKey).toBe(false);
    });
  });

  describe("PROVIDER_OPTIONS", () => {
    test("static subset has 3 built-in providers", () => {
      expect(PROVIDER_OPTIONS).toHaveLength(3);
    });
  });
});

// ===========================================================================
// 18. Theme Integrity
// ===========================================================================

describe("theme", () => {
  test("PALETTE has required color keys", () => {
    const required = ["brand", "brandDim", "text", "muted", "dim", "faint", "tool", "success", "error", "warning", "info", "purple"];
    for (const key of required) {
      expect(typeof (PALETTE as Record<string, string>)[key]).toBe("string");
      expect((PALETTE as Record<string, string>)[key]!.startsWith("#")).toBe(true);
    }
  });

  test("PALETTE backward compat aliases resolve", () => {
    // blue, green, red, yellow, cyan should resolve via Object.defineProperties
    expect(typeof PALETTE.blue).toBe("string");
    expect(typeof PALETTE.green).toBe("string");
    expect(typeof PALETTE.red).toBe("string");
    expect(typeof PALETTE.yellow).toBe("string");
    expect(typeof PALETTE.cyan).toBe("string");
  });

  test("ICONS has required symbols", () => {
    const required = ["success", "error", "tool", "result", "cursor", "filled", "empty", "dot", "arrow"];
    for (const key of required) {
      expect(typeof (ICONS as Record<string, string>)[key]).toBe("string");
    }
  });
});

// ===========================================================================
// 19. Full Turn Lifecycle (Integration)
// ===========================================================================

describe("full turn lifecycle", () => {
  test("idle → thinking → streaming → tool-executing → freeze → idle", () => {
    let s = createInitialState({});

    // User message
    s = appReducer(s, {
      type: "ADD_MESSAGE",
      message: { id: "u1", role: "user", content: "What is 2+2?", timestamp: 1 },
    });

    // Enter thinking
    s = appReducer(s, { type: "SET_PHASE", phase: "thinking" });
    s = appReducer(s, { type: "CLEAR_STREAM" });
    s = appReducer(s, { type: "CLEAR_TOOL_CALLS" });
    expect(s.phase).toBe("thinking");

    // Streaming begins
    s = appReducer(s, { type: "SET_PHASE", phase: "streaming" });
    s = appReducer(s, { type: "APPEND_STREAM_TEXT", content: "Let me " });
    s = appReducer(s, { type: "APPEND_STREAM_TEXT", content: "check." });
    expect(s.streamText).toBe("Let me check.");
    expect(s.phase).toBe("streaming");

    // Tool call
    s = appReducer(s, { type: "SET_PHASE", phase: "tool-executing" });
    s = appReducer(s, { type: "SET_CURRENT_TOOL", name: "Calculator" });
    const tc: DisplayToolCall = {
      id: "tc1", name: "calculator", args: { expr: "2+2" },
      status: "running", startTime: Date.now(),
    };
    s = appReducer(s, { type: "TOOL_CALL_START", toolCall: tc });
    expect(s.liveToolCalls).toHaveLength(1);

    // Tool result
    s = appReducer(s, { type: "TOOL_CALL_RESULT", id: "tc1", result: "4", isError: false });
    expect(s.liveToolCalls[0]!.status).toBe("completed");

    // More streaming
    s = appReducer(s, { type: "SET_PHASE", phase: "streaming" });
    s = appReducer(s, { type: "APPEND_STREAM_TEXT", content: " The answer is 4." });

    // Freeze and reset
    s = appReducer(s, {
      type: "FREEZE_ASSISTANT_MESSAGE",
      id: "a1",
      text: "Let me check. The answer is 4.",
      toolCalls: [{ ...tc, result: "4", isError: false, status: "completed" as const }],
    });
    s = appReducer(s, { type: "UPDATE_STATS", tokensIn: 100, tokensOut: 50, durationMs: 2000 });
    s = appReducer(s, { type: "UPDATE_CONTEXT", totalTokens: 150 });
    s = appReducer(s, { type: "RESET_TURN" });

    // Final state
    expect(s.phase).toBe("idle");
    expect(s.messages).toHaveLength(2); // user + assistant
    expect(s.messages[1]!.role).toBe("assistant");
    expect(s.messages[1]!.content).toBe("Let me check. The answer is 4.");
    expect(s.messages[1]!.toolCalls).toHaveLength(1);
    expect(s.stats.turns).toBe(1);
    expect(s.stats.tokensIn).toBe(100);
    expect(s.streamText).toBe("");
    expect(s.liveToolCalls).toHaveLength(0);
  });

  test("interrupt during streaming resets to idle", () => {
    let s = createInitialState({});
    s = appReducer(s, { type: "SET_PHASE", phase: "streaming" });
    s = appReducer(s, { type: "APPEND_STREAM_TEXT", content: "partial response" });

    // Interrupt
    s = appReducer(s, { type: "RESET_TURN" });
    expect(s.phase).toBe("idle");
    expect(s.streamText).toBe("");
  });

  test("sub-agent lifecycle", () => {
    let s = createInitialState({});
    s = appReducer(s, { type: "SET_PHASE", phase: "sub-executing" });

    // Start two sub-agents
    s = appReducer(s, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "a", parentSessionId: "p",
      label: "Research", agentType: "research",
    });
    s = appReducer(s, {
      type: "SUB_AGENT_STARTED",
      childSessionId: "b", parentSessionId: "p",
      label: "Explore", agentType: "explore",
    });
    expect(s.subAgents.size).toBe(2);

    // Agent A does work
    s = appReducer(s, { type: "SUB_AGENT_TOOL_CALL", childSessionId: "a", toolName: "search" });
    s = appReducer(s, { type: "SUB_AGENT_TEXT_DELTA", childSessionId: "a", content: "Searching..." });
    s = appReducer(s, { type: "SUB_AGENT_TOOL_RESULT", childSessionId: "a", toolCallId: "t1", isError: false });

    // Agent A completes
    s = appReducer(s, { type: "SUB_AGENT_COMPLETE", childSessionId: "a", status: "success", durationMs: 3000 });
    expect(s.subAgents.get("a")!.phase).toBe("completed");
    expect(s.subAgents.get("b")!.phase).toBe("running");

    // Agent B fails
    s = appReducer(s, { type: "SUB_AGENT_COMPLETE", childSessionId: "b", status: "error", durationMs: 1000 });
    expect(s.subAgents.get("b")!.phase).toBe("error");

    // Reset
    s = appReducer(s, { type: "RESET_TURN" });
    expect(s.subAgents.size).toBe(0);
  });
});
