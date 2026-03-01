/**
 * Tests for TUI autocomplete pure logic.
 *
 * Tests filterCommands, shouldShowAutocomplete, navigateSelection, and
 * computeAutocompleteState without requiring SolidJS or @opentui runtime.
 */

import { describe, test, expect } from "bun:test";
import {
  shouldShowAutocomplete,
  filterCommands,
  navigateSelection,
  emptyAutocompleteState,
  computeAutocompleteState,
  type AutocompleteState,
} from "../../../src/cli/tui/lib/autocomplete.js";

// ---------------------------------------------------------------------------
// Test command registry (mirrors the real 5 commands)
// ---------------------------------------------------------------------------

const TEST_COMMANDS: ReadonlyMap<string, { description: string }> = new Map([
  ["/new", { description: "Start a new session" }],
  ["/sessions", { description: "List recent sessions" }],
  ["/resume", { description: "Resume a session by slug or ID" }],
  ["/model", { description: "Switch the active model" }],
  ["/help", { description: "Show available commands" }],
]);

// ---------------------------------------------------------------------------
// shouldShowAutocomplete
// ---------------------------------------------------------------------------

describe("shouldShowAutocomplete", () => {
  test("returns true for /", () => {
    expect(shouldShowAutocomplete("/")).toBe(true);
  });

  test("returns true for /h", () => {
    expect(shouldShowAutocomplete("/h")).toBe(true);
  });

  test("returns true for /help", () => {
    expect(shouldShowAutocomplete("/help")).toBe(true);
  });

  test("returns true for / with leading whitespace", () => {
    expect(shouldShowAutocomplete("  /")).toBe(true);
  });

  test("returns false for empty string", () => {
    expect(shouldShowAutocomplete("")).toBe(false);
  });

  test("returns false for plain text", () => {
    expect(shouldShowAutocomplete("hello")).toBe(false);
  });

  test("returns false when input has a space (entering args)", () => {
    expect(shouldShowAutocomplete("/resume ")).toBe(false);
  });

  test("returns false for /resume bold-nexus", () => {
    expect(shouldShowAutocomplete("/resume bold-nexus")).toBe(false);
  });

  test("returns false for slash in the middle of text", () => {
    expect(shouldShowAutocomplete("hello /world")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterCommands
// ---------------------------------------------------------------------------

describe("filterCommands", () => {
  test("/ returns all commands", () => {
    const items = filterCommands("/", TEST_COMMANDS);
    expect(items.length).toBe(5);
  });

  test("/h filters to /help", () => {
    const items = filterCommands("/h", TEST_COMMANDS);
    expect(items.length).toBe(1);
    expect(items[0]!.name).toBe("/help");
  });

  test("/s filters to /sessions", () => {
    const items = filterCommands("/s", TEST_COMMANDS);
    expect(items.length).toBe(1);
    expect(items[0]!.name).toBe("/sessions");
  });

  test("/m filters to /model", () => {
    const items = filterCommands("/m", TEST_COMMANDS);
    expect(items.length).toBe(1);
    expect(items[0]!.name).toBe("/model");
  });

  test("/n filters to /new", () => {
    const items = filterCommands("/n", TEST_COMMANDS);
    expect(items.length).toBe(1);
    expect(items[0]!.name).toBe("/new");
  });

  test("/r filters to /resume", () => {
    const items = filterCommands("/r", TEST_COMMANDS);
    expect(items.length).toBe(1);
    expect(items[0]!.name).toBe("/resume");
  });

  test("/xyz returns empty array", () => {
    const items = filterCommands("/xyz", TEST_COMMANDS);
    expect(items.length).toBe(0);
  });

  test("case insensitive — /H matches /help", () => {
    const items = filterCommands("/H", TEST_COMMANDS);
    expect(items.length).toBe(1);
    expect(items[0]!.name).toBe("/help");
  });

  test("includes description in returned items", () => {
    const items = filterCommands("/help", TEST_COMMANDS);
    expect(items[0]!.description).toBe("Show available commands");
  });

  test("empty map returns empty results", () => {
    const items = filterCommands("/", new Map());
    expect(items.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// navigateSelection
// ---------------------------------------------------------------------------

describe("navigateSelection", () => {
  const makeState = (
    itemCount: number,
    selectedIndex: number,
  ): AutocompleteState => ({
    items: Array.from({ length: itemCount }, (_, i) => ({
      name: `/cmd${i}`,
      description: `Command ${i}`,
    })),
    selectedIndex,
    visible: true,
  });

  test("down from 0 goes to 1", () => {
    expect(navigateSelection(makeState(5, 0), "down")).toBe(1);
  });

  test("down from last wraps to 0", () => {
    expect(navigateSelection(makeState(5, 4), "down")).toBe(0);
  });

  test("up from 1 goes to 0", () => {
    expect(navigateSelection(makeState(5, 1), "up")).toBe(0);
  });

  test("up from 0 wraps to last", () => {
    expect(navigateSelection(makeState(5, 0), "up")).toBe(4);
  });

  test("returns -1 for empty items", () => {
    const state: AutocompleteState = {
      items: [],
      selectedIndex: -1,
      visible: false,
    };
    expect(navigateSelection(state, "down")).toBe(-1);
    expect(navigateSelection(state, "up")).toBe(-1);
  });

  test("single item: down wraps to 0", () => {
    expect(navigateSelection(makeState(1, 0), "down")).toBe(0);
  });

  test("single item: up wraps to 0", () => {
    expect(navigateSelection(makeState(1, 0), "up")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// emptyAutocompleteState
// ---------------------------------------------------------------------------

describe("emptyAutocompleteState", () => {
  test("returns hidden state with no items", () => {
    const state = emptyAutocompleteState();
    expect(state.items).toEqual([]);
    expect(state.selectedIndex).toBe(-1);
    expect(state.visible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeAutocompleteState
// ---------------------------------------------------------------------------

describe("computeAutocompleteState", () => {
  test("/ shows all commands, selects first", () => {
    const state = computeAutocompleteState("/", TEST_COMMANDS);
    expect(state.visible).toBe(true);
    expect(state.items.length).toBe(5);
    expect(state.selectedIndex).toBe(0);
  });

  test("/h shows filtered results", () => {
    const state = computeAutocompleteState("/h", TEST_COMMANDS);
    expect(state.visible).toBe(true);
    expect(state.items.length).toBe(1);
    expect(state.items[0]!.name).toBe("/help");
  });

  test("plain text returns hidden state", () => {
    const state = computeAutocompleteState("hello", TEST_COMMANDS);
    expect(state.visible).toBe(false);
    expect(state.items).toEqual([]);
  });

  test("empty string returns hidden state", () => {
    const state = computeAutocompleteState("", TEST_COMMANDS);
    expect(state.visible).toBe(false);
  });

  test("/xyz (no matches) returns hidden state", () => {
    const state = computeAutocompleteState("/xyz", TEST_COMMANDS);
    expect(state.visible).toBe(false);
    expect(state.items).toEqual([]);
  });

  test("/resume with space returns hidden (entering args)", () => {
    const state = computeAutocompleteState("/resume ", TEST_COMMANDS);
    expect(state.visible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: autocomplete flow simulation
// ---------------------------------------------------------------------------

describe("Autocomplete Flow", () => {
  test("type / → filter → navigate → select", () => {
    // User types /
    let state = computeAutocompleteState("/", TEST_COMMANDS);
    expect(state.visible).toBe(true);
    expect(state.items.length).toBe(5);

    // Navigate down
    const nextIdx = navigateSelection(state, "down");
    expect(nextIdx).toBe(1);

    // User continues typing /r
    state = computeAutocompleteState("/r", TEST_COMMANDS);
    expect(state.items.length).toBe(1);
    expect(state.items[0]!.name).toBe("/resume");

    // Select (Tab/Enter) — the selected command name would be inserted
    expect(state.items[0]!.name).toBe("/resume");
  });

  test("type / → escape → dismiss → retype → show again", () => {
    // User types /
    let state = computeAutocompleteState("/", TEST_COMMANDS);
    expect(state.visible).toBe(true);

    // Escape — autocomplete dismissed (simulated by not re-computing)
    // Re-typing changes input, which resets dismiss
    state = computeAutocompleteState("/h", TEST_COMMANDS);
    expect(state.visible).toBe(true);
    expect(state.items[0]!.name).toBe("/help");
  });
});
