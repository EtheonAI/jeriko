// Trigger engine audit tests — exhaustive coverage of all trigger types,
// error handling, auto-disable, store persistence, webhook verification,
// bus events, and edge cases.

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { createHmac } from "node:crypto";
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
import { TriggerEngine, type TriggerConfig, type TriggerFireEvent } from "../../src/daemon/services/triggers/engine.js";
import { TriggerStore } from "../../src/daemon/services/triggers/store.js";
import { WebhookTrigger } from "../../src/daemon/services/triggers/webhook.js";

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  initDatabase(":memory:");
});

afterAll(() => {
  closeDatabase();
});

// ---------------------------------------------------------------------------
// Helper: create engine with fresh state
// ---------------------------------------------------------------------------

function createEngine(): TriggerEngine {
  return new TriggerEngine();
}

// ---------------------------------------------------------------------------
// 1. CRUD operations
// ---------------------------------------------------------------------------

describe("Audit: CRUD", () => {
  let engine: TriggerEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  afterEach(async () => {
    // Clean up all triggers
    for (const t of engine.listAll()) {
      engine.remove(t.id);
    }
    await engine.stop();
  });

  it("add() generates an 8-char ID when none provided", () => {
    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo hi" },
    });
    expect(t.id).toBeTruthy();
    expect(t.id.length).toBe(8);
  });

  it("add() uses provided ID", () => {
    const t = engine.add({
      id: "my-id-01",
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo hi" },
    });
    expect(t.id).toBe("my-id-01");
    engine.remove(t.id);
  });

  it("add() sets created_at automatically", () => {
    const before = new Date().toISOString();
    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo hi" },
    });
    expect(t.created_at).toBeTruthy();
    expect(new Date(t.created_at!).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 1000);
    engine.remove(t.id);
  });

  it("get() returns trigger by ID", () => {
    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo hi" },
    });
    const found = engine.get(t.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(t.id);
    expect(found!.type).toBe("webhook");
    engine.remove(t.id);
  });

  it("get() returns undefined for unknown ID", () => {
    expect(engine.get("nonexistent")).toBeUndefined();
  });

  it("remove() deletes trigger and returns true", () => {
    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo hi" },
    });
    expect(engine.remove(t.id)).toBe(true);
    expect(engine.get(t.id)).toBeUndefined();
  });

  it("remove() returns false for unknown ID", () => {
    expect(engine.remove("nonexistent")).toBe(false);
  });

  it("listAll() returns all triggers", () => {
    const t1 = engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "a" } });
    const t2 = engine.add({ type: "webhook", enabled: false, config: {}, action: { type: "shell", command: "b" } });
    const t3 = engine.add({ type: "cron", enabled: true, config: { expression: "* * * * *" }, action: { type: "shell", command: "c" } });

    const all = engine.listAll();
    expect(all.length).toBeGreaterThanOrEqual(3);
    const ids = all.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
    expect(ids).toContain(t3.id);

    engine.remove(t1.id);
    engine.remove(t2.id);
    engine.remove(t3.id);
  });

  it("listActive() returns only enabled triggers", () => {
    const t1 = engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "a" } });
    const t2 = engine.add({ type: "webhook", enabled: false, config: {}, action: { type: "shell", command: "b" } });

    const active = engine.listActive();
    const ids = active.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).not.toContain(t2.id);

    engine.remove(t1.id);
    engine.remove(t2.id);
  });

  it("enable() activates a disabled trigger", () => {
    const t = engine.add({ type: "webhook", enabled: false, config: {}, action: { type: "shell", command: "a" } });
    expect(engine.get(t.id)!.enabled).toBe(false);
    expect(engine.enable(t.id)).toBe(true);
    expect(engine.get(t.id)!.enabled).toBe(true);
    engine.remove(t.id);
  });

  it("enable() returns false for unknown ID", () => {
    expect(engine.enable("nope")).toBe(false);
  });

  it("disable() deactivates an enabled trigger", () => {
    const t = engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "a" } });
    expect(engine.disable(t.id)).toBe(true);
    expect(engine.get(t.id)!.enabled).toBe(false);
    engine.remove(t.id);
  });

  it("disable() returns false for unknown ID", () => {
    expect(engine.disable("nope")).toBe(false);
  });

  it("update() changes label, action, config, max_runs, enabled", () => {
    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" as const },
      action: { type: "shell", command: "echo old" },
      label: "Old",
      max_runs: 5,
    });

    const updated = engine.update(t.id, {
      label: "New",
      action: { type: "shell", command: "echo new" },
      config: { service: "github" as const },
      max_runs: 10,
      enabled: false,
    });

    expect(updated).toBeDefined();
    expect(updated!.label).toBe("New");
    expect(updated!.action.command).toBe("echo new");
    expect((updated!.config as any).service).toBe("github");
    expect(updated!.max_runs).toBe(10);
    expect(updated!.enabled).toBe(false);
    engine.remove(t.id);
  });

  it("update() returns undefined for unknown ID", () => {
    expect(engine.update("nope", { label: "x" })).toBeUndefined();
  });

  it("enabledCount reflects current enabled count", () => {
    const t1 = engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "a" } });
    const t2 = engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "b" } });
    const t3 = engine.add({ type: "webhook", enabled: false, config: {}, action: { type: "shell", command: "c" } });

    expect(engine.enabledCount).toBeGreaterThanOrEqual(2);

    engine.remove(t1.id);
    engine.remove(t2.id);
    engine.remove(t3.id);
  });
});

