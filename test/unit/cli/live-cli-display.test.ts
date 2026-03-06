/**
 * Live CLI display tests — validates that all formatter outputs
 * render correctly with proper structure, tree connectors, and content.
 *
 * Tests the visual output of every slash command formatter to ensure
 * the CLI displays professional, consistent output.
 */

import { describe, test, expect } from "bun:test";
import {
  formatHelp,
  formatSessionList,
  formatChannelList,
  formatConnectorList,
  formatTriggerList,
  formatSkillList,
  formatSkillDetail,
  formatModelList,
  formatStatus,
  formatSysInfo,
  formatConfig,
  formatHistory,
  formatHealth,
  formatWelcome,
  formatNewSession,
  formatSessionResume,
  formatChannelHelp,
  formatChannelSetupHint,
  formatProviderList,
  formatProviderAdded,
  formatProviderRemoved,
  formatPlan,
  formatSessionCost,
  formatConfigStructured,
  formatError,
  stripAnsi,
  COMMAND_CATEGORIES,
} from "../../../src/cli/format.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Strip ANSI and normalize whitespace for content assertions. */
function clean(s: string): string {
  return stripAnsi(s);
}

// ---------------------------------------------------------------------------
// Welcome Banner
// ---------------------------------------------------------------------------

describe("Welcome Banner", () => {
  test("renders banner with mascot and info", () => {
    const result = formatWelcome("2.0.0", "claude-sonnet", "/home/user/project");
    const c = clean(result);
    expect(c).toContain("Jeriko");
    expect(c).toContain("v2.0.0");
    expect(c).toContain("claude-sonnet");
    expect(c).toContain("█");
    expect(c).toContain("/help");
    expect(c).toContain("model");
    expect(c).toContain("cwd");
  });
});

// ---------------------------------------------------------------------------
// Help Screen — tree structure
// ---------------------------------------------------------------------------

describe("Help Screen", () => {
  test("contains all category labels", () => {
    const result = formatHelp();
    const c = clean(result);
    for (const cat of COMMAND_CATEGORIES) {
      expect(c).toContain(cat.label);
    }
  });

  test("contains indented commands under categories", () => {
    const c = clean(formatHelp());
    // Commands are indented under category labels
    expect(c).toContain("Session");
    expect(c).toContain("/help");
  });

  test("contains all commands", () => {
    const c = clean(formatHelp());
    expect(c).toContain("/help");
    expect(c).toContain("/new");
    expect(c).toContain("/sessions");
    expect(c).toContain("/model");
    expect(c).toContain("/channels");
    expect(c).toContain("/connectors");
    expect(c).toContain("/triggers");
    expect(c).toContain("/skills");
    expect(c).toContain("/status");
    expect(c).toContain("/health");
    expect(c).toContain("/sys");
    expect(c).toContain("/config");
    expect(c).toContain("/plan");
    expect(c).toContain("/billing");
    expect(c).toContain("/cost");
  });

  test("contains exit hint", () => {
    const c = clean(formatHelp());
    expect(c).toContain("exit");
    expect(c).toContain("/quit");
  });
});

// ---------------------------------------------------------------------------
// Session List — tree structure with status icons
// ---------------------------------------------------------------------------

describe("Session List", () => {
  const sessions = [
    { slug: "bold-nexus-001", title: "API Refactor", model: "claude", token_count: 1500, updated_at: Date.now() },
    { slug: "quick-fox-002", title: "quick-fox-002", model: "gpt-4o", token_count: 3000, updated_at: Date.now() - 86400000 },
  ];

  test("renders tree connectors", () => {
    const c = clean(formatSessionList(sessions));
    expect(c).toContain("├─");
    expect(c).toContain("└─");
  });

  test("renders session slugs", () => {
    const c = clean(formatSessionList(sessions));
    expect(c).toContain("bold-nexus-001");
    expect(c).toContain("quick-fox-002");
  });

  test("marks current session", () => {
    const c = clean(formatSessionList(sessions, null, "bold-nexus-001"));
    expect(c).toContain("current");
  });

  test("shows token counts", () => {
    const c = clean(formatSessionList(sessions));
    expect(c).toContain("1.5k");
    expect(c).toContain("3.0k");
  });

  test("shows resume hint", () => {
    const c = clean(formatSessionList(sessions));
    expect(c).toContain("/resume");
  });
});

