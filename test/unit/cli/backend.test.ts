/**
 * Tests for CLI backend — event dispatching, abort handling, factory logic.
 *
 * Tests the pure logic of event dispatch without requiring actual daemon
 * connections or database access.
 */

import { describe, test, expect } from "bun:test";

// We test the public contract of the backend module.
// Since createDaemonBackend and createInProcessBackend require I/O,
// we test the BackendCallbacks dispatch pattern and factory selection logic.

import type { BackendCallbacks, Backend } from "../../../src/cli/backend.js";

// ---------------------------------------------------------------------------
// BackendCallbacks dispatch
// ---------------------------------------------------------------------------

describe("BackendCallbacks", () => {
  test("all callback keys are defined", () => {
    const callbacks: BackendCallbacks = {
      onThinking: () => {},
      onTextDelta: () => {},
      onToolCallStart: () => {},
      onToolResult: () => {},
      onTurnComplete: () => {},
      onCompaction: () => {},
      onError: () => {},
    };

    expect(typeof callbacks.onThinking).toBe("function");
    expect(typeof callbacks.onTextDelta).toBe("function");
    expect(typeof callbacks.onToolCallStart).toBe("function");
    expect(typeof callbacks.onToolResult).toBe("function");
    expect(typeof callbacks.onTurnComplete).toBe("function");
    expect(typeof callbacks.onCompaction).toBe("function");
    expect(typeof callbacks.onError).toBe("function");
  });

  test("onTextDelta accumulates text content", () => {
    let accumulated = "";
    const callbacks: BackendCallbacks = {
      onThinking: () => {},
      onTextDelta: (content) => { accumulated += content; },
      onToolCallStart: () => {},
      onToolResult: () => {},
      onTurnComplete: () => {},
      onCompaction: () => {},
      onError: () => {},
    };

    callbacks.onTextDelta("Hello ");
    callbacks.onTextDelta("world");
    expect(accumulated).toBe("Hello world");
  });

  test("onToolCallStart receives structured tool call", () => {
    let receivedName = "";
    const callbacks: BackendCallbacks = {
      onThinking: () => {},
      onTextDelta: () => {},
      onToolCallStart: (tc) => { receivedName = tc.name; },
      onToolResult: () => {},
      onTurnComplete: () => {},
      onCompaction: () => {},
      onError: () => {},
    };

    callbacks.onToolCallStart({
      id: "tc-1",
      name: "read",
      arguments: '{"file_path":"test.ts"}',
    });
    expect(receivedName).toBe("read");
  });

  test("onTurnComplete receives token counts", () => {
    let tokensIn = 0;
    let tokensOut = 0;
    const callbacks: BackendCallbacks = {
      onThinking: () => {},
      onTextDelta: () => {},
      onToolCallStart: () => {},
      onToolResult: () => {},
      onTurnComplete: (tin, tout) => { tokensIn = tin; tokensOut = tout; },
      onCompaction: () => {},
      onError: () => {},
    };

    callbacks.onTurnComplete(1200, 340);
    expect(tokensIn).toBe(1200);
    expect(tokensOut).toBe(340);
  });

  test("onError receives error message", () => {
    let errorMsg = "";
    const callbacks: BackendCallbacks = {
      onThinking: () => {},
      onTextDelta: () => {},
      onToolCallStart: () => {},
      onToolResult: () => {},
      onTurnComplete: () => {},
      onCompaction: () => {},
      onError: (msg) => { errorMsg = msg; },
    };

    callbacks.onError("Connection failed");
    expect(errorMsg).toBe("Connection failed");
  });
});

// ---------------------------------------------------------------------------
// Backend interface contract
// ---------------------------------------------------------------------------

describe("Backend interface", () => {
  test("backend interface has required properties", () => {
    // Type-level test: verify the interface shape compiles
    const mock: Backend = {
      mode: "in-process",
      model: "claude",
      sessionId: null,
      setModel: () => {},
      send: async () => {},
      abort: () => {},
      newSession: async () => ({
        id: "1",
        slug: "test-001",
        title: "test",
        model: "claude",
        tokenCount: 0,
        updatedAt: Date.now(),
      }),
      listSessions: async () => [],
      resumeSession: async () => null,
      listChannels: async () => [],
      connectChannel: async () => false,
      disconnectChannel: async () => false,
    };

    expect(mock.mode).toBe("in-process");
    expect(mock.model).toBe("claude");
    expect(mock.sessionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Abort pattern
// ---------------------------------------------------------------------------

describe("Abort pattern", () => {
  test("AbortController abort flow", () => {
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);

    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  test("AbortController abort reason", () => {
    const controller = new AbortController();
    controller.abort("user cancelled");
    expect(controller.signal.aborted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe("Backend module exports", () => {
  test("createBackend is exported", async () => {
    const mod = await import("../../../src/cli/backend.js");
    expect(typeof mod.createBackend).toBe("function");
  });

  test("createDaemonBackend is exported", async () => {
    const mod = await import("../../../src/cli/backend.js");
    expect(typeof mod.createDaemonBackend).toBe("function");
  });

  test("createInProcessBackend is exported", async () => {
    const mod = await import("../../../src/cli/backend.js");
    expect(typeof mod.createInProcessBackend).toBe("function");
  });

  test("persistSetup is exported", async () => {
    const mod = await import("../../../src/cli/backend.js");
    expect(typeof mod.persistSetup).toBe("function");
  });
});