// ---------------------------------------------------------------------------
// 2. Webhook verification (WebhookTrigger class)
// ---------------------------------------------------------------------------

describe("Audit: WebhookTrigger verification", () => {
  const secret = "test-secret-key-123";

  describe("generic", () => {
    it("verifies valid X-Signature header", () => {
      const trigger = new WebhookTrigger({ secret, service: "generic" });
      const body = '{"event":"test"}';
      const sig = createHmac("sha256", secret).update(body).digest("hex");

      expect(trigger.verify(body, { "x-signature": sig })).toBe(true);
    });

    it("verifies valid X-Webhook-Signature header", () => {
      const trigger = new WebhookTrigger({ secret, service: "generic" });
      const body = '{"event":"test"}';
      const sig = createHmac("sha256", secret).update(body).digest("hex");

      expect(trigger.verify(body, { "x-webhook-signature": sig })).toBe(true);
    });

    it("rejects invalid signature", () => {
      const trigger = new WebhookTrigger({ secret, service: "generic" });
      const body = '{"event":"test"}';

      expect(trigger.verify(body, { "x-signature": "invalid-hex" })).toBe(false);
    });

    it("rejects missing signature header", () => {
      const trigger = new WebhookTrigger({ secret, service: "generic" });
      expect(trigger.verify("{}", {})).toBe(false);
    });

    it("accepts when no secret is configured", () => {
      const trigger = new WebhookTrigger({});
      expect(trigger.verify("{}", {})).toBe(true);
    });

    it("stringifies non-string payload for verification", () => {
      const trigger = new WebhookTrigger({ secret, service: "generic" });
      const payload = { event: "test" };
      const bodyStr = JSON.stringify(payload);
      const sig = createHmac("sha256", secret).update(bodyStr).digest("hex");

      expect(trigger.verify(payload, { "x-signature": sig })).toBe(true);
    });
  });

  describe("github", () => {
    it("verifies valid X-Hub-Signature-256", () => {
      const trigger = new WebhookTrigger({ secret, service: "github" });
      const body = '{"action":"push"}';
      const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

      expect(trigger.verify(body, { "x-hub-signature-256": sig })).toBe(true);
    });

    it("rejects invalid GitHub signature", () => {
      const trigger = new WebhookTrigger({ secret, service: "github" });
      expect(trigger.verify("{}", { "x-hub-signature-256": "sha256=bad" })).toBe(false);
    });

    it("rejects missing GitHub signature header", () => {
      const trigger = new WebhookTrigger({ secret, service: "github" });
      expect(trigger.verify("{}", {})).toBe(false);
    });
  });

  describe("stripe", () => {
    it("verifies valid Stripe-Signature", () => {
      const trigger = new WebhookTrigger({ secret, service: "stripe" });
      const body = '{"type":"charge.succeeded"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${timestamp}.${body}`;
      const v1 = createHmac("sha256", secret).update(signedPayload).digest("hex");
      const sigHeader = `t=${timestamp},v1=${v1}`;

      expect(trigger.verify(body, { "stripe-signature": sigHeader })).toBe(true);
    });

    it("rejects expired Stripe timestamp (>5 min)", () => {
      const trigger = new WebhookTrigger({ secret, service: "stripe" });
      const body = '{"type":"charge.succeeded"}';
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
      const signedPayload = `${oldTimestamp}.${body}`;
      const v1 = createHmac("sha256", secret).update(signedPayload).digest("hex");
      const sigHeader = `t=${oldTimestamp},v1=${v1}`;

      expect(trigger.verify(body, { "stripe-signature": sigHeader })).toBe(false);
    });

    it("rejects missing Stripe-Signature header", () => {
      const trigger = new WebhookTrigger({ secret, service: "stripe" });
      expect(trigger.verify("{}", {})).toBe(false);
    });

    it("rejects malformed Stripe-Signature (no v1)", () => {
      const trigger = new WebhookTrigger({ secret, service: "stripe" });
      expect(trigger.verify("{}", { "stripe-signature": "t=12345" })).toBe(false);
    });

    it("rejects invalid Stripe HMAC", () => {
      const trigger = new WebhookTrigger({ secret, service: "stripe" });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const sigHeader = `t=${timestamp},v1=invalid`;
      expect(trigger.verify("{}", { "stripe-signature": sigHeader })).toBe(false);
    });
  });

  describe("paypal", () => {
    it("verifies valid PayPal headers", () => {
      const trigger = new WebhookTrigger({ secret, service: "paypal" });
      const body = '{"event":"PAYMENT.COMPLETED"}';
      const transmissionId = "abc-123";
      const transmissionTime = "2026-01-01T00:00:00Z";
      const sig = createHmac("sha256", secret)
        .update(`${transmissionId}|${transmissionTime}|${body}`)
        .digest("hex");

      expect(trigger.verify(body, {
        "paypal-transmission-id": transmissionId,
        "paypal-transmission-time": transmissionTime,
        "paypal-transmission-sig": sig,
      })).toBe(true);
    });

    it("rejects missing PayPal headers", () => {
      const trigger = new WebhookTrigger({ secret, service: "paypal" });
      expect(trigger.verify("{}", {})).toBe(false);
    });

    it("rejects invalid PayPal signature", () => {
      const trigger = new WebhookTrigger({ secret, service: "paypal" });
      expect(trigger.verify("{}", {
        "paypal-transmission-id": "x",
        "paypal-transmission-time": "y",
        "paypal-transmission-sig": "bad",
      })).toBe(false);
    });
  });

  describe("twilio", () => {
    it("verifies valid Twilio signature", () => {
      const trigger = new WebhookTrigger({ secret, service: "twilio" });
      const body = "Body=Hello&From=%2B1234567890";
      const sig = createHmac("sha1", secret).update(body).digest("base64");

      expect(trigger.verify(body, { "x-twilio-signature": sig })).toBe(true);
    });

    it("rejects missing Twilio signature header", () => {
      const trigger = new WebhookTrigger({ secret, service: "twilio" });
      expect(trigger.verify("{}", {})).toBe(false);
    });

    it("rejects invalid Twilio signature", () => {
      const trigger = new WebhookTrigger({ secret, service: "twilio" });
      expect(trigger.verify("{}", { "x-twilio-signature": "bad" })).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. handleWebhook integration
// ---------------------------------------------------------------------------

describe("Audit: handleWebhook", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
    await engine.start();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("returns false for nonexistent trigger", async () => {
    expect(await engine.handleWebhook("nope", {}, {})).toBe(false);
  });

  it("returns false for disabled webhook", async () => {
    const t = engine.add({
      type: "webhook", enabled: false, config: {},
      action: { type: "shell", command: "echo x", notify: false },
    });
    expect(await engine.handleWebhook(t.id, {}, {})).toBe(false);
  });

  it("returns false for non-webhook type", async () => {
    const t = engine.add({
      type: "cron", enabled: true, config: { expression: "* * * * *" },
      action: { type: "shell", command: "echo x", notify: false },
    });
    expect(await engine.handleWebhook(t.id, {}, {})).toBe(false);
  });

  it("fires webhook with no secret (accepts without verification)", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok", notify: false },
    });
    expect(await engine.handleWebhook(t.id, { test: true }, {})).toBe(true);
    expect(engine.get(t.id)!.run_count).toBe(1);
  });

  it("fires webhook with valid signature", async () => {
    const secret = "wh-secret";
    const t = engine.add({
      type: "webhook", enabled: true,
      config: { secret, service: "generic" as const },
      action: { type: "shell", command: "echo ok", notify: false },
    });

    const body = '{"data":"value"}';
    const sig = createHmac("sha256", secret).update(body).digest("hex");

    expect(await engine.handleWebhook(t.id, body, { "x-signature": sig })).toBe(true);
    expect(engine.get(t.id)!.run_count).toBe(1);
  });

  it("rejects webhook with invalid signature", async () => {
    const t = engine.add({
      type: "webhook", enabled: true,
      config: { secret: "correct-secret", service: "generic" as const },
      action: { type: "shell", command: "echo ok", notify: false },
    });

    expect(await engine.handleWebhook(t.id, "{}", { "x-signature": "wrong" })).toBe(false);
    expect(engine.get(t.id)!.run_count ?? 0).toBe(0);
  });

  it("increments run_count on each fire", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok", notify: false },
    });

    await engine.handleWebhook(t.id, {}, {});
    await engine.handleWebhook(t.id, {}, {});
    await engine.handleWebhook(t.id, {}, {});

    expect(engine.get(t.id)!.run_count).toBe(3);
  });

  it("sets last_fired timestamp", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok", notify: false },
    });

    await engine.handleWebhook(t.id, {}, {});

    const trigger = engine.get(t.id)!;
    expect(trigger.last_fired).toBeTruthy();
    const lastFired = new Date(trigger.last_fired!).getTime();
    expect(lastFired).toBeGreaterThan(Date.now() - 5000);
  });
});

