/**
 * Theme-reactivity smoke tests.
 *
 * Verifies that every component migrated off direct PALETTE reads in
 * Subsystem 5 composes correctly with ThemeProvider:
 *   1. Each renders without throwing under a ThemeProvider.
 *   2. Swapping the theme produces different ANSI output — the migration
 *      covenant is that colors come from context, not module state.
 *
 * The check: render twice (once per theme) and assert the rendered frames
 * are different. Because chalk encodes theme-brand hex values directly,
 * different themes → different ANSI sequences → different frames.
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";

import { ThemeProvider, resolveTheme } from "../../../../src/cli/themes/index.js";
import type { ThemeId } from "../../../../src/cli/themes/index.js";

import { ErrorBoundary } from "../../../../src/cli/components/ErrorBoundary.js";
import { Autocomplete } from "../../../../src/cli/components/Autocomplete.js";
import { ContextBar } from "../../../../src/cli/components/ContextBar.js";
import { ToolCallView } from "../../../../src/cli/components/ToolCall.js";
import { Messages, StreamingText } from "../../../../src/cli/components/Messages.js";
import { StatusBar } from "../../../../src/cli/components/StatusBar.js";
import { SubAgentList, SubAgentView, LiveSubAgent } from "../../../../src/cli/components/SubAgent.js";

import type {
  ContextInfo,
  DisplayMessage,
  DisplayToolCall,
  SessionStats,
  SubAgentState,
} from "../../../../src/cli/types.js";

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function withTheme(theme: ThemeId, node: React.ReactElement): React.ReactElement {
  return React.createElement(ThemeProvider, { initialTheme: theme }, node);
}

/**
 * Render the component under the two canonical themes and return both
 * frames. The frames contain ANSI codes, so they must differ when the
 * component actually consumed theme colors.
 */
function renderUnderBothThemes(node: React.ReactElement): { dark: string; light: string } {
  const dark = render(withTheme("jeriko", node));
  const light = render(withTheme("jeriko-light", node));
  const out = {
    dark: dark.lastFrame() ?? "",
    light: light.lastFrame() ?? "",
  };
  dark.unmount();
  light.unmount();
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function toolCall(partial: Partial<DisplayToolCall> = {}): DisplayToolCall {
  return {
    id: "tool-1",
    name: "read",
    args: { path: "/tmp/x" },
    status: "completed",
    startTime: Date.now(),
    result: "ok",
    ...partial,
  };
}

function subAgent(partial: Partial<SubAgentState> = {}): SubAgentState {
  return {
    childSessionId: "child-1",
    parentSessionId: "parent-1",
    label: "Research",
    agentType: "research",
    phase: "running",
    currentTool: "search_files",
    streamPreview: "Searching for auth patterns",
    toolCallCount: 3,
    startTime: Date.now() - 4_200,
    ...partial,
  };
}

const ctx: ContextInfo = { totalTokens: 120_000, maxTokens: 200_000, compactionCount: 0 };
const stats: SessionStats = { tokensIn: 1_200, tokensOut: 340, turns: 3, durationMs: 23_400 };

// ---------------------------------------------------------------------------
// Smoke: each component renders under ThemeProvider
// ---------------------------------------------------------------------------

describe("smoke — each migrated component renders under ThemeProvider", () => {
  const cases: Array<[string, React.ReactElement]> = [
    ["ErrorBoundary",  React.createElement(ErrorBoundary, null, React.createElement(React.Fragment))],
    ["Autocomplete",   React.createElement(Autocomplete, { items: [{ name: "/help", description: "Show help" }], selectedIndex: 0 })],
    ["ContextBar",     React.createElement(ContextBar,   { totalUsed: 140_000, context: ctx })],
    ["ToolCallView",   React.createElement(ToolCallView, { toolCall: toolCall() })],
    ["Messages",       React.createElement(Messages,     { messages: [fixtureMessage("user"), fixtureMessage("assistant")] })],
    ["StreamingText",  React.createElement(StreamingText, { text: "hello", phase: "streaming" })],
    ["StatusBar",      React.createElement(StatusBar,    { phase: "idle", model: "claude", stats, context: ctx, sessionSlug: "test" })],
    ["SubAgentList",   React.createElement(SubAgentList, { agents: [subAgent()] })],
    ["SubAgentView",   React.createElement(SubAgentView, { toolCall: { ...toolCall(), name: "delegate", args: { agent_type: "research", prompt: "hi" } } })],
    ["LiveSubAgent",   React.createElement(LiveSubAgent, { agent: subAgent() })],
  ];

  for (const [name, element] of cases) {
    test(`${name} renders without throwing`, () => {
      const { unmount } = render(withTheme("jeriko", element));
      expect(() => unmount()).not.toThrow();
    });
  }
});

// ---------------------------------------------------------------------------
// Theme reactivity: frames differ between themes
// ---------------------------------------------------------------------------

describe("theme reactivity — migrated components produce different frames per theme", () => {
  // Sanity check: the fixture themes really do have different brand hex values.
  test("jeriko and jeriko-light resolve to distinct brand colors", () => {
    expect(resolveTheme("jeriko").colors.brand).not.toBe(resolveTheme("jeriko-light").colors.brand);
  });

  const reactive: Array<[string, React.ReactElement]> = [
    ["ContextBar",     React.createElement(ContextBar,   { totalUsed: 140_000, context: ctx })],
    ["ToolCallView",   React.createElement(ToolCallView, { toolCall: toolCall() })],
    ["StatusBar",      React.createElement(StatusBar,    { phase: "idle", model: "claude", stats, context: ctx, sessionSlug: "test" })],
    ["SubAgentList",   React.createElement(SubAgentList, { agents: [subAgent({ phase: "completed", durationMs: 1_800 })] })],
    ["SubAgentView",   React.createElement(SubAgentView, { toolCall: { ...toolCall(), name: "delegate", args: { agent_type: "research", prompt: "hi" } } })],
    ["LiveSubAgent",   React.createElement(LiveSubAgent, { agent: subAgent({ phase: "completed", durationMs: 1_800 }) })],
  ];

  for (const [name, element] of reactive) {
    test(`${name} frame differs between jeriko and jeriko-light`, () => {
      const { dark, light } = renderUnderBothThemes(element);
      expect(dark.length).toBeGreaterThan(0);
      expect(light.length).toBeGreaterThan(0);
      expect(dark).not.toBe(light);
    });
  }
});

// ---------------------------------------------------------------------------
// Local fixtures
// ---------------------------------------------------------------------------

function fixtureMessage(role: DisplayMessage["role"]): DisplayMessage {
  return {
    id: `m-${role}`,
    role,
    content: role === "user" ? "hi" : "hello world",
    timestamp: Date.now(),
  };
}
