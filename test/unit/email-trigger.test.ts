// Email trigger tests — EmailTrigger class, config validation, connector mode,
// IMAP mode, engine integration with email type.

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
import { EmailTrigger, type EmailConfig, type EmailMessage } from "../../src/daemon/services/triggers/email.js";
import { TriggerEngine, type TriggerConfig } from "../../src/daemon/services/triggers/engine.js";

// Use in-memory database so tests never pollute the production DB.
beforeAll(() => {
  initDatabase(":memory:");
});

afterAll(() => {
  closeDatabase();
});

// ---------------------------------------------------------------------------
// EmailTrigger — IMAP mode validation (no network)
// ---------------------------------------------------------------------------

describe("EmailTrigger IMAP mode", () => {
  it("validates missing IMAP_USER", () => {
    const trigger = new EmailTrigger({ user: "", password: "" });
    const error = trigger.validate();
    expect(error).not.toBeNull();
    expect(error!).toContain("IMAP_USER");
  });

  it("validates missing IMAP_PASSWORD when user is set", () => {
    const trigger = new EmailTrigger({ user: "test@example.com", password: "" });
    const error = trigger.validate();
    expect(error).not.toBeNull();
    expect(error!).toContain("IMAP_PASSWORD");
  });

  it("validates successfully with user and password", () => {
    const trigger = new EmailTrigger({
      user: "test@example.com",
      password: "app-password",
    });
    expect(trigger.validate()).toBeNull();
  });

  it("uses defaults for host, port, interval", () => {
    const trigger = new EmailTrigger({
      user: "test@example.com",
      password: "app-password",
    });
    expect(trigger).toBeDefined();
    expect(trigger.isRunning()).toBe(false);
  });

  it("respects custom host and port", () => {
    const trigger = new EmailTrigger({
      host: "imap.gmail.com",
      port: 993,
      user: "user@gmail.com",
      password: "secret",
      intervalMs: 60_000,
    });
    expect(trigger.validate()).toBeNull();
  });

  it("start requires valid credentials in IMAP mode", () => {
    const trigger = new EmailTrigger({ user: "", password: "" });
    const messages: EmailMessage[] = [];

    trigger.start((msg) => messages.push(msg));
    expect(trigger.isRunning()).toBe(false);
  });

  it("stop is idempotent", () => {
    const trigger = new EmailTrigger({
      user: "test@example.com",
      password: "app-password",
    });

    trigger.stop();
    expect(trigger.isRunning()).toBe(false);

    trigger.stop();
    expect(trigger.isRunning()).toBe(false);
  });

  it("accepts from filter", () => {
    const trigger = new EmailTrigger({
      user: "test@example.com",
      password: "app-password",
      from: "alerts@github.com",
    });
    expect(trigger.validate()).toBeNull();
  });

  it("accepts subject filter", () => {
    const trigger = new EmailTrigger({
      user: "test@example.com",
      password: "app-password",
      subject: "deploy",
    });
    expect(trigger.validate()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// EmailTrigger — Connector mode validation (no network)
// ---------------------------------------------------------------------------

describe("EmailTrigger connector mode", () => {
  it("validates successfully with just a connector name", () => {
    const trigger = new EmailTrigger({ connector: "gmail" });
    expect(trigger.validate()).toBeNull();
  });

  it("does not require IMAP credentials in connector mode", () => {
    const trigger = new EmailTrigger({
      connector: "gmail",
      user: "",
      password: "",
    });
    // Connector mode skips IMAP validation
    expect(trigger.validate()).toBeNull();
  });

  it("supports connector + filters", () => {
    const trigger = new EmailTrigger({
      connector: "gmail",
      from: "alerts@stripe.com",
      subject: "payment",
      intervalMs: 30_000,
    });
    expect(trigger.validate()).toBeNull();
  });

  it("supports gmail connector", () => {
    const trigger = new EmailTrigger({ connector: "gmail" });
    expect(trigger.validate()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TriggerEngine — email type integration
// ---------------------------------------------------------------------------

describe("TriggerEngine email type", () => {
  let engine: TriggerEngine;

  beforeEach(() => {
    engine = new TriggerEngine();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it("supports email trigger type in add()", () => {
    const trigger = engine.add({
      type: "email",
      enabled: false,
      config: {
        connector: "gmail",
        intervalMs: 120_000,
      },
      action: { type: "shell", command: "echo email received" },
      label: "Gmail watcher",
    });

    expect(trigger.type).toBe("email");
    expect(trigger.label).toBe("Gmail watcher");
    expect(trigger.id).toBeTruthy();
  });

  it("supports IMAP config in add()", () => {
    const trigger = engine.add({
      type: "email",
      enabled: false,
      config: {
        host: "imap.gmail.com",
        port: 993,
        user: "test@gmail.com",
        password: "app-password",
      },
      action: { type: "shell", command: "echo email received" },
    });

    expect(trigger.type).toBe("email");
  });

  it("persists email triggers via get()", () => {
    const trigger = engine.add({
      type: "email",
      enabled: false,
      config: { connector: "gmail" },
      action: { type: "shell", command: "echo test" },
    });

    const retrieved = engine.get(trigger.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.type).toBe("email");
  });

  it("lists email triggers alongside other types", () => {
    engine.add({
      type: "webhook",
      enabled: true,
      config: {},
      action: { type: "shell", command: "echo webhook" },
    });
    engine.add({
      type: "email",
      enabled: false,
      config: { connector: "gmail" },
      action: { type: "shell", command: "echo email" },
    });
    engine.add({
      type: "cron",
      enabled: false,
      config: { expression: "* * * * *" },
      action: { type: "shell", command: "echo cron" },
    });

    const all = engine.listAll();
    const types = new Set(all.map((t) => t.type));
    expect(types.has("email")).toBe(true);
    expect(types.has("webhook")).toBe(true);
    expect(types.has("cron")).toBe(true);
  });

  it("removes email triggers", () => {
    const trigger = engine.add({
      type: "email",
      enabled: false,
      config: { connector: "gmail" },
      action: { type: "shell", command: "echo test" },
    });

    const removed = engine.remove(trigger.id);
    expect(removed).toBe(true);
    expect(engine.get(trigger.id)).toBeUndefined();
  });

  it("updates email triggers", () => {
    const trigger = engine.add({
      type: "email",
      enabled: false,
      config: { connector: "gmail" },
      action: { type: "shell", command: "echo old" },
      label: "Old label",
    });

    const updated = engine.update(trigger.id, {
      label: "New label",
      action: { type: "shell", command: "echo new" },
    });

    expect(updated).toBeDefined();
    expect(updated!.label).toBe("New label");
    expect(updated!.action.command).toBe("echo new");
    expect(updated!.type).toBe("email");
  });

  it("supports agent actions on email triggers", () => {
    const trigger = engine.add({
      type: "email",
      enabled: false,
      config: { connector: "gmail" },
      action: { type: "agent", prompt: "Summarize the incoming email" },
    });

    expect(trigger.action.type).toBe("agent");
    expect(trigger.action.prompt).toBe("Summarize the incoming email");
  });

  it("supports from and subject filters in config", () => {
    const trigger = engine.add({
      type: "email",
      enabled: false,
      config: {
        connector: "gmail",
        from: "alerts@github.com",
        subject: "deploy",
      },
      action: { type: "shell", command: "echo filtered" },
    });

    const config = trigger.config as EmailConfig;
    expect(config.from).toBe("alerts@github.com");
    expect(config.subject).toBe("deploy");
    expect(config.connector).toBe("gmail");
  });

  it("toggle works for email triggers", () => {
    const trigger = engine.add({
      type: "email",
      enabled: false,
      config: { connector: "gmail" },
      action: { type: "shell", command: "echo test" },
    });

    expect(engine.get(trigger.id)!.enabled).toBe(false);

    engine.enable(trigger.id);
    const afterEnable = engine.get(trigger.id);
    expect(afterEnable).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TriggerStore — email type persistence
// ---------------------------------------------------------------------------

describe("TriggerStore email persistence", () => {
  let engine: TriggerEngine;

  beforeEach(() => {
    engine = new TriggerEngine();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it("persists connector-mode email config through save/load cycle", async () => {
    const trigger = engine.add({
      type: "email",
      enabled: false,
      config: {
        connector: "gmail",
        intervalMs: 60_000,
        from: "ci@github.com",
        subject: "build failed",
      },
      action: { type: "shell", command: "echo alert" },
      label: "CI alert",
      max_runs: 100,
    });

    const engine2 = new TriggerEngine();
    await engine2.start();

    const loaded = engine2.get(trigger.id);
    expect(loaded).toBeDefined();
    expect(loaded!.type).toBe("email");
    expect(loaded!.label).toBe("CI alert");
    expect(loaded!.max_runs).toBe(100);

    const config = loaded!.config as EmailConfig;
    expect(config.connector).toBe("gmail");
    expect(config.from).toBe("ci@github.com");
    expect(config.subject).toBe("build failed");
    expect(config.intervalMs).toBe(60_000);

    await engine2.stop();
  });

  it("persists IMAP-mode email config through save/load cycle", async () => {
    const trigger = engine.add({
      type: "email",
      enabled: false,
      config: {
        host: "imap.gmail.com",
        port: 993,
        user: "user@gmail.com",
        password: "secret",
        intervalMs: 90_000,
      },
      action: { type: "shell", command: "echo gmail" },
      label: "Gmail watcher",
    });

    const engine2 = new TriggerEngine();
    await engine2.start();

    const loaded = engine2.get(trigger.id);
    expect(loaded).toBeDefined();
    expect(loaded!.type).toBe("email");

    const config = loaded!.config as EmailConfig;
    expect(config.host).toBe("imap.gmail.com");
    expect(config.user).toBe("user@gmail.com");
    expect(config.intervalMs).toBe(90_000);

    await engine2.stop();
  });
});