// ---------------------------------------------------------------------------
// 4. max_runs enforcement
// ---------------------------------------------------------------------------

describe("Audit: max_runs", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
    await engine.start();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("auto-disables after max_runs reached", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok", notify: false },
      max_runs: 3,
    });

    await engine.handleWebhook(t.id, {}, {});
    expect(engine.get(t.id)!.enabled).toBe(true);

    await engine.handleWebhook(t.id, {}, {});
    expect(engine.get(t.id)!.enabled).toBe(true);

    await engine.handleWebhook(t.id, {}, {});
    expect(engine.get(t.id)!.enabled).toBe(false);
    expect(engine.get(t.id)!.run_count).toBe(3);
  });

  it("max_runs=1 disables after first fire", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok", notify: false },
      max_runs: 1,
    });

    await engine.handleWebhook(t.id, {}, {});
    expect(engine.get(t.id)!.enabled).toBe(false);
    expect(engine.get(t.id)!.run_count).toBe(1);
  });

  it("max_runs=0 means unlimited", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok", notify: false },
      max_runs: 0,
    });

    for (let i = 0; i < 15; i++) {
      await engine.handleWebhook(t.id, {}, {});
    }

    expect(engine.get(t.id)!.enabled).toBe(true);
    expect(engine.get(t.id)!.run_count).toBe(15);
  });

  it("max_runs undefined means unlimited", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok", notify: false },
    });

    for (let i = 0; i < 10; i++) {
      await engine.handleWebhook(t.id, {}, {});
    }

    expect(engine.get(t.id)!.enabled).toBe(true);
    expect(engine.get(t.id)!.run_count).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 5. Error recording and auto-disable after 5 consecutive errors
// ---------------------------------------------------------------------------

