/**
 * System, Billing, Skill, Task, Notification command handlers.
 *
 * Commands with no args that need input launch interactive wizards:
 *   /theme     → theme picker
 *   /skill     → skill picker
 *   /upgrade   → email input
 *   /task      → category picker (when no sub-command)
 */

import type { Backend } from "../backend.js";
import type { AppAction, WizardConfig } from "../types.js";
import {
  formatHelp,
  formatSkillList,
  formatSkillDetail,
  formatStatus,
  formatSysInfo,
  formatConfigStructured,
  formatHealth,
  formatPlan,
  formatTaskCategory,
  formatTaskHub,
  formatNotificationList,
  formatError,
} from "../format.js";
import { t, setActiveTheme, getActiveTheme } from "../theme.js";
import { listThemes, type ThemePreset } from "../themes.js";
import { getProviderOptions, CHANNEL_OPTIONS, validateApiKey } from "../lib/setup.js";
import { verifyApiKey } from "../wizard/verify.js";
import { persistSetup, type OnboardingResult } from "../wizard/onboarding.js";
import type { ChannelChoice } from "../lib/setup.js";

export interface SystemCommandContext {
  backend: Backend;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
  wizardConfigRef: React.MutableRefObject<WizardConfig | null>;
}

function requireDaemon(ctx: SystemCommandContext, label: string): boolean {
  if (ctx.backend.mode !== "daemon") {
    ctx.addSystemMessage(t.muted(`${label} requires the daemon. Start with: jeriko server start`));
    return false;
  }
  return true;
}