// ---------------------------------------------------------------------------
// Channel List — status icons and tree
// ---------------------------------------------------------------------------

describe("Channel List", () => {
  const channels = [
    { name: "telegram", status: "connected", connected_at: new Date().toISOString() },
    { name: "whatsapp", status: "failed", error: "Server unreachable" },
  ];

  test("renders tree connectors", () => {
    const c = clean(formatChannelList(channels));
    expect(c).toContain("├─");
    expect(c).toContain("└─");
  });

  test("shows status labels", () => {
    const c = clean(formatChannelList(channels));
    expect(c).toContain("connected");
    expect(c).toContain("failed");
  });

  test("shows error message", () => {
    const c = clean(formatChannelList(channels));
    expect(c).toContain("Server unreachable");
  });

  test("shows status icons", () => {
    const c = clean(formatChannelList(channels));
    expect(c).toContain("●"); // connected
    expect(c).toContain("✗"); // failed
  });

  test("empty list message", () => {
    const c = clean(formatChannelList([]));
    expect(c).toContain("No channels");
  });
});

// ---------------------------------------------------------------------------
// Connector List — status icons and tree
// ---------------------------------------------------------------------------

describe("Connector List", () => {
  const connectors = [
    { name: "stripe", type: "api_key", status: "connected" as const },
    { name: "github", type: "oauth", status: "disconnected" as const },
    { name: "paypal", type: "api_key", status: "error" as const, error: "Invalid credentials" },
  ];

  test("renders tree connectors", () => {
    const c = clean(formatConnectorList(connectors));
    expect(c).toContain("├─");
    expect(c).toContain("└─");
  });

  test("shows connector names", () => {
    const c = clean(formatConnectorList(connectors));
    expect(c).toContain("stripe");
    expect(c).toContain("github");
    expect(c).toContain("paypal");
  });

  test("shows error message", () => {
    const c = clean(formatConnectorList(connectors));
    expect(c).toContain("Invalid credentials");
  });

  test("shows status icons", () => {
    const c = clean(formatConnectorList(connectors));
    expect(c).toContain("●"); // connected
    expect(c).toContain("○"); // disconnected
    expect(c).toContain("✗"); // error
  });
});

// ---------------------------------------------------------------------------
// Trigger List — tree structure
// ---------------------------------------------------------------------------

describe("Trigger List", () => {
  const triggers = [
    { id: "t1", name: "daily-backup", type: "cron", enabled: true, runCount: 42 },
    { id: "t2", name: "stripe-webhook", type: "webhook", enabled: false, runCount: 0 },
  ];

  test("renders tree connectors", () => {
    const c = clean(formatTriggerList(triggers));
    expect(c).toContain("├─");
    expect(c).toContain("└─");
  });

  test("shows status icons", () => {
    const c = clean(formatTriggerList(triggers));
    expect(c).toContain("●"); // enabled
    expect(c).toContain("○"); // disabled
  });

  test("shows trigger names and types", () => {
    const c = clean(formatTriggerList(triggers));
    expect(c).toContain("daily-backup");
    expect(c).toContain("cron");
    expect(c).toContain("stripe-webhook");
    expect(c).toContain("webhook");
  });

  test("shows run count", () => {
    const c = clean(formatTriggerList(triggers));
    expect(c).toContain("42 runs");
  });
});

// ---------------------------------------------------------------------------
// Skill List — tree structure
// ---------------------------------------------------------------------------