describe("Audit: error recording and auto-disable", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
    await engine.start();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("records error on shell command failure", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "exit 1", notify: false },
    });

    await engine.handleWebhook(t.id, {}, {});
    expect(engine.get(t.id)!.error_count).toBe(1);
  });

  it("resets error_count on successful shell execution", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "exit 1", notify: false },
    });

    // Accumulate 3 errors
    await engine.handleWebhook(t.id, {}, {});
    await engine.handleWebhook(t.id, {}, {});
    await engine.handleWebhook(t.id, {}, {});
    expect(engine.get(t.id)!.error_count).toBe(3);

    // Change action to a successful command
    engine.update(t.id, { action: { type: "shell", command: "echo ok", notify: false } });

    await engine.handleWebhook(t.id, {}, {});
    expect(engine.get(t.id)!.error_count).toBe(0);
  });

  it("auto-disables after 5 consecutive errors", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "exit 1", notify: false },
    });

    const errorEvents: Array<{ triggerId: string; error: string }> = [];
    engine.bus.on("trigger:error", (e) => errorEvents.push(e));

    for (let i = 0; i < 5; i++) {
      await engine.handleWebhook(t.id, {}, {});
    }

    expect(engine.get(t.id)!.enabled).toBe(false);
    expect(engine.get(t.id)!.error_count).toBe(5);

    // Should have emitted auto-disable error event
    const autoDisableEvent = errorEvents.find((e) => e.error.includes("Auto-disabled"));
    expect(autoDisableEvent).toBeDefined();
    expect(autoDisableEvent!.triggerId).toBe(t.id);
  });

  it("does NOT auto-disable at 4 errors", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "exit 1", notify: false },
    });

    for (let i = 0; i < 4; i++) {
      await engine.handleWebhook(t.id, {}, {});
    }

    expect(engine.get(t.id)!.enabled).toBe(true);
    expect(engine.get(t.id)!.error_count).toBe(4);
  });

  it("error_count persists through save/load cycle", async () => {
    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "exit 1", notify: false },
    });

    // Generate 3 errors
    await engine.handleWebhook(t.id, {}, {});
    await engine.handleWebhook(t.id, {}, {});
    await engine.handleWebhook(t.id, {}, {});

    // Load in a new engine instance
    const engine2 = createEngine();
    await engine2.start();

    const loaded = engine2.get(t.id);
    expect(loaded).toBeDefined();
    expect(loaded!.error_count).toBe(3);

    await engine2.stop();
  });
});

// ---------------------------------------------------------------------------
// 6. Bus events
// ---------------------------------------------------------------------------

describe("Audit: bus events", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("emits trigger:added on add()", () => {
    const events: TriggerConfig[] = [];
    engine.bus.on("trigger:added", (e) => events.push(e));

    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok" },
      label: "Test",
    });

    expect(events.length).toBe(1);
    expect(events[0]!.id).toBe(t.id);
    expect(events[0]!.label).toBe("Test");
  });

  it("emits trigger:removed on remove()", () => {
    const events: Array<{ id: string }> = [];
    engine.bus.on("trigger:removed", (e) => events.push(e));

    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok" },
    });
    engine.remove(t.id);

    expect(events.length).toBe(1);
    expect(events[0]!.id).toBe(t.id);
  });

  it("does NOT emit trigger:removed for unknown ID", () => {
    const events: Array<{ id: string }> = [];
    engine.bus.on("trigger:removed", (e) => events.push(e));

    engine.remove("nonexistent");
    expect(events.length).toBe(0);
  });

  it("emits trigger:fired on handleWebhook", async () => {
    await engine.start();

    const events: TriggerFireEvent[] = [];
    engine.bus.on("trigger:fired", (e) => events.push(e));

    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok", notify: false },
    });

    await engine.handleWebhook(t.id, { key: "val" }, {});

    expect(events.length).toBe(1);
    expect(events[0]!.triggerId).toBe(t.id);
    expect(events[0]!.type).toBe("webhook");
    expect(events[0]!.timestamp).toBeTruthy();
    expect(events[0]!.payload).toEqual({ key: "val" });
  });

  it("emits trigger:fired on manual fire()", async () => {
    await engine.start();

    const events: TriggerFireEvent[] = [];
    engine.bus.on("trigger:fired", (e) => events.push(e));

    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "echo ok", notify: false },
    });

    await engine.fire(t.id, { manual: true });

    expect(events.length).toBe(1);
    expect(events[0]!.triggerId).toBe(t.id);
    expect(events[0]!.payload).toEqual({ manual: true });
  });

  it("fire() throws for unknown trigger", async () => {
    await engine.start();
    await expect(engine.fire("nonexistent")).rejects.toThrow('Trigger "nonexistent" not found');
  });

  it("emits trigger:error on auto-disable", async () => {
    await engine.start();

    const errorEvents: Array<{ triggerId: string; error: string }> = [];
    engine.bus.on("trigger:error", (e) => errorEvents.push(e));

    const t = engine.add({
      type: "webhook", enabled: true, config: {},
      action: { type: "shell", command: "exit 1", notify: false },
    });

    for (let i = 0; i < 5; i++) {
      await engine.handleWebhook(t.id, {}, {});
    }

    const autoDisable = errorEvents.find((e) => e.error.includes("Auto-disabled"));
    expect(autoDisable).toBeDefined();
    expect(autoDisable!.triggerId).toBe(t.id);
    expect(autoDisable!.error).toContain("5 consecutive errors");
  });
});

// ---------------------------------------------------------------------------
// 7. Store persistence (TriggerStore)
// ---------------------------------------------------------------------------