/** Launch a wizard. Wraps onComplete with error handling so async failures show a message. */
function launchWizard(ctx: SystemCommandContext, config: WizardConfig): void {
  const originalOnComplete = config.onComplete;
  ctx.wizardConfigRef.current = {
    ...config,
    onComplete: async (results: string[]) => {
      try {
        await originalOnComplete(results);
      } catch (err: unknown) {
        ctx.dispatch({ type: "SET_PHASE", phase: "idle" });
        ctx.addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },
  };
  ctx.dispatch({ type: "SET_PHASE", phase: "wizard" });
}

export function createSystemHandlers(ctx: SystemCommandContext) {
  const { backend, dispatch, addSystemMessage } = ctx;

  return {
    async help(): Promise<void> {
      addSystemMessage(formatHelp());
    },

    // ── Onboarding wizard ──

    async onboard(): Promise<void> {
      // Step 1: Channel selection (Telegram, WhatsApp, or skip)
      launchWizard(ctx, {
        title: "Setup Wizard",
        steps: [
          {
            type: "select",
            message: "Set up a messaging channel",
            options: CHANNEL_OPTIONS.map((ch) => ({
              value: ch.id,
              label: ch.name,
              hint: ch.hint,
            })),
          },
        ],
        onComplete: async ([channelId]) => {
          dispatch({ type: "SET_PHASE", phase: "idle" });
          const channel = (channelId ?? "skip") as ChannelChoice;
          onboardChannel(ctx, channel);
        },
      });
    },

    async skills(): Promise<void> {
      const skills = await backend.listSkills();
      addSystemMessage(formatSkillList(skills));
    },

    async skill(args: string): Promise<void> {
      const skillName = args.trim();
      if (!skillName) {
        // Interactive skill picker
        try {
          const skills = await backend.listSkills();
          if (skills.length === 0) {
            addSystemMessage(t.muted("No skills installed."));
            return;
          }
          launchWizard(ctx, {
            title: "View Skill",
            steps: [
              {
                type: "select",
                message: "Choose a skill to view:",
                options: skills.map((s) => ({
                  value: s.name,
                  label: s.name,
                  hint: s.description,
                })),
              },
            ],
            onComplete: async ([selected]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              const skill = await backend.getSkill(selected!);
              if (!skill) {
                addSystemMessage(formatError(`Skill "${selected}" not found.`));
              } else {
                addSystemMessage(formatSkillDetail(skill.name, skill.description, skill.body));
              }
            },
          });
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }
      const skill = await backend.getSkill(skillName);
      if (!skill) {
        addSystemMessage(formatError(`Skill "${skillName}" not found.`));
      } else {
        addSystemMessage(formatSkillDetail(skill.name, skill.description, skill.body));
      }
    },

    async status(): Promise<void> {
      if (!requireDaemon(ctx, "Status")) return;
      const statusData = await backend.getStatus();
      addSystemMessage(formatStatus(statusData));
    },

    async health(): Promise<void> {
      if (!requireDaemon(ctx, "Health checks")) return;
      const results = await backend.checkHealth();
      addSystemMessage(formatHealth(results));
    },

    async sys(): Promise<void> {
      addSystemMessage(formatSysInfo());
    },

    async config(): Promise<void> {
      const cfg = await backend.getConfig();
      addSystemMessage(formatConfigStructured(cfg));
    },

    // ── Billing ──

    async plan(): Promise<void> {
      try {
        const planInfo = await backend.getPlan();
        addSystemMessage(formatPlan(planInfo));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    async upgrade(args: string): Promise<void> {
      const email = args.trim();
      if (!email) {
        // Interactive email input
        launchWizard(ctx, {
          title: "Upgrade to Pro",
          steps: [
            {
              type: "text",
              message: "Enter your email address:",
              placeholder: "you@example.com",
              validate: (v) => !v.includes("@") ? "Must be a valid email" : undefined,
            },
          ],
          onComplete: async ([emailValue]) => {
            dispatch({ type: "SET_PHASE", phase: "idle" });
            try {
              const result = await backend.startUpgrade(emailValue!);
              addSystemMessage(t.green(`\u2713 Checkout opened: ${result.url}`));
            } catch (err) {
              addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
            }
          },
        });
        return;
      }
      try {
        const result = await backend.startUpgrade(email);
        addSystemMessage(t.green(`\u2713 Checkout opened: ${result.url}`));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    async billing(): Promise<void> {
      try {
        const result = await backend.openBillingPortal();
        addSystemMessage(t.green(`\u2713 Billing portal: ${result.url}`));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    async cancel(): Promise<void> {
      if (!requireDaemon(ctx, "Cancellation")) return;
      try {
        const result = await backend.cancelSubscription();
        if (result.already_cancelling) {
          addSystemMessage(t.muted(`Subscription is already set to cancel on ${result.cancel_at}.`));
        } else {
          addSystemMessage(t.green(`Subscription cancelled. Access until ${result.cancel_at}.`));
        }
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    // ── Tasks (unified: trigger, schedule, cron) ──

    async task(args: string): Promise<void> {
      if (!requireDaemon(ctx, "Tasks")) return;
      try {
        const allTasks = await backend.listTasks();
        const category = args.trim().split(/\s+/)[0]?.toLowerCase();

        // No arg → interactive category picker if tasks exist
        if (!category && allTasks.length > 0) {
          const triggerCount = allTasks.filter((t) => ["webhook", "file", "http", "email"].includes(t.type)).length;
          const scheduleCount = allTasks.filter((t) => t.type === "schedule" || t.type === "cron").length;
          const onceCount = allTasks.filter((t) => t.type === "once").length;

          launchWizard(ctx, {
            title: "Tasks",
            steps: [
              {
                type: "select",
                message: `${allTasks.length} tasks total`,
                options: [
                  { value: "all", label: "View all tasks", hint: `${allTasks.length} total` },
                  ...(triggerCount > 0 ? [{ value: "triggers", label: "Triggers", hint: `${triggerCount} event-driven` }] : []),
                  ...(scheduleCount > 0 ? [{ value: "schedules", label: "Schedules", hint: `${scheduleCount} recurring` }] : []),
                  ...(onceCount > 0 ? [{ value: "once", label: "One-time", hint: `${onceCount} tasks` }] : []),
                ],
              },
            ],
            onComplete: async ([selected]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              if (selected === "triggers") {
                const triggers = allTasks.filter((t) => ["webhook", "file", "http", "email"].includes(t.type));
                addSystemMessage(formatTaskCategory("Triggers", triggers, "Event-driven tasks (webhook, file, http, email)"));
              } else if (selected === "schedules") {
                const schedules = allTasks.filter((t) => t.type === "schedule" || t.type === "cron");
                addSystemMessage(formatTaskCategory("Schedules", schedules, "Recurring tasks (daily, weekly, monthly, custom)"));
              } else if (selected === "once") {
                const once = allTasks.filter((t) => t.type === "once");
                addSystemMessage(formatTaskCategory("One-time Tasks", once, "One-time scheduled tasks"));
              } else {
                const tc = allTasks.filter((t) => ["webhook", "file", "http", "email"].includes(t.type)).length;
                const sc = allTasks.filter((t) => t.type === "schedule" || t.type === "cron").length;
                const cc = allTasks.filter((t) => t.type === "schedule" || t.type === "cron" || t.type === "once").length;
                addSystemMessage(formatTaskHub(allTasks.length, tc, sc, cc, allTasks));
              }
            },
          });
          return;
        }

        if (category === "trigger" || category === "triggers") {
          const triggers = allTasks.filter((t) => ["webhook", "file", "http", "email"].includes(t.type));
          addSystemMessage(formatTaskCategory("Triggers", triggers, "Event-driven tasks (webhook, file, http, email)"));
          return;
        }
        if (category === "schedule" || category === "schedules") {
          const schedules = allTasks.filter((t) => t.type === "schedule" || t.type === "cron");
          addSystemMessage(formatTaskCategory("Schedules", schedules, "Recurring tasks (daily, weekly, monthly, custom)"));
          return;
        }
        if (category === "cron" || category === "crons") {
          const crons = allTasks.filter((t) => t.type === "schedule" || t.type === "cron" || t.type === "once");
          addSystemMessage(formatTaskCategory("Cron Jobs", crons, "Cron expressions and one-time tasks"));
          return;
        }

        // /task — show hub
        const triggerCount = allTasks.filter((t) => ["webhook", "file", "http", "email"].includes(t.type)).length;
        const scheduleCount = allTasks.filter((t) => t.type === "schedule" || t.type === "cron").length;
        const cronCount = allTasks.filter((t) => t.type === "schedule" || t.type === "cron" || t.type === "once").length;

        addSystemMessage(formatTaskHub(allTasks.length, triggerCount, scheduleCount, cronCount, allTasks));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    async notifications(): Promise<void> {
      try {
        const prefs = await backend.listNotifications();
        addSystemMessage(formatNotificationList(prefs));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    // ── Theme ──

    async theme(args: string): Promise<void> {
      const themeName = args.trim();
      if (!themeName) {
        // Interactive theme picker
        const current = getActiveTheme();
        const themes = listThemes();
        launchWizard(ctx, {
          title: "Switch Theme",
          steps: [
            {
              type: "select",
              message: `Current: ${current}`,
              options: themes.map((th) => ({
                value: th.name,
                label: th.displayName,
                hint: th.name === current ? "current" : th.type,
              })),
            },
          ],
          onComplete: async ([selected]) => {
            dispatch({ type: "SET_PHASE", phase: "idle" });
            const match = themes.find((th) => th.name === selected);
            if (match) {
              setActiveTheme(selected as ThemePreset);
              addSystemMessage(t.green(`\u2713 Theme switched to ${match.displayName}`));
            }
          },
        });
        return;
      }

      // Direct switch
      const themes = listThemes();
      const match = themes.find((th) => th.name === themeName);
      if (!match) {
        const available = themes.map((th) => th.name).join(", ");
        addSystemMessage(formatError(`Unknown theme "${themeName}". Available: ${available}`));
        return;
      }

      setActiveTheme(themeName as ThemePreset);
      addSystemMessage(t.green(`\u2713 Theme switched to ${match.displayName}`));
    },
  };
}

// ---------------------------------------------------------------------------
// Onboarding wizard chain — composable steps
//
// Flow: Channel → (Telegram token) → Provider → (API key + verify) → Finalize
// ---------------------------------------------------------------------------

import type { ProviderOption } from "../lib/setup.js";

/** Accumulated state passed through the wizard chain. */
interface OnboardState {
  channel: ChannelChoice;
  telegramToken?: string;
  whatsappEnabled?: boolean;
  provider?: ProviderOption;
  apiKey?: string;
}

/**
 * Step 1b: Route based on channel selection.
 * Telegram → token input, WhatsApp → note + continue, Skip → continue.
 */
function onboardChannel(ctx: SystemCommandContext, channel: ChannelChoice): void {
  const state: OnboardState = { channel };

  if (channel === "telegram") {
    onboardTelegramToken(ctx, state);
  } else if (channel === "whatsapp") {
    state.whatsappEnabled = true;
    ctx.addSystemMessage(t.muted("WhatsApp will pair via QR code when the daemon starts."));
    onboardProvider(ctx, state);
  } else {
    onboardProvider(ctx, state);
  }
}

/**
 * Step 1c: Telegram bot token input → provider selection.
 */
function onboardTelegramToken(ctx: SystemCommandContext, state: OnboardState): void {
  launchWizard(ctx, {
    title: "Telegram Bot Token",
    steps: [
      {
        type: "text",
        message: "Telegram bot token (from @BotFather)",
        placeholder: "123456:ABC-DEF...",
        validate: (value) => {
          if (value.trim().length < 10) return "Token too short";
        },
      },
    ],
    onComplete: async ([token]) => {
      ctx.dispatch({ type: "SET_PHASE", phase: "idle" });
      state.telegramToken = (token ?? "").trim();
      onboardProvider(ctx, state);
    },
  });
}

/**
 * Step 2: AI provider selection → API key or finalize.
 */
function onboardProvider(ctx: SystemCommandContext, state: OnboardState): void {
  const providerOptions = getProviderOptions();
  launchWizard(ctx, {
    title: "AI Provider",
    steps: [
      {
        type: "select",
        message: "Choose your AI provider",
        options: providerOptions.map((p, i) => ({
          value: p.id,
          label: p.name,
          hint: i === 0 ? "recommended" : !p.needsApiKey ? "no API key needed" : undefined,
        })),
      },
    ],
    onComplete: async ([providerId]) => {
      ctx.dispatch({ type: "SET_PHASE", phase: "idle" });
      const provider = providerOptions.find((p) => p.id === providerId);
      if (!provider) return;

      state.provider = provider;
      if (provider.needsApiKey) {
        onboardApiKey(ctx, state);
      } else {
        await onboardFinalize(ctx, state);
      }
    },
  });
}

/**
 * Step 3: API key input → verify → finalize.
 */
function onboardApiKey(ctx: SystemCommandContext, state: OnboardState): void {
  const provider = state.provider!;
  launchWizard(ctx, {
    title: `${provider.name} API Key`,
    steps: [
      {
        type: "password",
        message: `Enter your ${provider.name} API key`,
        validate: (value) => {
          if (!validateApiKey(value)) {
            return value.trim().length < 10
              ? "API key must be at least 10 characters"
              : "API key must not contain whitespace";
          }
        },
      },
    ],
    onComplete: async ([apiKey]) => {
      ctx.dispatch({ type: "SET_PHASE", phase: "idle" });
      const key = (apiKey ?? "").trim();
      state.apiKey = key;

      // Verify the key
      ctx.addSystemMessage(t.muted("Verifying API key..."));
      const valid = await verifyApiKey(provider.id, key);
      if (valid) {
        ctx.addSystemMessage(t.green("\u2713 API key verified"));
      } else {
        ctx.addSystemMessage(t.warning("API key could not be verified (will try anyway)"));
      }

      await onboardFinalize(ctx, state);
    },
  });
}

/**
 * Final step: persist config + env, update backend model, show summary.
 */
async function onboardFinalize(ctx: SystemCommandContext, state: OnboardState): Promise<void> {
  const provider = state.provider!;

  const result: OnboardingResult = {
    provider: provider.id,
    model: provider.model,
    apiKey: state.apiKey ?? "",
    envKey: provider.envKey,
    channel: state.channel,
    telegramToken: state.telegramToken,
    whatsappEnabled: state.whatsappEnabled,
  };

  await persistSetup(result);

  // Update the active model in the running session
  ctx.dispatch({ type: "SET_MODEL", model: provider.model });

  const parts = [t.green("\u2713 Setup complete!")];
  if (state.telegramToken) {
    parts.push(t.muted("  Telegram: configured"));
  }
  if (state.whatsappEnabled) {
    parts.push(t.muted("  WhatsApp: enabled (QR pairing on daemon start)"));
  }
  parts.push(t.muted(`  Provider: ${provider.name}`));
  parts.push(t.muted(`  Model:    ${provider.model}`));
  parts.push("");
  parts.push(t.dim("Type a message to start chatting."));

  ctx.addSystemMessage(parts.join("\n"));
}
