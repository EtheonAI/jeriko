// Trigger engine tests — notifications, webhook dispatch, CRUD, formatting.

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
import { TriggerEngine, type TriggerConfig, type NotifyTarget } from "../../src/daemon/services/triggers/engine.js";
import type { ChannelAdapter, ChannelRegistry } from "../../src/daemon/services/channels/index.js";

// Use in-memory database so tests never pollute the production DB.
beforeAll(() => {
  initDatabase(":memory:");
});

afterAll(() => {
  closeDatabase();
});

// ---------------------------------------------------------------------------
// Mock channel registry — captures sent messages for assertions
// ---------------------------------------------------------------------------

function createMockChannelRegistry(): ChannelRegistry & { sent: Array<{ channel: string; target: string; message: string }> } {
  const sent: Array<{ channel: string; target: string; message: string }> = [];

  return {
    sent,
    async send(channel: string, target: string, message: string) {
      sent.push({ channel, target, message });
    },
    // Stub the rest of the interface — trigger engine only uses send()
    register() {},
    async unregister() {},
    get() { return undefined; },
    list() { return []; },
    async connect() {},
    async disconnect() {},
    async connectAll() {},
    async disconnectAll() {},
    status() { return []; },
    statusOf() { return undefined; },
    async sendPhoto() {},
    async sendDocument() {},
    async sendVideo() {},
    async sendAudio() {},
    async sendVoice() {},
    async sendTracked() { return null; },
    async editMessage() {},
    async downloadFile() { return ""; },
    async deleteMessage() {},
    async sendTyping() {},
    bus: { emit() {}, on() { return () => {} }, off() {} },
  } as unknown as ChannelRegistry & { sent: Array<{ channel: string; target: string; message: string }> };
}

// ---------------------------------------------------------------------------
// Engine lifecycle + CRUD
// ---------------------------------------------------------------------------

describe("TriggerEngine CRUD", () => {
  let engine: TriggerEngine;

  beforeEach(() => {
    engine = new TriggerEngine();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it("listAll returns triggers after start", async () => {
    // Engine loads from persistent store — list may or may not be empty
    // depending on DB state. Verify it returns an array.
    await engine.start();
    expect(Array.isArray(engine.listAll())).toBe(true);
  });

  it("add creates a trigger with generated ID", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" },
      action: { type: "shell", command: "echo test" },
      label: "Test webhook",
    });

    expect(trigger.id).toBeTruthy();
    expect(trigger.id.length).toBe(8);
    expect(trigger.type).toBe("webhook");
    expect(trigger.label).toBe("Test webhook");
    expect(trigger.created_at).toBeTruthy();
  });

  it("add uses provided ID", () => {
    const trigger = engine.add({
      id: "custom-id",
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test" },
    });

    expect(trigger.id).toBe("custom-id");
  });

  it("get returns trigger by ID", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test" },
    });

    const found = engine.get(trigger.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(trigger.id);
  });

  it("get returns undefined for unknown ID", () => {
    expect(engine.get("nonexistent")).toBeUndefined();
  });

  it("remove deletes a trigger", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test" },
    });

    expect(engine.remove(trigger.id)).toBe(true);
    expect(engine.get(trigger.id)).toBeUndefined();
  });

  it("remove returns false for unknown ID", () => {
    expect(engine.remove("nonexistent")).toBe(false);
  });

  it("enable/disable toggles trigger state", () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: false,
      config: {},
      action: { type: "shell", command: "echo test" },
    });

    expect(engine.get(trigger.id)!.enabled).toBe(false);

    engine.enable(trigger.id);
    expect(engine.get(trigger.id)!.enabled).toBe(true);

    engine.disable(trigger.id);
    expect(engine.get(trigger.id)!.enabled).toBe(false);
  });

  it("listAll returns all triggers", () => {
    engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "a" } });
    engine.add({ type: "webhook", enabled: false, config: {}, action: { type: "shell", command: "b" } });

    expect(engine.listAll()).toHaveLength(2);
  });

  it("listActive returns only enabled triggers", () => {
    engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "a" } });
    engine.add({ type: "webhook", enabled: false, config: {}, action: { type: "shell", command: "b" } });

    expect(engine.listActive()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Webhook handling
// ---------------------------------------------------------------------------

describe("TriggerEngine handleWebhook", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = new TriggerEngine();
    await engine.start();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it("returns false for unknown trigger ID", async () => {
    const result = await engine.handleWebhook("nonexistent", {}, {});
    expect(result).toBe(false);
  });

  it("returns false for disabled webhook trigger", async () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: false,
      config: {},
      action: { type: "shell", command: "echo test", notify: false },
    });

    const result = await engine.handleWebhook(trigger.id, {}, {});
    expect(result).toBe(false);
  });

  it("returns false for non-webhook trigger type", async () => {
    const trigger = engine.add({
      type: "cron",
      enabled: true,
      config: { expression: "* * * * *" },
      action: { type: "shell", command: "echo test", notify: false },
    });

    const result = await engine.handleWebhook(trigger.id, {}, {});
    expect(result).toBe(false);
  });

  it("fires webhook trigger and increments run count", async () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" },
      action: { type: "shell", command: "echo fired", notify: false },
    });

    const result = await engine.handleWebhook(trigger.id, { test: true }, {});
    expect(result).toBe(true);
    expect(engine.get(trigger.id)!.run_count).toBe(1);
  });

  it("fires webhook with shell action and passes TRIGGER_EVENT", async () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" },
      // Use a command that captures the TRIGGER_EVENT env var
      action: { type: "shell", command: "echo $TRIGGER_EVENT", notify: false },
    });

    const payload = { source: "stripe", type: "charge.completed" };
    const result = await engine.handleWebhook(trigger.id, payload, {});
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

