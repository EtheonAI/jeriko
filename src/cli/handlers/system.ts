/**
 * System, Billing, Skill, Task, Notification command handlers.
 *
 * Commands with no args that need input launch interactive wizards:
 *   /theme     → theme picker
 *   /skills    → action picker (view, create, remove)
 *   /upgrade   → email input
 *   /tasks     → action picker (create, manage, view)
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
  formatPlan,
  formatTaskCategory,
  formatTaskHub,
  formatNotificationList,
  formatError,
  capitalize,
} from "../format.js";
import { t, getActiveTheme } from "../theme.js";
import { getProviderOptions, validateApiKey, MIN_API_KEY_LENGTH } from "../lib/setup.js";
import { verifyApiKey, verifyOllamaRunning, fetchOllamaModelList, verifyLMStudioRunning } from "../wizard/verify.js";
import { persistSetup, type OnboardingResult } from "../wizard/onboarding.js";
import { getProviderAuth, getOAuthConfig, getAvailableAuthChoices } from "../lib/provider-auth.js";
import { runOAuthFlow } from "../lib/oauth-flow.js";
import { openInBrowser } from "../lib/open-browser.js";
import {
  validateEmail,
  validateUrl,
  validateRequired,
  validateMinLength,
  validateDatetime,
  validateSkillName,
  getErrorMessage,
} from "../lib/validate.js";
import {
  isEventTrigger,
  isScheduleTrigger,
  isTimeTrigger,
  WEBHOOK_SERVICES,
  EMAIL_SERVICES,
  FILE_EVENTS,
  TRIGGER_EVENT_TYPES,
} from "../../daemon/services/triggers/task-adapter.js";

export interface SystemCommandContext {
  backend: Backend;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
  wizardConfigRef: React.MutableRefObject<WizardConfig | null>;
}

function requireDaemon(ctx: SystemCommandContext, label: string): boolean {
  if (ctx.backend.mode !== "daemon") {
    ctx.addSystemMessage(
      t.muted(`${label} requires the daemon.\n`) +
      t.muted(`  Start it:    jeriko server start\n`) +
      t.muted(`  Then re-run: jeriko`),
    );
    return false;
  }
  return true;
}

/** Launch a wizard. Wraps onComplete with error handling so async failures show a message. */
function launchWizard(ctx: SystemCommandContext, config: WizardConfig): void {
  const originalOnComplete = config.onComplete;
  ctx.wizardConfigRef.current = {
    ...config,
    onComplete: async (results: readonly string[]) => {
      try {
        await originalOnComplete(results);
      } catch (err: unknown) {
        ctx.dispatch({ type: "SET_PHASE", phase: "idle" });
        ctx.addSystemMessage(formatError(getErrorMessage(err)));
      }
    },
  };
  ctx.dispatch({ type: "SET_PHASE", phase: "wizard" });
}