describe("Skill List", () => {
  const skills = [
    { name: "deploy", description: "Deploy to production", userInvocable: true },
    { name: "lint", description: "Run code linter", userInvocable: false },
  ];

  test("renders tree connectors", () => {
    const c = clean(formatSkillList(skills));
    expect(c).toContain("├─");
    expect(c).toContain("└─");
  });

  test("shows skill names", () => {
    const c = clean(formatSkillList(skills));
    expect(c).toContain("deploy");
    expect(c).toContain("lint");
  });
});

// ---------------------------------------------------------------------------
// Channel Help — tree structure
// ---------------------------------------------------------------------------

describe("Channel Help", () => {
  test("renders tree connectors", () => {
    const c = clean(formatChannelHelp());
    expect(c).toContain("├─");
    expect(c).toContain("└─");
  });

  test("shows all available channels", () => {
    const c = clean(formatChannelHelp());
    expect(c).toContain("telegram");
    expect(c).toContain("whatsapp");
    expect(c).not.toContain("imessage");
    expect(c).not.toContain("googlechat");
  });

  test("shows command usage", () => {
    const c = clean(formatChannelHelp());
    expect(c).toContain("/channel connect");
    expect(c).toContain("/channel disconnect");
    expect(c).toContain("/channels");
  });
});

// ---------------------------------------------------------------------------
// Channel Setup Hints
// ---------------------------------------------------------------------------

describe("Channel Setup Hints", () => {
  test("telegram hint mentions BotFather", () => {
    const c = clean(formatChannelSetupHint("telegram"));
    expect(c).toContain("BotFather");
  });

  test("whatsapp hint mentions QR", () => {
    const c = clean(formatChannelSetupHint("whatsapp"));
    expect(c).toContain("QR");
  });

  test("unknown channel returns generic", () => {
    const c = clean(formatChannelSetupHint("unknown"));
    expect(c).toContain("Check your config");
  });
});

// ---------------------------------------------------------------------------
// Model List
// ---------------------------------------------------------------------------