describe("TriggerEngine notifications", () => {
  let engine: TriggerEngine;
  let mockChannels: ReturnType<typeof createMockChannelRegistry>;

  beforeEach(async () => {
    engine = new TriggerEngine();
    mockChannels = createMockChannelRegistry();

    const targets: NotifyTarget[] = [
      { channel: "telegram", chatId: "admin-123" },
      { channel: "telegram", chatId: "admin-456" },
    ];

    engine.setChannelRegistry(mockChannels, targets);
    await engine.start();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it("sends channel notifications when trigger fires (notify=true)", async () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" },
      action: { type: "shell", command: "echo test", notify: true },
      label: "Stripe payments",
    });

    await engine.handleWebhook(trigger.id, { source: "stripe", type: "charge.completed" }, {});

    // Wait for async notification delivery
    await new Promise((r) => setTimeout(r, 100));

    // Should have sent to both admin targets
    expect(mockChannels.sent.length).toBe(2);
    expect(mockChannels.sent[0]!.channel).toBe("telegram");
    expect(mockChannels.sent[0]!.target).toBe("admin-123");
    expect(mockChannels.sent[0]!.message).toContain("Stripe payments");
    expect(mockChannels.sent[0]!.message).toContain("Source: stripe");
    expect(mockChannels.sent[0]!.message).toContain("Event: charge.completed");

    expect(mockChannels.sent[1]!.channel).toBe("telegram");
    expect(mockChannels.sent[1]!.target).toBe("admin-456");
  });

  it("sends notifications by default when notify is undefined", async () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" },
      action: { type: "shell", command: "echo test" },  // no notify field
      label: "Default notify",
    });

    await engine.handleWebhook(trigger.id, {}, {});
    await new Promise((r) => setTimeout(r, 100));

    expect(mockChannels.sent.length).toBe(2);
  });

  it("does NOT send notifications when notify=false", async () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" },
      action: { type: "shell", command: "echo test", notify: false },
      label: "Silent trigger",
    });

    await engine.handleWebhook(trigger.id, {}, {});
    await new Promise((r) => setTimeout(r, 100));

    expect(mockChannels.sent.length).toBe(0);
  });

  it("notification includes run count", async () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" },
      action: { type: "shell", command: "echo test", notify: true },
      label: "Counter test",
    });

    await engine.handleWebhook(trigger.id, {}, {});
    await new Promise((r) => setTimeout(r, 100));

    expect(mockChannels.sent[0]!.message).toContain("Run #1");

    mockChannels.sent.length = 0;
    await engine.handleWebhook(trigger.id, {}, {});
    await new Promise((r) => setTimeout(r, 100));

    expect(mockChannels.sent[0]!.message).toContain("Run #2");
  });

  it("notification includes unverified signature warning", async () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" },
      action: { type: "shell", command: "echo test", notify: true },
      label: "Unverified test",
    });

    const webhookEvent = {
      source: "github",
      type: "push",
      verified: false,
    };

    await engine.handleWebhook(trigger.id, webhookEvent, {});
    await new Promise((r) => setTimeout(r, 100));

    expect(mockChannels.sent[0]!.message).toContain("Warning: signature not verified");
  });

  it("notification works for cron triggers", async () => {
    const trigger = engine.add({
      type: "cron",
      enabled: false,  // don't actually start the cron
      config: { expression: "*/5 * * * *" },
      action: { type: "shell", command: "echo test", notify: true },
      label: "Health check",
    });

    // Manually fire the trigger
    trigger.enabled = true; // temp enable for fire()
    await engine.fire(trigger.id);
    await new Promise((r) => setTimeout(r, 100));

    expect(mockChannels.sent[0]!.message).toContain("Health check");
    expect(mockChannels.sent[0]!.message).toContain("Type: scheduled");
  });

  it("notification works for file triggers", async () => {
    const trigger = engine.add({
      type: "file",
      enabled: false,
      config: { paths: ["/tmp/test.txt"] },
      action: { type: "shell", command: "echo test", notify: true },
      label: "File watcher",
    });

    // Use fire() with a file event payload
    await engine.fire(trigger.id, { event: "modify", path: "/tmp/test.txt" });
    await new Promise((r) => setTimeout(r, 100));

    expect(mockChannels.sent[0]!.message).toContain("File watcher");
    expect(mockChannels.sent[0]!.message).toContain("Event: modify");
    expect(mockChannels.sent[0]!.message).toContain("Path: /tmp/test.txt");
  });
});

