// Unit tests — Conversation history management.
//
// Tests turn grouping, token-based trimming, message-based trimming,
// in-loop compaction, tool call/result pair integrity, and constants.

import { describe, test, expect } from "bun:test";
import {
  groupIntoTurns,
  trimHistory,
  compactHistory,
  sanitizeToolPairs,
  estimateTurnTokens,
  type Turn,
} from "../../src/daemon/agent/history.js";
import {
  DEFAULT_CONTEXT_LIMIT,
  PRE_TRIM_CONTEXT_RATIO,
  COMPACTION_CONTEXT_RATIO,
  COMPACT_TARGET_RATIO,
  MIN_MESSAGES_FOR_COMPACTION,
} from "../../src/shared/tokens.js";
import type { DriverMessage } from "../../src/daemon/agent/drivers/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msg(role: DriverMessage["role"], content: string, extras?: Partial<DriverMessage>): DriverMessage {
  return { role, content, ...extras };
}

function toolCallMsg(content: string, calls: Array<{ id: string; name: string; arguments: string }>): DriverMessage {
  return { role: "assistant", content, tool_calls: calls };
}

function toolResultMsg(content: string, callId: string): DriverMessage {
  return { role: "tool", content, tool_call_id: callId };
}

/** Build a conversation with a known number of user/assistant turn pairs. */
function buildConversation(turnPairs: number, contentSize = 10): DriverMessage[] {
  const messages: DriverMessage[] = [msg("system", "you are helpful")];
  for (let i = 0; i < turnPairs; i++) {
    messages.push(msg("user", "q".repeat(contentSize)));
    messages.push(msg("assistant", "a".repeat(contentSize)));
  }
  return messages;
}

