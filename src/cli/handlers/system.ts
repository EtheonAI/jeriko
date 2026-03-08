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
  formatTriggerList,
  formatNotificationList,
  formatError,
} from "../format.js";
import { t, getActiveTheme } from "../theme.js";
import { getProviderOptions, validateApiKey, MIN_API_KEY_LENGTH } from "../lib/setup.js";
import { verifyApiKey, verifyOllamaRunning, fetchOllamaModelList, verifyLMStudioRunning } from "../wizard/verify.js";
import { persistSetup, type OnboardingResult } from "../wizard/onboarding.js";
import { getProviderAuth, getOAuthConfig } from "../lib/provider-auth.js";
import { runOAuthFlow } from "../lib/oauth-flow.js";
import { openInBrowser } from "../lib/open-browser.js";

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
      // Step 1: Provider selection
      onboardProvider(ctx);
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
              validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? undefined : "Must be a valid email address",
            },
          ],
          onComplete: async ([emailValue]) => {
            dispatch({ type: "SET_PHASE", phase: "idle" });
            try {
              const result = await backend.startUpgrade(emailValue!);
              openInBrowser(result.url);
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
        openInBrowser(result.url);
        addSystemMessage(t.green(`\u2713 Checkout opened: ${result.url}`));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    async billing(): Promise<void> {
      try {
        const result = await backend.openBillingPortal();
        openInBrowser(result.url);
        addSystemMessage(t.green(`\u2713 Billing portal: ${result.url}`));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    async cancel(): Promise<void> {
      // Redirect to the Stripe Customer Portal — handles cancellation,
      // payment method changes, and invoice history in one place.
      try {
        const result = await backend.openBillingPortal();
        openInBrowser(result.url);
        addSystemMessage(t.green(`Manage or cancel your subscription: ${result.url}`));
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

    async triggers(): Promise<void> {
      if (!requireDaemon(ctx, "Triggers")) return;
      try {
        const triggers = await backend.listTriggers();
        addSystemMessage(formatTriggerList(triggers));
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

    async theme(_args: string): Promise<void> {
      addSystemMessage(t.muted(`Active theme: ${getActiveTheme()}`));
    },
  };
}

// ---------------------------------------------------------------------------
// Onboarding wizard chain — composable steps
//
// Flow: Provider → Auth (OAuth or API key) → Finalize
// Channels are added post-setup via /connect.
// ---------------------------------------------------------------------------

import type { ProviderOption } from "../lib/setup.js";

/** Accumulated state passed through the wizard chain. */
interface OnboardState {
  provider?: ProviderOption;
  apiKey?: string;
  /** Specific Ollama model selected (written as LOCAL_MODEL in .env). */
  localModel?: string;
}

/**
 * Step 1: AI provider selection → auth method or finalize.
 */
function onboardProvider(ctx: SystemCommandContext): void {
  const providerOptions = getProviderOptions();
  launchWizard(ctx, {
    title: "Setup Wizard",
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

      const state: OnboardState = { provider };

      if (provider.needsApiKey) {
        onboardAuth(ctx, state);
      } else if (provider.id === "local") {
        await onboardOllama(ctx, state);
      } else if (provider.id === "lmstudio") {
        await onboardLMStudio(ctx, state);
      } else {
        await onboardFinalize(ctx, state);
      }
    },
  });
}

/**
 * Step 2: Auth method — OAuth picker or direct API key.
 * Providers with OAuth support show a choice; others go straight to key input.
 */
function onboardAuth(ctx: SystemCommandContext, state: OnboardState): void {
  if (!state.provider) return;
  const provider = state.provider;
  const authDef = getProviderAuth(provider.id);

  // Provider has OAuth — show auth method picker
  if (authDef && authDef.choices.length > 1) {
    launchWizard(ctx, {
      title: `Connect ${provider.name}`,
      steps: [
        {
          type: "select",
          message: `How would you like to authenticate?`,
          options: authDef.choices.map((c) => ({
            value: c.id,
            label: c.label,
            hint: c.hint,
          })),
        },
      ],
      onComplete: async ([choiceId]) => {
        ctx.dispatch({ type: "SET_PHASE", phase: "idle" });
        const choice = authDef.choices.find((c) => c.id === choiceId);
        if (!choice) return;

        if (choice.method === "oauth-pkce") {
          await onboardOAuth(ctx, state);
        } else {
          onboardApiKey(ctx, state);
        }
      },
    });
    return;
  }

  // No OAuth — straight to API key
  onboardApiKey(ctx, state);
}

/**
 * OAuth flow — opens browser, waits for callback.
 */
async function onboardOAuth(ctx: SystemCommandContext, state: OnboardState): Promise<void> {
  if (!state.provider) return;
  const provider = state.provider;
  const oauthConfig = getOAuthConfig(provider.id);
  if (!oauthConfig) {
    ctx.addSystemMessage(formatError("OAuth not configured for this provider"));
    onboardApiKey(ctx, state);
    return;
  }

  ctx.addSystemMessage(t.muted("Opening browser for authentication..."));

  try {
    const result = await runOAuthFlow({
      authUrl: oauthConfig.authUrl,
      tokenUrl: oauthConfig.tokenUrl,
      clientId: oauthConfig.clientId,
      pkce: oauthConfig.pkce,
      scopes: oauthConfig.scopes,
      extraAuthParams: oauthConfig.extraAuthParams,
      responseKeyField: oauthConfig.responseKeyField,
      callbackPort: oauthConfig.callbackPort,
      useRelay: oauthConfig.useRelay,
      relayProvider: oauthConfig.relayProvider,
    });

    state.apiKey = result.key;
    ctx.addSystemMessage(t.green("\u2713 Authenticated successfully"));
    await onboardFinalize(ctx, state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.addSystemMessage(formatError(`OAuth failed: ${msg}`));
    ctx.addSystemMessage(t.muted("Falling back to API key input..."));
    onboardApiKey(ctx, state);
  }
}

/**
 * API key input → verify → finalize.
 */
function onboardApiKey(ctx: SystemCommandContext, state: OnboardState): void {
  if (!state.provider) return;
  const provider = state.provider;
  launchWizard(ctx, {
    title: `${provider.name} API Key`,
    steps: [
      {
        type: "password",
        message: `Enter your ${provider.name} API key`,
        validate: (value) => {
          if (!validateApiKey(value)) {
            return value.trim().length < MIN_API_KEY_LENGTH
              ? `API key must be at least ${MIN_API_KEY_LENGTH} characters`
              : "API key must not contain whitespace";
          }
        },
      },
    ],
    onComplete: async ([apiKey]) => {
      ctx.dispatch({ type: "SET_PHASE", phase: "idle" });
      const key = (apiKey ?? "").trim();
      state.apiKey = key;

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
 * Ollama detection — check if running, detect models, let user pick.
 */
async function onboardOllama(ctx: SystemCommandContext, state: OnboardState): Promise<void> {
  ctx.addSystemMessage(t.muted("Checking Ollama..."));

  const running = await verifyOllamaRunning();
  if (!running) {
    ctx.addSystemMessage(
      formatError("Ollama not detected") + "\n" +
      t.muted("  Install: https://ollama.com") + "\n" +
      t.muted("  Then run: ollama pull llama3"),
    );
    await onboardFinalize(ctx, state);
    return;
  }

  const models = await fetchOllamaModelList();
  if (models.length === 0) {
    ctx.addSystemMessage(
      t.warning("Ollama is running but no models installed") + "\n" +
      t.muted("  Run: ollama pull <model>") + "\n" +
      t.muted("  Examples: llama3, deepseek-coder, mistral, qwen2"),
    );
    await onboardFinalize(ctx, state);
    return;
  }

  if (models.length === 1) {
    state.localModel = models[0]!;
    ctx.addSystemMessage(t.green(`\u2713 Ollama detected — using ${models[0]!}`));
    await onboardFinalize(ctx, state);
    return;
  }

  // Multiple models — let user pick
  launchWizard(ctx, {
    title: "Ollama Models",
    steps: [
      {
        type: "select",
        message: `${models.length} models found — choose one:`,
        options: models.map((m) => ({ value: m, label: m })),
      },
    ],
    onComplete: async ([selected]) => {
      ctx.dispatch({ type: "SET_PHASE", phase: "idle" });
      if (selected) state.localModel = selected;
      await onboardFinalize(ctx, state);
    },
  });
}

/**
 * LM Studio detection — check if running.
 */
async function onboardLMStudio(ctx: SystemCommandContext, state: OnboardState): Promise<void> {
  ctx.addSystemMessage(t.muted("Checking LM Studio..."));

  const running = await verifyLMStudioRunning();
  if (running) {
    ctx.addSystemMessage(t.green("\u2713 LM Studio detected"));
  } else {
    ctx.addSystemMessage(
      t.warning("LM Studio not detected") + "\n" +
      t.muted("  Download: https://lmstudio.ai") + "\n" +
      t.muted("  Start LM Studio and load a model") + "\n" +
      t.muted("  API server runs on http://127.0.0.1:1234"),
    );
  }

  await onboardFinalize(ctx, state);
}

/**
 * Final step: persist config + env, update backend model, show summary.
 */
async function onboardFinalize(ctx: SystemCommandContext, state: OnboardState): Promise<void> {
  if (!state.provider) return;
  const provider = state.provider;

  const result: OnboardingResult = {
    provider: provider.id,
    model: provider.model,
    apiKey: state.apiKey ?? "",
    envKey: provider.envKey,
    localModel: state.localModel,
  };

  await persistSetup(result);

  const displayModel = state.localModel ?? provider.model;
  ctx.dispatch({ type: "SET_MODEL", model: provider.model });

  const parts = [
    t.green("\u2713 Setup complete!"),
    t.muted(`  Provider: ${provider.name}`),
    t.muted(`  Model:    ${displayModel}`),
    "",
    t.dim("Type a message to start chatting. Use /connect to add channels."),
  ];

  ctx.addSystemMessage(parts.join("\n"));
}