export function createSystemHandlers(ctx: SystemCommandContext) {
  const { backend, dispatch, addSystemMessage } = ctx;

  // ── Skill sub-wizards ──────────────────────────────────────────────
  // Defined before the return so closures can reference them.

  async function skillViewWizard(skills: Awaited<ReturnType<typeof backend.listSkills>>): Promise<void> {
    if (skills.length === 0) {
      addSystemMessage(t.muted("No skills installed."));
      return;
    }
    launchWizard(ctx, {
      title: "View Skill",
      steps: [
        {
          type: "select",
          message: `${skills.length} skill(s) — choose to view:`,
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
  }

  async function skillCreateWizard(name: string): Promise<void> {
    const { scaffoldSkill } = await import("../../shared/skill-loader.js");

    if (name) {
      // Name provided — just ask for description
      launchWizard(ctx, {
        title: "Create Skill",
        steps: [
          {
            type: "text",
            message: "Describe what this skill does:",
            placeholder: "e.g. Summarize YouTube videos",
            validate: validateMinLength(3, "Description"),
          },
        ],
        onComplete: async ([description]) => {
          dispatch({ type: "SET_PHASE", phase: "idle" });
          const path = await scaffoldSkill(name, description!.trim());
          addSystemMessage(
            t.green(`✓ Skill "${name}" created`) + "\n" +
            t.muted(`  Path: ${path}`) + "\n" +
            t.dim("  Edit SKILL.md to customize the skill body."),
          );
        },
      });
      return;
    }

    // No name — full wizard: name → description
    launchWizard(ctx, {
      title: "Create Skill",
      steps: [
        {
          type: "text",
          message: "Skill name (lowercase, no spaces):",
          placeholder: "e.g. summarize-video",
          validate: validateSkillName,
        },
        {
          type: "text",
          message: "Describe what this skill does:",
          placeholder: "e.g. Summarize YouTube videos",
          validate: validateMinLength(3, "Description"),
        },
      ],
      onComplete: async ([skillName, description]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const path = await scaffoldSkill(skillName!.trim(), description!.trim());
        addSystemMessage(
          t.green(`✓ Skill "${skillName!.trim()}" created`) + "\n" +
          t.muted(`  Path: ${path}`) + "\n" +
          t.dim("  Edit SKILL.md to customize the skill body."),
        );
      },
    });
  }

  async function skillRemoveWizard(name: string): Promise<void> {
    const { removeSkill, listSkills } = await import("../../shared/skill-loader.js");

    if (name) {
      await removeSkill(name);
      addSystemMessage(t.green(`✓ Skill "${name}" removed`));
      return;
    }

    const skills = await listSkills();
    if (skills.length === 0) {
      addSystemMessage(t.muted("No skills installed."));
      return;
    }

    launchWizard(ctx, {
      title: "Remove Skill",
      steps: [
        {
          type: "select",
          message: "Choose a skill to remove:",
          options: skills.map((s) => ({
            value: s.name,
            label: s.name,
            hint: s.description,
          })),
        },
      ],
      onComplete: async ([selected]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        await removeSkill(selected!);
        addSystemMessage(t.green(`✓ Skill "${selected}" removed`));
      },
    });
  }

  // ── Task constants & sub-wizards ───────────────────────────────────

  /**
   * User-facing task types (matches AGENT.md taxonomy):
   *   Trigger  — event-driven (webhook, file, http, email)
   *   Schedule — recurring (cron expression or shorthand)
   *   Once     — one-time at a specific datetime
   */
  const TASK_TYPE_OPTIONS = [
    { value: "trigger", label: "Trigger", hint: "event-driven (webhook, file, HTTP, email)" },
    { value: "schedule", label: "Schedule", hint: "recurring on a cron schedule" },
    { value: "once", label: "One-time", hint: "run once at a specific time" },
  ];

  /** Trigger source hints — keyed by event trigger type. */
  const TRIGGER_SOURCE_HINTS: Record<string, { label: string; hint: string }> = {
    webhook: { label: "Webhook", hint: WEBHOOK_SERVICES.map(capitalize).join(", ") },
    file:    { label: "File watcher", hint: "react to file changes on disk" },
    http:    { label: "HTTP monitor", hint: "watch a URL for downtime" },
    email:   { label: "Email", hint: "react to incoming emails" },
  };

  /** Trigger source options — derived from EVENT_TRIGGER_TYPES constant. */
  const TRIGGER_SOURCE_OPTIONS = (["webhook", "file", "http", "email"] as const).map((type) => ({
    value: type,
    label: TRIGGER_SOURCE_HINTS[type]?.label ?? type,
    hint: TRIGGER_SOURCE_HINTS[type]?.hint ?? "",
  }));

  /** Webhook service hints — derived from WEBHOOK_SERVICES + TRIGGER_EVENT_TYPES. */
  const WEBHOOK_HINT: Record<string, string> = {
    stripe: "payment events",
    github: "repo events (push, PR, issues)",
    paypal: "payment events",
    twilio: "call/SMS events",
  };

  /** Webhook service picker options — derived from shared WEBHOOK_SERVICES constant. */
  const WEBHOOK_SERVICE_OPTIONS = WEBHOOK_SERVICES.map((svc) => ({
    value: svc,
    label: capitalize(svc),
    hint: WEBHOOK_HINT[svc] ?? TRIGGER_EVENT_TYPES[svc]?.slice(0, 2).join(", ") ?? "",
  }));

  /** Email service picker options — derived from shared EMAIL_SERVICES constant. */
  const EMAIL_SERVICE_OPTIONS = EMAIL_SERVICES.map((svc) => ({
    value: svc,
    label: capitalize(svc),
    hint: `requires ${capitalize(svc)} connector`,
  }));

  /** File event picker options — derived from shared FILE_EVENTS constant. */
  const FILE_EVENT_OPTIONS = [
    { value: "any", label: "Any change", hint: FILE_EVENTS.join(", ") },
    ...FILE_EVENTS.map((e) => ({ value: e, label: `File ${e}d` })),
  ];

  async function taskCreateWizard(): Promise<void> {
    // Step 1: Choose the 3 user-facing task types
    launchWizard(ctx, {
      title: "Create Task",
      steps: [
        {
          type: "select",
          message: "What type of task?",
          options: TASK_TYPE_OPTIONS,
        },
      ],
      onComplete: async ([taskType]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        switch (taskType) {
          case "trigger": await taskCreateTrigger(); break;
          case "schedule": await taskCreateSchedule(); break;
          case "once": await taskCreateOnce(); break;
        }
      },
    });
  }

  // ── Trigger flow: pick source → source-specific config ──

  async function taskCreateTrigger(): Promise<void> {
    launchWizard(ctx, {
      title: "Create Trigger",
      steps: [
        {
          type: "select",
          message: "What event source?",
          options: TRIGGER_SOURCE_OPTIONS,
        },
      ],
      onComplete: async ([source]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        switch (source) {
          case "webhook": await triggerWebhookWizard(); break;
          case "file": await triggerFileWizard(); break;
          case "http": await triggerHttpWizard(); break;
          case "email": await triggerEmailWizard(); break;
        }
      },
    });
  }

  async function triggerWebhookWizard(): Promise<void> {
    launchWizard(ctx, {
      title: "Webhook Trigger",
      steps: [
        {
          type: "select",
          message: "Which service?",
          options: WEBHOOK_SERVICE_OPTIONS,
        },
        {
          type: "text",
          message: "What should the agent do when this fires? (prompt):",
          placeholder: "e.g. Log the payment and notify me",
          validate: validateMinLength(3, "Prompt"),
        },
        {
          type: "text",
          message: "Task name (optional):",
          placeholder: "e.g. stripe-handler",
        },
      ],
      onComplete: async ([service, action, name]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const params: Record<string, unknown> = {
          trigger: `${service}:*`,
          action: action!.trim(),
        };
        if (name?.trim()) params.name = name.trim();
        const task = await backend.createTask(params);
        addSystemMessage(t.green(`✓ Trigger "${task.name}" created (${service} webhook)`));
      },
    });
  }

  async function triggerFileWizard(): Promise<void> {
    launchWizard(ctx, {
      title: "File Trigger",
      steps: [
        {
          type: "text",
          message: "Directory or file path to watch:",
          placeholder: "e.g. ~/Documents/reports",
          validate: validateRequired,
        },
        {
          type: "select",
          message: "Which file events?",
          options: FILE_EVENT_OPTIONS,
        },
        {
          type: "text",
          message: "What should the agent do? (prompt):",
          placeholder: "e.g. Process the new file and update the database",
          validate: validateMinLength(3, "Prompt"),
        },
        {
          type: "text",
          message: "Task name (optional):",
          placeholder: "e.g. report-watcher",
        },
      ],
      onComplete: async ([path, event, action, name]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const triggerSpec = event === "any" ? "file:change" : `file:${event}`;
        const params: Record<string, unknown> = {
          trigger: triggerSpec,
          path: path!.trim(),
          action: action!.trim(),
        };
        if (name?.trim()) params.name = name.trim();
        const task = await backend.createTask(params);
        addSystemMessage(t.green(`✓ Trigger "${task.name}" created (file watcher)`));
      },
    });
  }

  async function triggerHttpWizard(): Promise<void> {
    launchWizard(ctx, {
      title: "HTTP Monitor",
      steps: [
        {
          type: "text",
          message: "URL to monitor:",
          placeholder: "e.g. https://myapp.com/health",
          validate: validateUrl,
        },
        {
          type: "text",
          message: "Check interval in seconds (default: 60):",
          placeholder: "60",
        },
        {
          type: "text",
          message: "What should the agent do when it detects an issue? (prompt):",
          placeholder: "e.g. Alert me if the site goes down",
          validate: validateMinLength(3, "Prompt"),
        },
        {
          type: "text",
          message: "Task name (optional):",
          placeholder: "e.g. uptime-monitor",
        },
      ],
      onComplete: async ([url, interval, action, name]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const params: Record<string, unknown> = {
          trigger: "http:down",
          url: url!.trim(),
          action: action!.trim(),
        };
        const sec = parseInt(interval?.trim() ?? "", 10);
        if (!isNaN(sec) && sec > 0) params.interval = sec;
        if (name?.trim()) params.name = name.trim();
        const task = await backend.createTask(params);
        addSystemMessage(t.green(`✓ Trigger "${task.name}" created (HTTP monitor)`));
      },
    });
  }

  async function triggerEmailWizard(): Promise<void> {
    launchWizard(ctx, {
      title: "Email Trigger",
      steps: [
        {
          type: "select",
          message: "Email service:",
          options: EMAIL_SERVICE_OPTIONS,
        },
        {
          type: "text",
          message: "Filter by sender (optional):",
          placeholder: "e.g. boss@company.com",
        },
        {
          type: "text",
          message: "Filter by subject (optional):",
          placeholder: "e.g. Invoice",
        },
        {
          type: "text",
          message: "What should the agent do? (prompt):",
          placeholder: "e.g. Summarize the email and create a task",
          validate: validateMinLength(3, "Prompt"),
        },
        {
          type: "text",
          message: "Task name (optional):",
          placeholder: "e.g. email-processor",
        },
      ],
      onComplete: async ([service, from, subject, action, name]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const params: Record<string, unknown> = {
          trigger: `${service}:new_email`,
          action: action!.trim(),
        };
        if (from?.trim()) params.from = from.trim();
        if (subject?.trim()) params.subject = subject.trim();
        if (name?.trim()) params.name = name.trim();
        const task = await backend.createTask(params);
        addSystemMessage(t.green(`✓ Trigger "${task.name}" created (${service} email)`));
      },
    });
  }

  // ── Schedule flow ──

  async function taskCreateSchedule(): Promise<void> {
    launchWizard(ctx, {
      title: "Schedule Task",
      steps: [
        {
          type: "text",
          message: "Cron expression or shorthand (daily, weekly, 5m, 1h):",
          placeholder: "e.g. 0 9 * * * or daily or 30m",
          validate: validateRequired,
        },
        {
          type: "text",
          message: "What should the agent do? (prompt):",
          placeholder: "e.g. Check server health and send summary",
          validate: validateMinLength(3, "Prompt"),
        },
        {
          type: "text",
          message: "Task name (optional):",
          placeholder: "e.g. daily-health-check",
        },
      ],
      onComplete: async ([schedule, action, name]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const params: Record<string, unknown> = {
          schedule: schedule!.trim(),
          action: action!.trim(),
        };
        if (name?.trim()) params.name = name.trim();
        const task = await backend.createTask(params);
        addSystemMessage(t.green(`✓ Schedule "${task.name}" created (${task.type})`));
      },
    });
  }

  // ── Once flow ──

  async function taskCreateOnce(): Promise<void> {
    launchWizard(ctx, {
      title: "One-time Task",
      steps: [
        {
          type: "text",
          message: "When? (ISO datetime, e.g. 2026-06-01T09:00):",
          placeholder: "e.g. 2026-06-01T09:00",
          validate: validateDatetime,
        },
        {
          type: "text",
          message: "What should the agent do? (prompt):",
          placeholder: "e.g. Send the weekly report",
          validate: validateMinLength(3, "Prompt"),
        },
        {
          type: "text",
          message: "Task name (optional):",
          placeholder: "e.g. send-weekly-report",
        },
      ],
      onComplete: async ([datetime, action, name]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const params: Record<string, unknown> = {
          once: datetime!.trim(),
          action: action!.trim(),
        };
        if (name?.trim()) params.name = name.trim();
        const task = await backend.createTask(params);
        addSystemMessage(t.green(`✓ One-time task "${task.name}" created`));
      },
    });
  }

  /** Manage an existing task — pause, resume, delete, test. */
  async function taskManageWizard(allTasks: Awaited<ReturnType<typeof backend.listTasks>>): Promise<void> {
    if (allTasks.length === 0) {
      addSystemMessage(t.muted("No tasks to manage."));
      return;
    }

    // Step 1: pick a task
    launchWizard(ctx, {
      title: "Manage Task",
      steps: [
        {
          type: "select",
          message: "Choose a task:",
          options: allTasks.map((tk) => ({
            value: tk.id,
            label: tk.name || tk.id,
            hint: `${tk.type} — ${tk.enabled ? "active" : "paused"}`,
          })),
        },
      ],
      onComplete: async ([taskId]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const selected = allTasks.find((tk) => tk.id === taskId);
        if (!selected) return;

        // Step 2: choose action
        launchWizard(ctx, {
          title: `Task: ${selected.name || selected.id}`,
          steps: [
            {
              type: "select",
              message: `${selected.name || selected.id} (${selected.type}, ${selected.enabled ? "active" : "paused"})`,
              options: [
                ...(selected.enabled
                  ? [{ value: "pause", label: "Pause", hint: "stop running" }]
                  : [{ value: "resume", label: "Resume", hint: "start running again" }]),
                { value: "test", label: "Test fire", hint: "trigger once now" },
                { value: "delete", label: "Delete", hint: "remove permanently" },
              ],
            },
          ],
          onComplete: async ([action]) => {
            dispatch({ type: "SET_PHASE", phase: "idle" });
            switch (action) {
              case "pause": {
                const task = await backend.pauseTask(selected.id);
                addSystemMessage(t.green(`✓ Task "${task.name}" paused`));
                break;
              }
              case "resume": {
                const task = await backend.resumeTask(selected.id);
                addSystemMessage(t.green(`✓ Task "${task.name}" resumed`));
                break;
              }
              case "test": {
                const result = await backend.testTask(selected.id);
                addSystemMessage(result.fired
                  ? t.green(`✓ Task fired (run #${result.run_count})`)
                  : formatError("Task did not fire"));
                break;
              }
              case "delete": {
                const result = await backend.deleteTask(selected.id);
                addSystemMessage(result.deleted
                  ? t.green(`✓ Task deleted`)
                  : formatError("Task not found"));
                break;
              }
            }
          },
        });
      },
    });
  }

  return {
    async help(): Promise<void> {
      addSystemMessage(formatHelp());
    },

    // ── Onboarding wizard ──

    async onboard(): Promise<void> {
      // Step 1: Provider selection
      onboardProvider(ctx);
    },

    /**
     * /skills — unified skill management.
     *
     *   /skills              → interactive action picker (view, create, remove)
     *   /skills list         → list installed skills
     *   /skills create       → create a new skill (wizard)
     *   /skills remove       → remove a skill (wizard)
     *   /skills <name>       → show skill details
     */
    async skills(args: string): Promise<void> {
      const trimmed = args.trim();
      const parts = trimmed.split(/\s+/);
      const subCmd = parts[0]?.toLowerCase() ?? "";
      const rest = parts.slice(1).join(" ").trim();

      // /skills list — always show flat list
      if (subCmd === "list" || subCmd === "ls") {
        const skills = await backend.listSkills();
        addSystemMessage(formatSkillList(skills));
        return;
      }

      // /skills create [name]
      if (subCmd === "create" || subCmd === "new") {
        await skillCreateWizard(rest);
        return;
      }

      // /skills remove [name]
      if (subCmd === "remove" || subCmd === "rm" || subCmd === "delete") {
        await skillRemoveWizard(rest);
        return;
      }

      // /skills (no args) — interactive action picker
      if (!subCmd) {
        try {
          const skills = await backend.listSkills();
          const options = [
            { value: "create", label: "Create a skill", hint: "scaffold a new skill" },
            ...(skills.length > 0
              ? [
                  { value: "view", label: "View a skill", hint: `${skills.length} installed` },
                  { value: "remove", label: "Remove a skill", hint: "delete from disk" },
                ]
              : []),
            { value: "list", label: "List all skills", hint: `${skills.length} installed` },
          ];

          launchWizard(ctx, {
            title: "Skills",
            steps: [
              {
                type: "select",
                message: `${skills.length} skill(s) installed — what would you like to do?`,
                options,
              },
            ],
            onComplete: async ([action]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              switch (action) {
                case "create": await skillCreateWizard(""); break;
                case "view": await skillViewWizard(skills); break;
                case "remove": await skillRemoveWizard(""); break;
                default: addSystemMessage(formatSkillList(skills)); break;
              }
            },
          });
        } catch (err) {
          addSystemMessage(formatError(getErrorMessage(err)));
        }
        return;
      }

      // /skills <name> — show skill details
      const skill = await backend.getSkill(subCmd);
      if (!skill) {
        addSystemMessage(formatError(`Skill "${subCmd}" not found.`));
      } else {
        addSystemMessage(formatSkillDetail(skill.name, skill.description, skill.body));
      }
    },

    async status(): Promise<void> {
      if (!requireDaemon(ctx, "Status")) return;
      const statusData = await backend.getStatus();
      addSystemMessage(formatStatus(statusData));
    },

    // Health moved to /connector health

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
        addSystemMessage(formatError(getErrorMessage(err)));
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
              validate: validateEmail,
            },
          ],
          onComplete: async ([emailValue]) => {
            dispatch({ type: "SET_PHASE", phase: "idle" });
            try {
              const result = await backend.startUpgrade(emailValue!);
              openInBrowser(result.url);
              addSystemMessage(t.green(`\u2713 Checkout opened: ${result.url}`));
            } catch (err) {
              addSystemMessage(formatError(getErrorMessage(err)));
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
        addSystemMessage(formatError(getErrorMessage(err)));
      }
    },

    async billing(args = ""): Promise<void> {
      const parts = args.trim().toLowerCase().split(/\s+/);
      const sub = parts[0] || "";
      const rest = parts.slice(1).join(" ");

      switch (sub) {
        case "manage":
        case "": {
          const { BILLING_PORTAL_URL } = await import("../../daemon/billing/config.js");
          openInBrowser(BILLING_PORTAL_URL);
          addSystemMessage(t.green(`\u2713 Billing portal opened: ${BILLING_PORTAL_URL}`));
          return;
        }
        case "plan":
          return this.plan();
        case "upgrade":
          return this.upgrade(rest);
        case "cancel": {
          const { BILLING_PORTAL_URL } = await import("../../daemon/billing/config.js");
          openInBrowser(BILLING_PORTAL_URL);
          addSystemMessage(t.green(`\u2713 To cancel, use the billing portal: ${BILLING_PORTAL_URL}`));
          return;
        }
        default:
          addSystemMessage(t.dim("Usage: /billing [manage|plan|upgrade|cancel]"));
          return;
      }
    },

    // ── Tasks (unified: trigger, schedule, cron) ──

    async tasks(args: string): Promise<void> {
      if (!requireDaemon(ctx, "Tasks")) return;
      try {
        const trimmed = args.trim();
        const parts = trimmed.split(/\s+/);
        const subCmd = parts[0]?.toLowerCase() ?? "";
        const rest = parts.slice(1).join(" ").trim();

        // /tasks create — launch creation wizard
        if (subCmd === "create" || subCmd === "new" || subCmd === "add") {
          await taskCreateWizard();
          return;
        }

        // /tasks pause <id>
        if (subCmd === "pause" && rest) {
          const task = await backend.pauseTask(rest);
          addSystemMessage(t.green(`✓ Task "${task.name}" paused`));
          return;
        }

        // /tasks resume <id>
        if (subCmd === "resume" && rest) {
          const task = await backend.resumeTask(rest);
          addSystemMessage(t.green(`✓ Task "${task.name}" resumed`));
          return;
        }

        // /tasks delete <id>
        if ((subCmd === "delete" || subCmd === "rm" || subCmd === "remove") && rest) {
          const result = await backend.deleteTask(rest);
          addSystemMessage(result.deleted ? t.green(`✓ Task deleted`) : formatError("Task not found"));
          return;
        }

        // /tasks test <id>
        if (subCmd === "test" && rest) {
          const result = await backend.testTask(rest);
          addSystemMessage(result.fired ? t.green(`✓ Task fired (run #${result.run_count})`) : formatError("Task did not fire"));
          return;
        }

        // /tasks log
        if (subCmd === "log" || subCmd === "logs") {
          const log = await backend.getTaskLog();
          if (log.length === 0) {
            addSystemMessage(t.muted("No task history."));
          } else {
            addSystemMessage(formatTaskCategory("Task Log", log, "Recent task executions"));
          }
          return;
        }

        const allTasks = await backend.listTasks();

        // Category filters
        if (subCmd === "trigger" || subCmd === "triggers") {
          const triggers = allTasks.filter((tk) => isEventTrigger(tk.type));
          addSystemMessage(formatTaskCategory("Triggers", triggers, "Event-driven tasks (webhook, file, http, email)"));
          return;
        }
        if (subCmd === "schedule" || subCmd === "schedules") {
          const schedules = allTasks.filter((tk) => isScheduleTrigger(tk.type));
          addSystemMessage(formatTaskCategory("Schedules", schedules, "Recurring tasks (daily, weekly, monthly, custom)"));
          return;
        }
        if (subCmd === "cron" || subCmd === "crons") {
          const crons = allTasks.filter((tk) => isTimeTrigger(tk.type));
          addSystemMessage(formatTaskCategory("Cron Jobs", crons, "Cron expressions and one-time tasks"));
          return;
        }
        if (subCmd === "list" || subCmd === "ls") {
          const tc = allTasks.filter((tk) => isEventTrigger(tk.type)).length;
          const sc = allTasks.filter((tk) => isScheduleTrigger(tk.type)).length;
          const cc = allTasks.filter((tk) => isTimeTrigger(tk.type)).length;
          addSystemMessage(formatTaskHub(allTasks.length, tc, sc, cc, allTasks));
          return;
        }

        // /tasks (no args) → interactive action picker
        if (!subCmd) {
          const options = [
            { value: "create", label: "Create a task", hint: "schedule, trigger, or one-time" },
            ...(allTasks.length > 0
              ? [
                  { value: "all", label: "View all tasks", hint: `${allTasks.length} total` },
                  { value: "manage", label: "Manage a task", hint: "pause, resume, delete, test" },
                  { value: "log", label: "View task log", hint: "recent executions" },
                ]
              : []),
          ];

          launchWizard(ctx, {
            title: "Tasks",
            steps: [
              {
                type: "select",
                message: `${allTasks.length} task(s) — what would you like to do?`,
                options,
              },
            ],
            onComplete: async ([action]) => {
              dispatch({ type: "SET_PHASE", phase: "idle" });
              switch (action) {
                case "create": await taskCreateWizard(); break;
                case "manage": await taskManageWizard(allTasks); break;
                case "log": {
                  const log = await backend.getTaskLog();
                  addSystemMessage(log.length > 0
                    ? formatTaskCategory("Task Log", log, "Recent task executions")
                    : t.muted("No task history."));
                  break;
                }
                default: {
                  const tc = allTasks.filter((tk) => isEventTrigger(tk.type)).length;
                  const sc = allTasks.filter((tk) => isScheduleTrigger(tk.type)).length;
                  const cc = allTasks.filter((tk) => isTimeTrigger(tk.type)).length;
                  addSystemMessage(formatTaskHub(allTasks.length, tc, sc, cc, allTasks));
                  break;
                }
              }
            },
          });
          return;
        }

        // Unrecognized subcommand — show hub
        const triggerCount = allTasks.filter((tk) => isEventTrigger(tk.type)).length;
        const scheduleCount = allTasks.filter((tk) => isScheduleTrigger(tk.type)).length;
        const cronCount = allTasks.filter((tk) => isTimeTrigger(tk.type)).length;

        addSystemMessage(formatTaskHub(allTasks.length, triggerCount, scheduleCount, cronCount, allTasks));
      } catch (err) {
        addSystemMessage(formatError(getErrorMessage(err)));
      }
    },

    /**
     * /notifications — notification preferences with on/off toggle.
     *
     *   /notifications      → show current preferences
     *   /notifications on   → enable notifications
     *   /notifications off  → disable notifications
     */
    async notifications(args: string): Promise<void> {
      const subCmd = args.trim().toLowerCase();

      if (subCmd === "on" || subCmd === "enable") {
        try {
          await backend.setNotifications(true);
          addSystemMessage(t.green("✓ Notifications enabled."));
        } catch (err) {
          addSystemMessage(formatError(getErrorMessage(err)));
        }
        return;
      }

      if (subCmd === "off" || subCmd === "disable") {
        try {
          await backend.setNotifications(false);
          addSystemMessage(t.green("✓ Notifications disabled."));
        } catch (err) {
          addSystemMessage(formatError(getErrorMessage(err)));
        }
        return;
      }

      // Default: show current state + interactive toggle
      try {
        const prefs = await backend.listNotifications();
        const anyEnabled = prefs.some((p) => p.enabled);

        launchWizard(ctx, {
          title: "Notifications",
          steps: [
            {
              type: "select",
              message: `${prefs.length} channel(s) — notifications ${anyEnabled ? "enabled ●" : "disabled ○"}`,
              options: anyEnabled
                ? [
                    { value: "off", label: "Disable notifications", hint: "stop all alerts" },
                    { value: "view", label: "View current settings" },
                  ]
                : [
                    { value: "on", label: "Enable notifications", hint: "get alerts for triggers, tasks" },
                    { value: "view", label: "View current settings" },
                  ],
            },
          ],
          onComplete: async ([action]) => {
            dispatch({ type: "SET_PHASE", phase: "idle" });
            if (action === "on") {
              await backend.setNotifications(true);
              addSystemMessage(t.green("✓ Notifications enabled."));
            } else if (action === "off") {
              await backend.setNotifications(false);
              addSystemMessage(t.green("✓ Notifications disabled."));
            } else {
              addSystemMessage(formatNotificationList(prefs));
            }
          },
        });
      } catch (err) {
        addSystemMessage(formatError(getErrorMessage(err)));
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
  const daemonAvailable = ctx.backend.mode === "daemon";
  const choices = getAvailableAuthChoices(provider.id, daemonAvailable);

  // Provider has multiple auth methods — show picker
  if (choices && choices.length > 1) {
    launchWizard(ctx, {
      title: `Connect ${provider.name}`,
      steps: [
        {
          type: "select",
          message: `How would you like to authenticate?`,
          options: choices.map((c) => ({
            value: c.id,
            label: c.label,
            hint: c.hint,
          })),
        },
      ],
      onComplete: async ([choiceId]) => {
        ctx.dispatch({ type: "SET_PHASE", phase: "idle" });
        const choice = choices.find((c) => c.id === choiceId);
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

  // Single choice or no OAuth — straight to API key
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
    ctx.addSystemMessage(formatError(`OAuth failed: ${getErrorMessage(err)}`));
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
  await ctx.backend.updateSessionModel(provider.model);

  const parts = [
    t.green("\u2713 Setup complete!"),
    t.muted(`  Provider: ${provider.name}`),
    t.muted(`  Model:    ${displayModel}`),
    "",
    t.dim("Type a message to start chatting. Use /connect to add channels."),
  ];

  ctx.addSystemMessage(parts.join("\n"));
}