/** Build a conversation with tool call rounds. */
function buildToolConversation(rounds: number): DriverMessage[] {
  const messages: DriverMessage[] = [msg("system", "prompt")];
  for (let i = 0; i < rounds; i++) {
    messages.push(msg("user", `task ${i}`));
    messages.push(toolCallMsg("", [{ id: `tc${i}`, name: "bash", arguments: `{"cmd":"echo ${i}"}` }]));
    messages.push(toolResultMsg(`result ${i}`, `tc${i}`));
    messages.push(msg("assistant", `done with task ${i}`));
  }
  return messages;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("context management constants", () => {
  test("DEFAULT_CONTEXT_LIMIT is a reasonable fallback", () => {
    expect(DEFAULT_CONTEXT_LIMIT).toBe(24_000);
  });

  test("PRE_TRIM_CONTEXT_RATIO leaves headroom for response", () => {
    expect(PRE_TRIM_CONTEXT_RATIO).toBe(0.6);
    expect(PRE_TRIM_CONTEXT_RATIO).toBeLessThan(1);
  });

  test("COMPACTION_CONTEXT_RATIO triggers before context overflows", () => {
    expect(COMPACTION_CONTEXT_RATIO).toBe(0.75);
    expect(COMPACTION_CONTEXT_RATIO).toBeGreaterThan(PRE_TRIM_CONTEXT_RATIO);
    expect(COMPACTION_CONTEXT_RATIO).toBeLessThan(1);
  });

  test("COMPACT_TARGET_RATIO is tighter than pre-trim (aggressive post-compaction)", () => {
    expect(COMPACT_TARGET_RATIO).toBe(0.5);
    expect(COMPACT_TARGET_RATIO).toBeLessThan(PRE_TRIM_CONTEXT_RATIO);
  });

  test("MIN_MESSAGES_FOR_COMPACTION prevents thrashing", () => {
    expect(MIN_MESSAGES_FOR_COMPACTION).toBe(5);
    expect(MIN_MESSAGES_FOR_COMPACTION).toBeGreaterThan(0);
  });

  test("ratios form a coherent progression: target < pre-trim < compaction < 1.0", () => {
    expect(COMPACT_TARGET_RATIO).toBeLessThan(PRE_TRIM_CONTEXT_RATIO);
    expect(PRE_TRIM_CONTEXT_RATIO).toBeLessThan(COMPACTION_CONTEXT_RATIO);
    expect(COMPACTION_CONTEXT_RATIO).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// groupIntoTurns
// ---------------------------------------------------------------------------

describe("groupIntoTurns", () => {
  test("groups standalone messages into single-element turns", () => {
    const messages: DriverMessage[] = [
      msg("user", "hello"),
      msg("assistant", "hi there"),
      msg("user", "how are you"),
      msg("assistant", "good"),
    ];

    const turns = groupIntoTurns(messages);
    expect(turns).toHaveLength(4);
    expect(turns[0]).toHaveLength(1);
    expect(turns[1]).toHaveLength(1);
  });

  test("groups assistant with tool_calls and following tool results as one turn", () => {
    const messages: DriverMessage[] = [
      msg("user", "search for something"),
      toolCallMsg("", [
        { id: "tc1", name: "bash", arguments: '{"command": "ls"}' },
        { id: "tc2", name: "read", arguments: '{"path": "/tmp"}' },
      ]),
      toolResultMsg("file1.txt", "tc1"),
      toolResultMsg("/tmp contents", "tc2"),
      msg("assistant", "done"),
    ];

    const turns = groupIntoTurns(messages);
    expect(turns).toHaveLength(3);
    // Turn 0: user message
    expect(turns[0]).toHaveLength(1);
    expect(turns[0]![0]!.role).toBe("user");
    // Turn 1: assistant + 2 tool results
    expect(turns[1]).toHaveLength(3);
    expect(turns[1]![0]!.role).toBe("assistant");
    expect(turns[1]![1]!.role).toBe("tool");
    expect(turns[1]![2]!.role).toBe("tool");
    // Turn 2: final assistant
    expect(turns[2]).toHaveLength(1);
    expect(turns[2]![0]!.role).toBe("assistant");
  });

  test("handles multiple consecutive tool call rounds", () => {
    const messages: DriverMessage[] = [
      msg("user", "do two things"),
      toolCallMsg("", [{ id: "tc1", name: "bash", arguments: "{}" }]),
      toolResultMsg("result1", "tc1"),
      toolCallMsg("", [{ id: "tc2", name: "read", arguments: "{}" }]),
      toolResultMsg("result2", "tc2"),
      msg("assistant", "all done"),
    ];

    const turns = groupIntoTurns(messages);
    expect(turns).toHaveLength(4);
    expect(turns[1]).toHaveLength(2);
    expect(turns[2]).toHaveLength(2);
  });

  test("handles empty array", () => {
    expect(groupIntoTurns([])).toHaveLength(0);
  });

  test("handles system messages as standalone turns", () => {
    const messages: DriverMessage[] = [
      msg("system", "you are helpful"),
      msg("user", "hello"),
    ];

    const turns = groupIntoTurns(messages);
    expect(turns).toHaveLength(2);
    expect(turns[0]![0]!.role).toBe("system");
  });
});

// ---------------------------------------------------------------------------
// estimateTurnTokens
// ---------------------------------------------------------------------------

describe("estimateTurnTokens", () => {
  test("estimates tokens for a single message turn", () => {
    const turn: Turn = [msg("user", "hello world")]; // 11 chars → ~3 tokens
    const tokens = estimateTurnTokens(turn);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(Math.ceil(11 / 4));
  });

  test("estimates tokens for a multi-message turn (tool call group)", () => {
    const turn: Turn = [
      toolCallMsg("thinking", [{ id: "tc1", name: "bash", arguments: '{"cmd": "ls"}' }]),
      toolResultMsg("file1\nfile2\nfile3", "tc1"),
    ];
    const tokens = estimateTurnTokens(turn);
    expect(tokens).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// trimHistory — no-op cases
// ---------------------------------------------------------------------------

describe("trimHistory — no trimming needed", () => {
  test("returns original array when history fits within limits", () => {
    const messages = buildConversation(3);
    const result = trimHistory(messages, { contextLimit: 100_000 });
    expect(result).toEqual(messages);
  });

  test("returns original array when no non-system messages exist", () => {
    const messages: DriverMessage[] = [msg("system", "you are helpful")];
    const result = trimHistory(messages, { contextLimit: 100_000 });
    expect(result).toEqual(messages);
  });

  test("returns original array for empty input", () => {
    expect(trimHistory([], { contextLimit: 100_000 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// trimHistory — maxMessages limit
// ---------------------------------------------------------------------------

describe("trimHistory — maxMessages", () => {
  test("trims to last N messages respecting limit", () => {
    const messages = buildConversation(4); // system + 4 pairs = 9 messages
    const result = trimHistory(messages, { contextLimit: 100_000, maxMessages: 4 });

    // Should keep: system + compaction marker + last 4 non-system messages
    expect(result[0]!.role).toBe("system");
    expect(result[0]!.content).toBe("you are helpful");
    expect(result[1]!.role).toBe("system");
    expect(result[1]!.content.toString()).toContain("trimmed");
    expect(result).toHaveLength(6); // system + marker + 4 messages
  });

  test("keeps tool call/result pairs intact with maxMessages", () => {
    const messages: DriverMessage[] = [
      msg("system", "prompt"),
      msg("user", "old question"),
      msg("assistant", "old answer"),
      msg("user", "search for X"),
      toolCallMsg("", [{ id: "tc1", name: "bash", arguments: "{}" }]),
      toolResultMsg("found X", "tc1"),
      msg("assistant", "here is X"),
    ];

    const result = trimHistory(messages, { contextLimit: 100_000, maxMessages: 4 });

    // Verify no orphaned tool messages
    for (let i = 0; i < result.length; i++) {
      if (result[i]!.role === "tool") {
        let foundAssistant = false;
        for (let j = i - 1; j >= 0; j--) {
          if (result[j]!.role === "assistant" && result[j]!.tool_calls?.length) {
            foundAssistant = true;
            break;
          }
          if (result[j]!.role !== "tool") break;
        }
        expect(foundAssistant).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// trimHistory — maxTokens limit
// ---------------------------------------------------------------------------

describe("trimHistory — maxTokens", () => {
  test("trims based on token budget", () => {
    const messages = buildConversation(5, 4000); // each msg ~1000 tokens

    // Budget of 500 tokens — should only keep the last couple messages
    const result = trimHistory(messages, { contextLimit: 100_000, maxTokens: 500 });
    const nonMarker = result.filter((m) =>
      m.role !== "system" || !m.content.toString().includes("trimmed"),
    );
    expect(nonMarker.length).toBeLessThan(messages.length);
  });

  test("preserves most recent messages within budget", () => {
    const messages: DriverMessage[] = [
      msg("system", "prompt"),
      msg("user", "x".repeat(4000)),   // ~1000 tokens
      msg("assistant", "x".repeat(4000)),
      msg("user", "recent"),
      msg("assistant", "response"),
    ];

    const result = trimHistory(messages, { contextLimit: 100_000, maxTokens: 500 });
    expect(result[result.length - 1]!.content).toBe("response");
    expect(result[result.length - 2]!.content).toBe("recent");
  });
});

// ---------------------------------------------------------------------------
// trimHistory — auto-limit (contextLimit * PRE_TRIM_CONTEXT_RATIO)
// ---------------------------------------------------------------------------

describe("trimHistory — auto context limit", () => {
  test("auto-trims when history exceeds 60% of context window", () => {
    // Small context model (8k) — 60% = 4800 tokens (~19200 chars)
    const messages = buildConversation(5, 8000); // each msg ~2000 tokens, total ~10k

    const result = trimHistory(messages, { contextLimit: 8_000 });
    expect(result.length).toBeLessThan(messages.length);
    // Most recent messages should survive
    expect(result[result.length - 1]!.content).toMatch(/^a+$/);
  });

  test("does not trim when history fits within 60% of large context window", () => {
    const messages = buildConversation(3);
    const result = trimHistory(messages, { contextLimit: 200_000 });
    expect(result).toEqual(messages);
  });
});

// ---------------------------------------------------------------------------
// trimHistory — compaction marker
// ---------------------------------------------------------------------------

describe("trimHistory — compaction marker", () => {
  test("inserts a system message when turns are omitted", () => {
    const messages = buildConversation(4);
    const result = trimHistory(messages, { contextLimit: 100_000, maxMessages: 2 });
    const markers = result.filter(
      (m) => m.role === "system" && m.content.toString().includes("trimmed"),
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]!.content.toString()).toContain("omitted");
  });

  test("includes count of omitted turns in marker", () => {
    const messages = buildConversation(4); // 8 non-system = 8 turns

    // maxMessages=2 → keep last 2, omit 6
    const result = trimHistory(messages, { contextLimit: 100_000, maxMessages: 2 });
    const marker = result.find(
      (m) => m.role === "system" && m.content.toString().includes("trimmed"),
    );
    expect(marker).toBeTruthy();
    expect(marker!.content.toString()).toContain("6 turn(s) omitted");
  });

  test("does not insert marker when nothing is trimmed", () => {
    const messages = buildConversation(2);
    const result = trimHistory(messages, { contextLimit: 100_000 });
    const markers = result.filter(
      (m) => m.role === "system" && m.content.toString().includes("trimmed"),
    );
    expect(markers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// trimHistory — tool call integrity under pressure
// ---------------------------------------------------------------------------

describe("trimHistory — tool call integrity", () => {
  test("never orphans tool results from their assistant message", () => {
    const messages = buildToolConversation(5);

    const result = trimHistory(messages, { contextLimit: 100_000, maxMessages: 8 });

    for (let i = 0; i < result.length; i++) {
      if (result[i]!.role === "tool") {
        let foundAssistant = false;
        for (let j = i - 1; j >= 0; j--) {
          if (result[j]!.role === "assistant" && result[j]!.tool_calls?.length) {
            foundAssistant = true;
            break;
          }
          if (result[j]!.role !== "tool") break;
        }
        expect(foundAssistant).toBe(true);
      }
    }
  });

  test("drops entire tool call group when it would exceed limits", () => {
    const messages: DriverMessage[] = [
      msg("system", "prompt"),
      toolCallMsg("", [{ id: "tc1", name: "bash", arguments: "{}" }]),
      toolResultMsg("x".repeat(4000), "tc1"), // ~1000 tokens
      msg("user", "small"),
      msg("assistant", "small reply"),
    ];

    const result = trimHistory(messages, { contextLimit: 100_000, maxTokens: 100 });
    const toolMsgs = result.filter((m) => m.role === "tool");
    const assistantWithTools = result.filter((m) => m.tool_calls?.length);
    // If tool results are present, their assistant must also be present
    if (toolMsgs.length > 0) {
      expect(assistantWithTools.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// trimHistory — combined limits
// ---------------------------------------------------------------------------

describe("trimHistory — combined maxMessages + maxTokens", () => {
  test("respects both limits simultaneously — tighter one wins", () => {
    const messages = buildConversation(4);

    // maxMessages=4 is generous, maxTokens=20 (~80 chars) is very tight
    const result = trimHistory(messages, {
      contextLimit: 100_000,
      maxMessages: 4,
      maxTokens: 20,
    });

    const nonSystem = result.filter((m) => m.role !== "system");
    expect(nonSystem.length).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// trimHistory — system messages always preserved
// ---------------------------------------------------------------------------

describe("trimHistory — system messages", () => {
  test("preserves all system messages regardless of limits", () => {
    const messages: DriverMessage[] = [
      msg("system", "main prompt"),
      msg("system", "injected memory"),
      msg("user", "hello"),
      msg("assistant", "hi"),
    ];

    const result = trimHistory(messages, { contextLimit: 100_000, maxMessages: 2 });
    const systemMsgs = result.filter(
      (m) => m.role === "system" && !m.content.toString().includes("trimmed"),
    );
    expect(systemMsgs).toHaveLength(2);
    expect(systemMsgs[0]!.content).toBe("main prompt");
    expect(systemMsgs[1]!.content).toBe("injected memory");
  });
});

// ---------------------------------------------------------------------------
// compactHistory — in-loop compaction
// ---------------------------------------------------------------------------

describe("compactHistory", () => {
  test("compacts large histories to fit within 50% of context", () => {
    // 20 turn pairs × 4000 chars each = ~10k tokens total content
    const messages = buildConversation(20, 4000);
    const contextLimit = 8_000;

    const result = compactHistory(messages, contextLimit);
    expect(result.length).toBeLessThan(messages.length);
  });

  test("preserves system messages", () => {
    const messages = buildConversation(20, 4000);
    const result = compactHistory(messages, 8_000);

    const systemMsgs = result.filter(
      (m) => m.role === "system" && !m.content.toString().includes("trimmed"),
    );
    expect(systemMsgs).toHaveLength(1);
    expect(systemMsgs[0]!.content).toBe("you are helpful");
  });

  test("inserts compaction marker when turns are omitted", () => {
    const messages = buildConversation(20, 4000);
    const result = compactHistory(messages, 8_000);

    const markers = result.filter(
      (m) => m.role === "system" && m.content.toString().includes("trimmed"),
    );
    expect(markers).toHaveLength(1);
  });

  test("preserves tool call/result pairs", () => {
    const messages = buildToolConversation(10);
    const result = compactHistory(messages, 4_000);

    for (let i = 0; i < result.length; i++) {
      if (result[i]!.role === "tool") {
        let foundAssistant = false;
        for (let j = i - 1; j >= 0; j--) {
          if (result[j]!.role === "assistant" && result[j]!.tool_calls?.length) {
            foundAssistant = true;
            break;
          }
          if (result[j]!.role !== "tool") break;
        }
        expect(foundAssistant).toBe(true);
      }
    }
  });

  test("no-ops when history is small enough", () => {
    const messages = buildConversation(2);
    const result = compactHistory(messages, 100_000);
    expect(result).toEqual(messages);
  });

  test(`no-ops when fewer than MIN_MESSAGES_FOR_COMPACTION (${MIN_MESSAGES_FOR_COMPACTION}) non-system messages`, () => {
    const messages: DriverMessage[] = [msg("system", "prompt")];
    // Add exactly MIN_MESSAGES_FOR_COMPACTION - 1 non-system messages
    for (let i = 0; i < MIN_MESSAGES_FOR_COMPACTION - 1; i++) {
      messages.push(msg(i % 2 === 0 ? "user" : "assistant", "x".repeat(40000)));
    }

    const result = compactHistory(messages, 1_000);
    expect(result).toEqual(messages);
  });

  test("keeps most recent messages after compaction", () => {
    const messages: DriverMessage[] = [
      msg("system", "prompt"),
      msg("user", "x".repeat(8000)),
      msg("assistant", "x".repeat(8000)),
      msg("user", "x".repeat(8000)),
      msg("assistant", "x".repeat(8000)),
      msg("user", "x".repeat(8000)),
      msg("assistant", "x".repeat(8000)),
      msg("user", "latest question"),
      msg("assistant", "latest answer"),
    ];

    const result = compactHistory(messages, 8_000);
    expect(result[result.length - 1]!.content).toBe("latest answer");
    expect(result[result.length - 2]!.content).toBe("latest question");
  });
});

// ---------------------------------------------------------------------------
// Integration: trimHistory + compactHistory use same turn logic
// ---------------------------------------------------------------------------

describe("unified algorithm", () => {
  test("both functions preserve tool pairs on the same conversation", () => {
    const messages = buildToolConversation(8);

    // Pre-trim with tight limit
    const trimmed = trimHistory(messages, { contextLimit: 4_000, maxMessages: 10 });
    // In-loop compact
    const compacted = compactHistory(messages, 4_000);

    // Both should have no orphaned tool messages
    for (const result of [trimmed, compacted]) {
      for (let i = 0; i < result.length; i++) {
        if (result[i]!.role === "tool") {
          let foundAssistant = false;
          for (let j = i - 1; j >= 0; j--) {
            if (result[j]!.role === "assistant" && result[j]!.tool_calls?.length) {
              foundAssistant = true;
              break;
            }
            if (result[j]!.role !== "tool") break;
          }
          expect(foundAssistant).toBe(true);
        }
      }
    }
  });

  test("groupIntoTurns is deterministic across multiple calls", () => {
    const messages = buildToolConversation(5);
    const nonSystem = messages.filter((m) => m.role !== "system");

    const turns1 = groupIntoTurns(nonSystem);
    const turns2 = groupIntoTurns(nonSystem);

    expect(turns1).toEqual(turns2);
  });
});

// ---------------------------------------------------------------------------
// sanitizeToolPairs — tool pair validation
// ---------------------------------------------------------------------------

describe("sanitizeToolPairs — valid history passes through", () => {
  test("no-ops on a conversation with no tool calls", () => {
    const messages: DriverMessage[] = [
      msg("system", "prompt"),
      msg("user", "hello"),
      msg("assistant", "hi"),
    ];
    expect(sanitizeToolPairs(messages)).toEqual(messages);
  });

  test("no-ops on a well-formed tool conversation", () => {
    const messages: DriverMessage[] = [
      msg("system", "prompt"),
      msg("user", "search"),
      toolCallMsg("let me look", [{ id: "tc1", name: "bash", arguments: '{"cmd":"ls"}' }]),
      toolResultMsg("file.txt", "tc1"),
      msg("assistant", "found it"),
    ];
    expect(sanitizeToolPairs(messages)).toEqual(messages);
  });

  test("no-ops on multi-tool calls with all results present", () => {
    const messages: DriverMessage[] = [
      msg("user", "do two things"),
      toolCallMsg("", [
        { id: "tc1", name: "bash", arguments: "{}" },
        { id: "tc2", name: "read", arguments: "{}" },
      ]),
      toolResultMsg("result1", "tc1"),
      toolResultMsg("result2", "tc2"),
      msg("assistant", "done"),
    ];
    expect(sanitizeToolPairs(messages)).toEqual(messages);
  });
});

describe("sanitizeToolPairs — removes orphaned tool results", () => {
  test("drops tool message with empty tool_call_id", () => {
    const messages: DriverMessage[] = [
      msg("user", "hello"),
      toolCallMsg("", [{ id: "tc1", name: "bash", arguments: "{}" }]),
      toolResultMsg("result", "tc1"),
      { role: "tool", content: "orphaned", tool_call_id: "" }, // empty ID
      msg("assistant", "done"),
    ];

    const result = sanitizeToolPairs(messages);
    expect(result.filter((m) => m.role === "tool")).toHaveLength(1);
    expect(result.filter((m) => m.role === "tool")[0]!.tool_call_id).toBe("tc1");
  });

  test("drops tool message with undefined tool_call_id", () => {
    const messages: DriverMessage[] = [
      msg("user", "hello"),
      { role: "tool", content: "orphaned" }, // no tool_call_id at all
      msg("assistant", "hi"),
    ];

    const result = sanitizeToolPairs(messages);
    expect(result.filter((m) => m.role === "tool")).toHaveLength(0);
  });

  test("drops tool message whose tool_call_id doesn't match any assistant", () => {
    const messages: DriverMessage[] = [
      msg("user", "search"),
      toolCallMsg("", [{ id: "tc1", name: "bash", arguments: "{}" }]),
      toolResultMsg("valid result", "tc1"),
      toolResultMsg("orphaned result", "tc_nonexistent"), // no matching tool_call
      msg("assistant", "done"),
    ];

    const result = sanitizeToolPairs(messages);
    const toolMsgs = result.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0]!.tool_call_id).toBe("tc1");
  });
});

describe("sanitizeToolPairs — repairs assistant tool_calls", () => {
  test("strips tool_calls from assistant when no results exist", () => {
    const messages: DriverMessage[] = [
      msg("user", "do something"),
      toolCallMsg("I'll try", [{ id: "tc1", name: "bash", arguments: "{}" }]),
      // NO tool result for tc1 — crashed mid-execution
      msg("user", "what happened?"),
      msg("assistant", "sorry"),
    ];

    const result = sanitizeToolPairs(messages);
    // Assistant with tool_calls should be converted to text-only
    const assistantWithTools = result.filter((m) => m.tool_calls?.length);
    expect(assistantWithTools).toHaveLength(0);
    // But the text "I'll try" should be preserved
    const textAssistants = result.filter((m) => m.role === "assistant" && m.content === "I'll try");
    expect(textAssistants).toHaveLength(1);
    expect(textAssistants[0]!.tool_calls).toBeUndefined();
  });

  test("drops empty assistant when tool_calls stripped and no text", () => {
    const messages: DriverMessage[] = [
      msg("user", "do something"),
      toolCallMsg("", [{ id: "tc1", name: "bash", arguments: "{}" }]),
      // NO tool result — and assistant has empty text
      msg("user", "retry"),
      msg("assistant", "ok"),
    ];

    const result = sanitizeToolPairs(messages);
    // Empty assistant (no text, no valid tool_calls) should be dropped
    expect(result).toHaveLength(3); // user + user + assistant
  });

  test("keeps only tool_calls that have matching results (partial)", () => {
    const messages: DriverMessage[] = [
      msg("user", "do two things"),
      toolCallMsg("working", [
        { id: "tc1", name: "bash", arguments: "{}" },
        { id: "tc2", name: "read", arguments: "{}" },
      ]),
      toolResultMsg("result for tc1", "tc1"),
      // NO result for tc2 — partial execution
      msg("assistant", "partially done"),
    ];

    const result = sanitizeToolPairs(messages);
    const assistantWithTools = result.find((m) => m.tool_calls?.length);
    expect(assistantWithTools).toBeTruthy();
    // Should keep only tc1, not tc2
    expect(assistantWithTools!.tool_calls).toHaveLength(1);
    expect(assistantWithTools!.tool_calls![0]!.id).toBe("tc1");
  });

  test("filters out tool_calls with empty id", () => {
    const messages: DriverMessage[] = [
      msg("user", "search"),
      toolCallMsg("searching", [
        { id: "", name: "bash", arguments: "{}" },  // empty ID from DB corruption
        { id: "tc2", name: "read", arguments: "{}" },
      ]),
      toolResultMsg("read result", "tc2"),
      msg("assistant", "done"),
    ];

    const result = sanitizeToolPairs(messages);
    const assistantWithTools = result.find((m) => m.tool_calls?.length);
    expect(assistantWithTools!.tool_calls).toHaveLength(1);
    expect(assistantWithTools!.tool_calls![0]!.id).toBe("tc2");
  });

  test("filters out tool_calls with empty name", () => {
    const messages: DriverMessage[] = [
      msg("user", "search"),
      toolCallMsg("searching", [
        { id: "tc1", name: "", arguments: "{}" },  // empty name
        { id: "tc2", name: "read", arguments: "{}" },
      ]),
      toolResultMsg("result1", "tc1"),
      toolResultMsg("result2", "tc2"),
      msg("assistant", "done"),
    ];

    const result = sanitizeToolPairs(messages);
    const assistantWithTools = result.find((m) => m.tool_calls?.length);
    // tc1 dropped (empty name), tc2 kept
    expect(assistantWithTools!.tool_calls).toHaveLength(1);
    expect(assistantWithTools!.tool_calls![0]!.id).toBe("tc2");
    // tc1's result should also be dropped since the tool_call was removed
    const toolMsgs = result.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0]!.tool_call_id).toBe("tc2");
  });
});

describe("sanitizeToolPairs — preserves non-tool messages", () => {
  test("passes through system, user, and plain assistant messages", () => {
    const messages: DriverMessage[] = [
      msg("system", "prompt"),
      msg("system", "memory"),
      msg("user", "hello"),
      msg("assistant", "hi"),
      msg("user", "bye"),
      msg("assistant", "goodbye"),
    ];

    expect(sanitizeToolPairs(messages)).toEqual(messages);
  });
});

describe("sanitizeToolPairs — real-world corruption scenarios", () => {
  test("Anthropic error: unexpected tool_use_id in tool_result blocks", () => {
    // Scenario: tool result references a tool_call from a message that was
    // compacted away, so the tool_use_id doesn't match anything in history
    const messages: DriverMessage[] = [
      msg("system", "prompt"),
      msg("user", "continue"),
      toolResultMsg("stale result", "toolu_vrtx_01Xe3FQc9EPw1F8z3zmDqnee"),
      msg("assistant", "let me try again"),
    ];

    const result = sanitizeToolPairs(messages);
    // Orphaned tool result should be removed
    expect(result.filter((m) => m.role === "tool")).toHaveLength(0);
    expect(result).toHaveLength(3); // system + user + assistant
  });

  test("Groq error: tool_call_id property is missing", () => {
    // Scenario: DB reconstruction produced a tool message without tool_call_id
    const messages: DriverMessage[] = [
      msg("system", "prompt"),
      msg("user", "run something"),
      toolCallMsg("", [{ id: "tc1", name: "bash", arguments: '{"cmd":"ls"}' }]),
      { role: "tool", content: "file.txt" },  // missing tool_call_id entirely
      msg("assistant", "done"),
    ];

    const result = sanitizeToolPairs(messages);
    // Tool message without tool_call_id should be removed
    expect(result.filter((m) => m.role === "tool")).toHaveLength(0);
    // And the assistant's tool_calls should be stripped (no matching result)
    const assistantWithTools = result.filter((m) => m.tool_calls?.length);
    expect(assistantWithTools).toHaveLength(0);
  });

  test("mixed corruption: some valid pairs, some broken", () => {
    const messages: DriverMessage[] = [
      msg("system", "prompt"),
      msg("user", "task 1"),
      toolCallMsg("", [{ id: "tc1", name: "bash", arguments: "{}" }]),
      toolResultMsg("result 1", "tc1"),
      msg("assistant", "done with task 1"),
      msg("user", "task 2"),
      toolCallMsg("", [{ id: "tc2", name: "bash", arguments: "{}" }]),
      // tc2 result MISSING — agent crashed
      msg("user", "task 3"),
      toolCallMsg("trying", [{ id: "tc3", name: "read", arguments: "{}" }]),
      toolResultMsg("result 3", "tc3"),
      msg("assistant", "done with task 3"),
    ];

    const result = sanitizeToolPairs(messages);

    // tc1 pair: valid → kept
    expect(result.filter((m) => m.tool_call_id === "tc1")).toHaveLength(1);
    expect(result.some((m) => m.tool_calls?.some((tc) => tc.id === "tc1"))).toBe(true);

    // tc2 pair: broken → assistant stripped, no orphaned tool message
    expect(result.filter((m) => m.tool_call_id === "tc2")).toHaveLength(0);
    expect(result.some((m) => m.tool_calls?.some((tc) => tc.id === "tc2"))).toBe(false);

    // tc3 pair: valid → kept
    expect(result.filter((m) => m.tool_call_id === "tc3")).toHaveLength(1);
    expect(result.some((m) => m.tool_calls?.some((tc) => tc.id === "tc3"))).toBe(true);
  });

  test("handles empty conversation", () => {
    expect(sanitizeToolPairs([])).toEqual([]);
  });
});