describe("Audit: TriggerStore", () => {
  let store: TriggerStore;

  beforeEach(() => {
    store = new TriggerStore();
  });

  it("save and get round-trip", () => {
    const config: TriggerConfig = {
      id: "store-test-1",
      type: "webhook",
      enabled: true,
      config: { secret: "s3cr3t", service: "github" as const },
      action: { type: "shell", command: "echo hi" },
      label: "Store test",
      run_count: 5,
      error_count: 2,
      max_runs: 10,
      created_at: "2026-01-01T00:00:00.000Z",
    };

    store.save(config);
    const loaded = store.get("store-test-1");

    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("store-test-1");
    expect(loaded!.type).toBe("webhook");
    expect(loaded!.enabled).toBe(true);
    expect((loaded!.config as any).secret).toBe("s3cr3t");
    expect((loaded!.config as any).service).toBe("github");
    expect(loaded!.action.type).toBe("shell");
    expect((loaded!.action as any).command).toBe("echo hi");
    expect(loaded!.label).toBe("Store test");
    expect(loaded!.run_count).toBe(5);
    expect(loaded!.error_count).toBe(2);
    expect(loaded!.max_runs).toBe(10);

    store.remove("store-test-1");
  });

  it("save upserts (updates existing row)", () => {
    const config: TriggerConfig = {
      id: "store-upsert",
      type: "cron",
      enabled: true,
      config: { expression: "* * * * *" },
      action: { type: "shell", command: "echo v1" },
      created_at: "2026-01-01T00:00:00.000Z",
    };

    store.save(config);
    expect(store.get("store-upsert")!.action.command).toBe("echo v1");

    config.action = { type: "shell", command: "echo v2" };
    config.error_count = 3;
    store.save(config);

    const loaded = store.get("store-upsert");
    expect(loaded!.action.command).toBe("echo v2");
    expect(loaded!.error_count).toBe(3);

    store.remove("store-upsert");
  });

  it("remove returns true for existing, false for missing", () => {
    store.save({
      id: "store-rm",
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo" },
      created_at: new Date().toISOString(),
    });

    expect(store.remove("store-rm")).toBe(true);
    expect(store.remove("store-rm")).toBe(false);
  });

  it("listAll returns all saved triggers", () => {
    const ids = ["store-list-a", "store-list-b", "store-list-c"];
    for (const id of ids) {
      store.save({
        id,
        type: "webhook",
        enabled: true,
        config: {},
        action: { type: "shell", command: "echo" },
        created_at: new Date().toISOString(),
      });
    }

    const all = store.listAll();
    const allIds = all.map((t) => t.id);
    for (const id of ids) {
      expect(allIds).toContain(id);
    }

    for (const id of ids) store.remove(id);
  });

  it("listByType filters correctly", () => {
    store.save({
      id: "store-type-wh",
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo" },
      created_at: new Date().toISOString(),
    });
    store.save({
      id: "store-type-cr",
      type: "cron",
      enabled: true,
      config: { expression: "* * * * *" },
      action: { type: "shell", command: "echo" },
      created_at: new Date().toISOString(),
    });

    const webhooks = store.listByType("webhook");
    const webhookIds = webhooks.map((t) => t.id);
    expect(webhookIds).toContain("store-type-wh");
    expect(webhookIds).not.toContain("store-type-cr");

    const crons = store.listByType("cron");
    expect(crons.map((t) => t.id)).toContain("store-type-cr");

    store.remove("store-type-wh");
    store.remove("store-type-cr");
  });

  it("recordFire updates run_count and last_fired", () => {
    store.save({
      id: "store-fire",
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo" },
      run_count: 0,
      created_at: new Date().toISOString(),
    });

    store.recordFire("store-fire", 7);
    const loaded = store.get("store-fire");
    expect(loaded!.run_count).toBe(7);
    expect(loaded!.last_fired).toBeTruthy();

    store.remove("store-fire");
  });

  it("recordFire without runCount increments", () => {
    store.save({
      id: "store-fire-inc",
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo" },
      run_count: 3,
      created_at: new Date().toISOString(),
    });

    store.recordFire("store-fire-inc");
    const loaded = store.get("store-fire-inc");
    expect(loaded!.run_count).toBe(4);

    store.remove("store-fire-inc");
  });

  it("get returns null for nonexistent ID", () => {
    expect(store.get("does-not-exist")).toBeNull();
  });

  it("handles all trigger types in store", () => {
    const types: TriggerConfig["type"][] = ["cron", "webhook", "file", "http", "email", "once"];
    for (const type of types) {
      const id = `store-type-${type}`;
      store.save({
        id,
        type,
        enabled: true,
        config: {},
        action: { type: "shell", command: "echo" },
        created_at: new Date().toISOString(),
      });

      const loaded = store.get(id);
      expect(loaded).not.toBeNull();
      expect(loaded!.type).toBe(type);

      store.remove(id);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. safeParse in store (corrupt data handling)
// ---------------------------------------------------------------------------

describe("Audit: safeParse (corrupt JSON)", () => {
  it("returns empty object for invalid JSON", () => {
    // We test safeParse indirectly by saving corrupt data and loading it.
    // The store uses safeParse on config and action columns.
    // We can test this by writing directly to the DB.
    const { getDatabase } = require("../../src/daemon/storage/db.js");
    const db = getDatabase();

    // Ensure the table exists by creating a store instance
    const store = new TriggerStore();
    store.save({
      id: "safeparse-test",
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo" },
      created_at: new Date().toISOString(),
    });

    // Corrupt the config and action columns directly
    db.prepare("UPDATE trigger_config SET config = ?, action = ? WHERE id = ?")
      .run("not-valid-json{{{", "also-broken]]]", "safeparse-test");

    // Loading should NOT throw — safeParse returns {}
    const loaded = store.get("safeparse-test");
    expect(loaded).not.toBeNull();
    expect(loaded!.config).toEqual({});
    expect(loaded!.action).toEqual({});

    store.remove("safeparse-test");
  });
});

// ---------------------------------------------------------------------------
// 9. Once trigger (immediate and delayed)
// ---------------------------------------------------------------------------

describe("Audit: once trigger", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
    await engine.start();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("fires immediately when at is in the past", async () => {
    const fired: TriggerFireEvent[] = [];
    engine.bus.on("trigger:fired", (e) => fired.push(e));

    const t = engine.add({
      type: "once",
      enabled: true,
      config: { at: new Date(Date.now() - 10000).toISOString() },
      action: { type: "shell", command: "echo once", notify: false },
    });

    // Wait for setTimeout(fn, 0) to fire
    await new Promise((r) => setTimeout(r, 500));

    expect(fired.some((e) => e.triggerId === t.id)).toBe(true);
    // Should be auto-disabled after firing
    expect(engine.get(t.id)!.enabled).toBe(false);
  });

  it("fires after short delay", async () => {
    const fired: TriggerFireEvent[] = [];
    engine.bus.on("trigger:fired", (e) => fired.push(e));

    const t = engine.add({
      type: "once",
      enabled: true,
      config: { at: new Date(Date.now() + 200).toISOString() },
      action: { type: "shell", command: "echo once-delayed", notify: false },
    });

    // Should NOT have fired yet
    expect(fired.some((e) => e.triggerId === t.id)).toBe(false);

    // Wait for it to fire
    await new Promise((r) => setTimeout(r, 800));

    expect(fired.some((e) => e.triggerId === t.id)).toBe(true);
    expect(engine.get(t.id)!.enabled).toBe(false);
  });

  it("does not fire if removed before delay", async () => {
    const fired: TriggerFireEvent[] = [];
    engine.bus.on("trigger:fired", (e) => fired.push(e));

    const t = engine.add({
      type: "once",
      enabled: true,
      config: { at: new Date(Date.now() + 2000).toISOString() },
      action: { type: "shell", command: "echo cancelled", notify: false },
    });

    // Remove before it fires
    engine.remove(t.id);

    await new Promise((r) => setTimeout(r, 500));
    expect(fired.some((e) => e.triggerId === t.id)).toBe(false);
  });

  it("does not fire when added disabled", async () => {
    const fired: TriggerFireEvent[] = [];
    engine.bus.on("trigger:fired", (e) => fired.push(e));

    engine.add({
      type: "once",
      enabled: false,
      config: { at: new Date(Date.now() - 1000).toISOString() },
      action: { type: "shell", command: "echo nope", notify: false },
    });

    await new Promise((r) => setTimeout(r, 300));
    expect(fired.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Cron trigger scheduling
// ---------------------------------------------------------------------------

describe("Audit: cron trigger", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
    await engine.start();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("adds cron trigger without error", () => {
    const t = engine.add({
      type: "cron",
      enabled: false,
      config: { expression: "*/5 * * * *" },
      action: { type: "shell", command: "echo cron" },
    });
    expect(t.type).toBe("cron");
    expect(t.id).toBeTruthy();
  });

  it("can fire cron trigger manually", async () => {
    const fired: TriggerFireEvent[] = [];
    engine.bus.on("trigger:fired", (e) => fired.push(e));

    const t = engine.add({
      type: "cron",
      enabled: true,
      config: { expression: "*/5 * * * *" },
      action: { type: "shell", command: "echo cron-fired", notify: false },
    });

    await engine.fire(t.id);
    expect(fired.length).toBe(1);
    expect(fired[0]!.type).toBe("cron");
  });

  it("deactivation stops the cron", () => {
    const t = engine.add({
      type: "cron",
      enabled: true,
      config: { expression: "* * * * * *" },
      action: { type: "shell", command: "echo cron" },
    });

    engine.disable(t.id);
    // No error should occur; cron should be cleaned up
    expect(engine.get(t.id)!.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. File trigger setup/cleanup
// ---------------------------------------------------------------------------

describe("Audit: file trigger", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
    await engine.start();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("adds file trigger without error", () => {
    const t = engine.add({
      type: "file",
      enabled: false,
      config: { paths: ["/tmp"] },
      action: { type: "shell", command: "echo file-changed" },
    });
    expect(t.type).toBe("file");
  });

  it("can fire file trigger manually with payload", async () => {
    const fired: TriggerFireEvent[] = [];
    engine.bus.on("trigger:fired", (e) => fired.push(e));

    const t = engine.add({
      type: "file",
      enabled: true,
      config: { paths: ["/tmp"] },
      action: { type: "shell", command: "echo file-event", notify: false },
    });

    await engine.fire(t.id, { event: "modify", path: "/tmp/test.txt" });
    expect(fired.length).toBe(1);
    expect(fired[0]!.payload).toEqual({ event: "modify", path: "/tmp/test.txt" });
  });

  it("cleanup works on remove", () => {
    const t = engine.add({
      type: "file",
      enabled: true,
      config: { paths: ["/tmp"] },
      action: { type: "shell", command: "echo file-cleanup" },
    });

    // Should not throw
    engine.remove(t.id);
    expect(engine.get(t.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 12. HTTP trigger initial poll + interval
// ---------------------------------------------------------------------------

describe("Audit: HTTP trigger", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
    await engine.start();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("adds HTTP trigger (disabled, no poll)", () => {
    const t = engine.add({
      type: "http",
      enabled: false,
      config: { url: "https://example.com/api", intervalMs: 60000 },
      action: { type: "shell", command: "echo http" },
    });
    expect(t.type).toBe("http");
  });

  it("cleanup works on remove for active http trigger", () => {
    // We add an enabled HTTP trigger pointing to a non-existent URL.
    // The poll will fail, but remove should still clean up the interval.
    const t = engine.add({
      type: "http",
      enabled: true,
      config: { url: "http://127.0.0.1:19999/nonexistent", intervalMs: 999999 },
      action: { type: "shell", command: "echo http-poll", notify: false },
    });

    // Should not throw
    engine.remove(t.id);
    expect(engine.get(t.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 13. Engine lifecycle (start/stop)
// ---------------------------------------------------------------------------

describe("Audit: engine lifecycle", () => {
  it("start() is idempotent", async () => {
    const engine = createEngine();
    await engine.start();
    await engine.start(); // should not throw or double-load
    await engine.stop();
  });

  it("stop() is idempotent", async () => {
    const engine = createEngine();
    await engine.start();
    await engine.stop();
    await engine.stop(); // should not throw
  });

  it("start() loads persisted triggers from store", async () => {
    // Add a trigger, then create a new engine and verify it loads
    const engine1 = createEngine();
    const t = engine1.add({
      id: "persist-lifecycle",
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo persist" },
    });
    await engine1.stop();

    const engine2 = createEngine();
    await engine2.start();

    const loaded = engine2.get("persist-lifecycle");
    expect(loaded).toBeDefined();
    expect(loaded!.type).toBe("webhook");

    engine2.remove("persist-lifecycle");
    await engine2.stop();
  });

  it("triggers added before start() are not activated until start()", async () => {
    const engine = createEngine();

    const fired: TriggerFireEvent[] = [];
    engine.bus.on("trigger:fired", (e) => fired.push(e));

    // Add a once trigger with past time, but engine not started
    const t = engine.add({
      type: "once",
      enabled: true,
      config: { at: new Date(Date.now() - 5000).toISOString() },
      action: { type: "shell", command: "echo not-yet", notify: false },
    });

    // Wait a bit -- should NOT fire because engine is not running
    await new Promise((r) => setTimeout(r, 300));
    expect(fired.length).toBe(0);

    // Now start -- it should activate and fire
    await engine.start();
    await new Promise((r) => setTimeout(r, 500));

    expect(fired.some((e) => e.triggerId === t.id)).toBe(true);

    for (const tr of engine.listAll()) engine.remove(tr.id);
    await engine.stop();
  });
});

// ---------------------------------------------------------------------------
// 14. enforceLimits
// ---------------------------------------------------------------------------

describe("Audit: enforceLimits", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("disables excess triggers (newest first)", () => {
    // Create 5 enabled triggers with staggered creation times
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const t = engine.add({
        type: "webhook",
        enabled: true,
        config: {},
        action: { type: "shell", command: `echo t${i}` },
        created_at: new Date(Date.now() + i * 1000).toISOString(),
      });
      ids.push(t.id);
    }

    // Enforce limit of 3 -- should disable 2 newest
    const disabled = engine.enforceLimits(3);

    expect(disabled.length).toBe(2);
    expect(disabled).toContain(ids[3]!);
    expect(disabled).toContain(ids[4]!);
    expect(engine.get(ids[0]!)!.enabled).toBe(true);
    expect(engine.get(ids[1]!)!.enabled).toBe(true);
    expect(engine.get(ids[2]!)!.enabled).toBe(true);
    expect(engine.get(ids[3]!)!.enabled).toBe(false);
    expect(engine.get(ids[4]!)!.enabled).toBe(false);
  });

  it("returns empty array when within limits", () => {
    engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "echo" } });
    engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "echo" } });

    const disabled = engine.enforceLimits(5);
    expect(disabled.length).toBe(0);
  });

  it("does not touch disabled triggers", () => {
    const enabled1 = engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "echo" } });
    const disabled1 = engine.add({ type: "webhook", enabled: false, config: {}, action: { type: "shell", command: "echo" } });
    const enabled2 = engine.add({ type: "webhook", enabled: true, config: {}, action: { type: "shell", command: "echo" } });

    // Enforce limit of 1 enabled -- should disable 1 of the 2 enabled
    const disabled = engine.enforceLimits(1);
    expect(disabled.length).toBe(1);
    // The already-disabled trigger should remain unchanged
    expect(engine.get(disabled1.id)!.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 15. Update with enable/disable transitions while running
// ---------------------------------------------------------------------------

describe("Audit: update() transitions", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
    await engine.start();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("update enables a previously disabled trigger", () => {
    const t = engine.add({
      type: "webhook",
      enabled: false,
      config: {},
      action: { type: "shell", command: "echo" },
    });

    const updated = engine.update(t.id, { enabled: true });
    expect(updated!.enabled).toBe(true);
  });

  it("update disables a previously enabled trigger", () => {
    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo" },
    });

    const updated = engine.update(t.id, { enabled: false });
    expect(updated!.enabled).toBe(false);
  });

  it("update restarts trigger when config changes while enabled", () => {
    // This tests the "config changed while active" path in update()
    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: { secret: "old" },
      action: { type: "shell", command: "echo" },
    });

    const updated = engine.update(t.id, { config: { secret: "new" } as any });
    expect(updated).toBeDefined();
    expect((updated!.config as any).secret).toBe("new");
  });
});

// ---------------------------------------------------------------------------
// 16. Email trigger type in engine
// ---------------------------------------------------------------------------

describe("Audit: email trigger type", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("creates email trigger with connector config", () => {
    const t = engine.add({
      type: "email",
      enabled: false,
      config: { connector: "gmail", intervalMs: 60000 },
      action: { type: "shell", command: "echo email" },
    });
    expect(t.type).toBe("email");
  });

  it("persists email trigger through engine restart", async () => {
    const t = engine.add({
      type: "email",
      enabled: false,
      config: { connector: "outlook", from: "test@test.com" },
      action: { type: "shell", command: "echo email" },
      label: "Email persist test",
    });

    const engine2 = createEngine();
    await engine2.start();
    const loaded = engine2.get(t.id);
    expect(loaded).toBeDefined();
    expect(loaded!.type).toBe("email");
    expect(loaded!.label).toBe("Email persist test");
    expect((loaded!.config as any).connector).toBe("outlook");

    engine2.remove(t.id);
    await engine2.stop();
  });
});

// ---------------------------------------------------------------------------
// 17. Webhook trigger with connector-aware dispatch path
// ---------------------------------------------------------------------------

describe("Audit: connector-aware webhook dispatch", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
    await engine.start();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("falls through to built-in verifier when no connector manager", async () => {
    // No setConnectorManager called
    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "stripe" as const },
      action: { type: "shell", command: "echo ok", notify: false },
    });

    // Without secret, should accept
    const result = await engine.handleWebhook(t.id, {}, {});
    expect(result).toBe(true);
  });

  it("falls through to built-in when connector dispatch fails", async () => {
    // Create a mock connector manager that throws
    const mockManager = {
      dispatchWebhook: async () => { throw new Error("connector failed"); },
    } as any;

    engine.setConnectorManager(mockManager);

    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "stripe" as const },
      action: { type: "shell", command: "echo ok", notify: false },
    });

    // Without secret, should accept via fallback
    const result = await engine.handleWebhook(t.id, {}, {});
    expect(result).toBe(true);
  });

  it("uses connector result when dispatch succeeds", async () => {
    const webhookEvent = {
      source: "stripe",
      type: "charge.completed",
      verified: true,
      data: { id: "ch_123" },
    };

    const mockManager = {
      dispatchWebhook: async () => webhookEvent,
    } as any;

    engine.setConnectorManager(mockManager);

    const fired: TriggerFireEvent[] = [];
    engine.bus.on("trigger:fired", (e) => fired.push(e));

    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "stripe" as const },
      action: { type: "shell", command: "echo ok", notify: false },
    });

    const result = await engine.handleWebhook(t.id, {}, {}, "raw-body");
    expect(result).toBe(true);
    expect(fired.length).toBe(1);
    expect(fired[0]!.payload).toEqual(webhookEvent);
  });

  it("skips connector path for generic service", async () => {
    const mockManager = {
      dispatchWebhook: async () => { throw new Error("should not be called"); },
    } as any;

    engine.setConnectorManager(mockManager);

    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: { service: "generic" as const },
      action: { type: "shell", command: "echo ok", notify: false },
    });

    // Generic service should NOT go through connector
    const result = await engine.handleWebhook(t.id, {}, {});
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 18. Edge cases
// ---------------------------------------------------------------------------

describe("Audit: edge cases", () => {
  let engine: TriggerEngine;

  beforeEach(async () => {
    engine = createEngine();
    await engine.start();
  });

  afterEach(async () => {
    for (const t of engine.listAll()) engine.remove(t.id);
    await engine.stop();
  });

  it("shell action with no command does not throw", async () => {
    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", notify: false },
    });

    // Should not throw -- just logs warning
    await engine.handleWebhook(t.id, {}, {});
    // run_count is still incremented
    expect(engine.get(t.id)!.run_count).toBe(1);
  });

  it("agent action with no prompt does not throw", async () => {
    const t = engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "agent", notify: false },
    });

    // Should not throw
    await engine.handleWebhook(t.id, {}, {});
    expect(engine.get(t.id)!.run_count).toBe(1);
  });

  it("handles all 6 trigger types in store round-trip via engine", async () => {
    const types: TriggerConfig["type"][] = ["cron", "webhook", "file", "http", "email", "once"];
    const ids: string[] = [];

    for (const type of types) {
      const config: any = {};
      if (type === "cron") config.expression = "* * * * *";
      if (type === "file") config.paths = ["/tmp"];
      if (type === "http") config.url = "http://localhost:9999";
      if (type === "email") config.connector = "gmail";
      if (type === "once") config.at = new Date(Date.now() + 99999999).toISOString();

      const t = engine.add({
        type,
        enabled: false,
        config,
        action: { type: "shell", command: `echo ${type}` },
        label: `Test ${type}`,
      });
      ids.push(t.id);
    }

    // Verify all are retrievable
    for (let i = 0; i < types.length; i++) {
      const t = engine.get(ids[i]!);
      expect(t).toBeDefined();
      expect(t!.type).toBe(types[i]);
    }

    // Clean up
    for (const id of ids) engine.remove(id);
  });

  it("systemPrompt injection via setSystemPrompt", () => {
    // Just verify the setter doesn't throw
    engine.setSystemPrompt("You are a helpful AI.");
    // No getter, so we just verify no error
  });

  it("channelRegistry injection via setChannelRegistry", () => {
    const mockRegistry = {
      send: async () => {},
    } as any;

    engine.setChannelRegistry(mockRegistry, [
      { channel: "telegram", chatId: "123" },
    ]);
    // No error
  });
});