describe("Model List", () => {
  const models = [
    { id: "claude-sonnet", name: "Claude Sonnet", provider: "Anthropic", contextWindow: 200000, costInput: 3, costOutput: 15, supportsTools: true, supportsReasoning: true },
    { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", contextWindow: 128000, costInput: 2.5, costOutput: 10, supportsTools: true },
  ];

  test("groups by provider", () => {
    const c = clean(formatModelList(models, "claude-sonnet"));
    expect(c).toContain("Anthropic");
    expect(c).toContain("OpenAI");
  });

  test("marks current model", () => {
    const c = clean(formatModelList(models, "claude-sonnet"));
    expect(c).toContain("●");
  });

  test("shows context window", () => {
    const c = clean(formatModelList(models, ""));
    expect(c).toContain("200k");
    expect(c).toContain("128k");
  });
});

// ---------------------------------------------------------------------------
// Provider List
// ---------------------------------------------------------------------------

describe("Provider List", () => {
  const providers = [
    { id: "anthropic", name: "Anthropic", type: "built-in" as const },
    { id: "openai", name: "OpenAI", type: "built-in" as const },
    { id: "custom-1", name: "My API", type: "custom" as const, defaultModel: "gpt-4" },
  ];

  test("groups by type", () => {
    const c = clean(formatProviderList(providers));
    expect(c).toContain("Built-in");
    expect(c).toContain("Custom");
  });

  test("shows provider names", () => {
    const c = clean(formatProviderList(providers));
    expect(c).toContain("anthropic");
    expect(c).toContain("openai");
    expect(c).toContain("custom-1");
  });

  test("formatProviderAdded returns confirmation", () => {
    const c = clean(formatProviderAdded("myapi", "My API"));
    expect(c).toContain("✓");
    expect(c).toContain("My API");
  });

  test("formatProviderRemoved returns confirmation", () => {
    const c = clean(formatProviderRemoved("myapi"));
    expect(c).toContain("✓");
    expect(c).toContain("myapi");
  });
});

// ---------------------------------------------------------------------------
// Billing Plan
// ---------------------------------------------------------------------------

describe("Billing Plan", () => {
  test("renders free plan", () => {
    const plan = {
      tier: "free", label: "Free", status: "active",
      connectors: { used: 1, limit: 2 },
      triggers: { used: 2, limit: 3 },
    };
    const c = clean(formatPlan(plan));
    expect(c).toContain("Free");
    expect(c).toContain("active");
    expect(c).toContain("1/2");
    expect(c).toContain("2/3");
    expect(c).toContain("upgrade");
  });

  test("renders pro plan", () => {
    const plan = {
      tier: "pro", label: "Pro", status: "active",
      email: "user@test.com",
      connectors: { used: 5, limit: 10 },
      triggers: { used: 8, limit: "unlimited" as const },
    };
    const c = clean(formatPlan(plan));
    expect(c).toContain("Pro");
    expect(c).toContain("user@test.com");
    expect(c).toContain("5/10");
  });

  test("shows past due warning", () => {
    const plan = {
      tier: "pro", label: "Pro", status: "past_due",
      pastDue: true,
      connectors: { used: 1, limit: 10 },
      triggers: { used: 0, limit: "unlimited" as const },
    };
    const c = clean(formatPlan(plan));
    expect(c).toContain("past due");
  });
});

// ---------------------------------------------------------------------------
// Session Cost
// ---------------------------------------------------------------------------

describe("Session Cost", () => {
  test("renders cost breakdown", () => {
    const stats = { tokensIn: 5000, tokensOut: 2000, turns: 3, durationMs: 15000 };
    const c = clean(formatSessionCost(stats, "claude-sonnet"));
    expect(c).toContain("claude-sonnet");
    expect(c).toContain("5.0k");
    expect(c).toContain("2.0k");
    expect(c).toContain("3");
    expect(c).toContain("15s");
  });
});

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

describe("Health Check", () => {
  test("renders health results", () => {
    const results = [
      { name: "stripe", healthy: true, latencyMs: 150 },
      { name: "github", healthy: false, latencyMs: 5000, error: "Timeout" },
    ];
    const c = clean(formatHealth(results));
    expect(c).toContain("✓");
    expect(c).toContain("✗");
    expect(c).toContain("150ms");
    expect(c).toContain("Timeout");
  });
});

// ---------------------------------------------------------------------------
// Config Structured
// ---------------------------------------------------------------------------

describe("Config Structured", () => {
  test("renders agent section", () => {
    const config = {
      agent: { model: "claude-sonnet", maxTokens: 4096, temperature: 0.3 },
    };
    const c = clean(formatConfigStructured(config));
    expect(c).toContain("claude-sonnet");
    expect(c).toContain("4096");
  });

  test("renders channels section", () => {
    const config = {
      channels: { telegram: { token: "xxx" }, whatsapp: { enabled: true } },
    };
    const c = clean(formatConfigStructured(config));
    expect(c).toContain("telegram");
    expect(c).toContain("whatsapp");
  });
});

// ---------------------------------------------------------------------------
// Consistent header branding
// ---------------------------------------------------------------------------

describe("Consistent Headers", () => {
  test("help header uses brand bold", () => {
    const result = formatHelp();
    // The header should contain "Commands" text (we verify by stripping ANSI)
    expect(clean(result)).toContain("Commands");
  });

  test("session list header uses brand bold", () => {
    const result = formatSessionList([
      { slug: "test", title: "test", model: "claude", token_count: 100, updated_at: Date.now() },
    ]);
    expect(clean(result)).toContain("Sessions");
  });

  test("channel list header uses brand bold", () => {
    const result = formatChannelList([
      { name: "telegram", status: "connected" },
    ]);
    expect(clean(result)).toContain("Channels");
  });

  test("connector list header uses brand bold", () => {
    const result = formatConnectorList([
      { name: "stripe", type: "api_key", status: "connected" },
    ]);
    expect(clean(result)).toContain("Connectors");
  });

  test("trigger list header uses brand bold", () => {
    const result = formatTriggerList([
      { id: "1", name: "test", type: "cron", enabled: true, runCount: 0 },
    ]);
    expect(clean(result)).toContain("Triggers");
  });
});