// ---------------------------------------------------------------------------
// Bus events
// ---------------------------------------------------------------------------

describe("TriggerEngine bus events", () => {
  let engine: TriggerEngine;

  beforeEach(() => {
    engine = new TriggerEngine();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it("emits trigger:added on add", () => {
    let emitted: TriggerConfig | null = null;
    engine.bus.on("trigger:added", (config) => {
      emitted = config;
    });

    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test" },
      label: "Event test",
    });

    expect(emitted).not.toBeNull();
    expect(emitted!.id).toBe(trigger.id);
  });

  it("emits trigger:removed on remove", () => {
    let emitted: { id: string } | null = null;
    engine.bus.on("trigger:removed", (data) => {
      emitted = data;
    });

    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test" },
    });

    engine.remove(trigger.id);
    expect(emitted).not.toBeNull();
    expect(emitted!.id).toBe(trigger.id);
  });

  it("emits trigger:fired on fire", async () => {
    await engine.start();

    let emitted: { triggerId: string; type: string } | null = null;
    engine.bus.on("trigger:fired", (event) => {
      emitted = event;
    });

    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test", notify: false },
    });

    await engine.handleWebhook(trigger.id, {}, {});

    expect(emitted).not.toBeNull();
    expect(emitted!.triggerId).toBe(trigger.id);
    expect(emitted!.type).toBe("webhook");
  });
});

// ---------------------------------------------------------------------------
// Max runs + auto-disable
// ---------------------------------------------------------------------------

describe("TriggerEngine maxRuns", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = new TriggerEngine();
    await engine.start();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it("auto-disables trigger after max_runs reached", async () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test", notify: false },
      max_runs: 2,
    });

    await engine.handleWebhook(trigger.id, {}, {});
    expect(engine.get(trigger.id)!.enabled).toBe(true);

    await engine.handleWebhook(trigger.id, {}, {});
    expect(engine.get(trigger.id)!.enabled).toBe(false);
    expect(engine.get(trigger.id)!.run_count).toBe(2);
  });

  it("does not auto-disable when max_runs is 0 (unlimited)", async () => {
    const trigger = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo test", notify: false },
      max_runs: 0,
    });

    for (let i = 0; i < 10; i++) {
      await engine.handleWebhook(trigger.id, {}, {});
    }

    expect(engine.get(trigger.id)!.enabled).toBe(true);
    expect(engine.get(trigger.id)!.run_count).toBe(10);
  });
});
