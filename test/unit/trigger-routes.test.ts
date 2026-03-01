// Trigger routes tests — CRUD, validation, toggle, fire, filtering.

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
import { TriggerEngine, type TriggerConfig } from "../../src/daemon/services/triggers/engine.js";

// Use in-memory database so tests never pollute the production DB.
beforeAll(() => {
  initDatabase(":memory:");
});

afterAll(() => {
  closeDatabase();
});

// ---------------------------------------------------------------------------
// TriggerEngine.update() — unit tests
// ---------------------------------------------------------------------------

describe("TriggerEngine.update()", () => {
  let engine: TriggerEngine;

  beforeEach(() => {
    engine = new TriggerEngine();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it("returns undefined for nonexistent ID", () => {
    const result = engine.update("nope", { label: "test" });
    expect(result).toBeUndefined();
  });

  it("updates label", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test" },
      label: "Original",
    });

    const updated = engine.update(trigger.id, { label: "Updated" });
    expect(updated).toBeDefined();
    expect(updated!.label).toBe("Updated");
    expect(engine.get(trigger.id)!.label).toBe("Updated");
  });

  it("updates action", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo old" },
    });

    const updated = engine.update(trigger.id, {
      action: { type: "shell", command: "echo new", notify: true },
    });

    expect(updated!.action.command).toBe("echo new");
    expect(updated!.action.notify).toBe(true);
  });

  it("updates config", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" as const },
      action: { type: "shell", command: "echo test" },
    });

    const updated = engine.update(trigger.id, {
      config: { service: "stripe" as const, secret: "whsec_123" },
    });

    expect((updated!.config as { service: string }).service).toBe("stripe");
    expect((updated!.config as { secret: string }).secret).toBe("whsec_123");
  });

  it("updates max_runs", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test" },
      max_runs: 0,
    });

    const updated = engine.update(trigger.id, { max_runs: 5 });
    expect(updated!.max_runs).toBe(5);
  });

  it("updates enabled state", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test" },
    });

    const updated = engine.update(trigger.id, { enabled: false });
    expect(updated!.enabled).toBe(false);
  });

  it("preserves unchanged fields", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" as const },
      action: { type: "shell", command: "echo test" },
      label: "Keep me",
    });

    engine.update(trigger.id, { max_runs: 10 });

    const result = engine.get(trigger.id)!;
    expect(result.label).toBe("Keep me");
    expect(result.enabled).toBe(true);
    expect(result.action.command).toBe("echo test");
    expect(result.max_runs).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Trigger type validation helpers — test via engine behavior
// ---------------------------------------------------------------------------

describe("Trigger type support", () => {
  let engine: TriggerEngine;

  beforeEach(() => {
    engine = new TriggerEngine();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it("supports webhook triggers", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" },
      action: { type: "shell", command: "echo webhook" },
    });
    expect(trigger.type).toBe("webhook");
  });

  it("supports cron triggers", () => {
    const trigger = engine.add({
      type: "cron",
      enabled: false, // don't start the cron
      config: { expression: "*/5 * * * *" },
      action: { type: "shell", command: "echo cron" },
    });
    expect(trigger.type).toBe("cron");
  });

  it("supports file triggers", () => {
    const trigger = engine.add({
      type: "file",
      enabled: false,
      config: { paths: ["/tmp/watch-me.txt"] },
      action: { type: "shell", command: "echo file" },
    });
    expect(trigger.type).toBe("file");
  });

  it("supports http triggers", () => {
    const trigger = engine.add({
      type: "http",
      enabled: false,
      config: { url: "https://example.com/health", intervalMs: 60000 },
      action: { type: "shell", command: "echo http" },
    });
    expect(trigger.type).toBe("http");
  });

  it("supports agent actions", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "agent", prompt: "Analyze the incoming webhook payload" },
    });
    expect(trigger.action.type).toBe("agent");
    expect(trigger.action.prompt).toBe("Analyze the incoming webhook payload");
  });

  it("supports max_runs on creation", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test" },
      max_runs: 100,
    });
    expect(trigger.max_runs).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

describe("TriggerEngine filtering", () => {
  let engine: TriggerEngine;

  beforeEach(() => {
    engine = new TriggerEngine();

    engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "a" }, label: "WH1" });
    engine.add({ type: "webhook", enabled: false, config: {}, action: { type: "shell", command: "b" }, label: "WH2" });
    engine.add({ type: "cron", enabled: true, config: { expression: "* * * * *" }, action: { type: "shell", command: "c" }, label: "CR1" });
    engine.add({ type: "file", enabled: true, config: { paths: ["/tmp/x"] }, action: { type: "shell", command: "d" }, label: "FL1" });
  });

  afterEach(async () => {
    await engine.stop();
  });

  it("listAll returns all trigger types", () => {
    const all = engine.listAll();
    const types = new Set(all.map((t) => t.type));
    expect(types.has("webhook")).toBe(true);
    expect(types.has("cron")).toBe(true);
    expect(types.has("file")).toBe(true);
  });

  it("listActive returns only enabled triggers", () => {
    const active = engine.listActive();
    expect(active.every((t) => t.enabled)).toBe(true);
    // WH2 is disabled, so active count should be all minus disabled
    const disabledInActive = active.filter((t) => !t.enabled);
    expect(disabledInActive).toHaveLength(0);
  });

  it("listAll can be filtered by type externally", () => {
    const webhooks = engine.listAll().filter((t) => t.type === "webhook");
    expect(webhooks).toHaveLength(2);

    const crons = engine.listAll().filter((t) => t.type === "cron");
    expect(crons).toHaveLength(1);
  });
});
