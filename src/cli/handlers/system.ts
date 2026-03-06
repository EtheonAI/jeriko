/**
 * System, Billing, Skill, Task, Notification command handlers.
 */

import type { Backend } from "../backend.js";
import type { AppAction } from "../types.js";
import {
  formatHelp,
  formatSkillList,
  formatSkillDetail,
  formatStatus,
  formatSysInfo,
  formatConfigStructured,
  formatHealth,
  formatPlan,
  formatTaskList,
  formatNotificationList,
  formatError,
} from "../format.js";
import { t, setActiveTheme, getActiveTheme } from "../theme.js";
import { listThemes, type ThemePreset } from "../themes.js";

export interface SystemCommandContext {
  backend: Backend;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
}

function requireDaemon(ctx: SystemCommandContext, label: string): boolean {
  if (ctx.backend.mode !== "daemon") {
    ctx.addSystemMessage(t.muted(`${label} requires the daemon. Start with: jeriko server start`));
    return false;
  }
  return true;
}

export function createSystemHandlers(ctx: SystemCommandContext) {
  const { backend, dispatch, addSystemMessage } = ctx;

  return {
    async help(): Promise<void> {
      addSystemMessage(formatHelp());
    },

    async skills(): Promise<void> {
      const skills = await backend.listSkills();
      addSystemMessage(formatSkillList(skills));
    },

    async skill(args: string): Promise<void> {
      const skillName = args.trim();
      if (!skillName) {
        addSystemMessage(t.yellow("Usage: /skill <name>"));
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
        addSystemMessage(t.yellow("Usage: /upgrade <email>"));
        return;
      }
      try {
        const result = await backend.startUpgrade(email);
        addSystemMessage(t.green(`✓ Checkout opened: ${result.url}`));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },

    async billing(): Promise<void> {
      try {
        const result = await backend.openBillingPortal();
        addSystemMessage(t.green(`✓ Billing portal: ${result.url}`));
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

    // ── Tasks & Notifications ──

    async tasks(): Promise<void> {
      try {
        const tasks = await backend.listTasks();
        addSystemMessage(formatTaskList(tasks));
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
        const current = getActiveTheme();
        const themes = listThemes();
        const lines = themes.map((th) => {
          const marker = th.name === current ? t.green("●") : t.dim("○");
          return `  ${marker} ${th.name === current ? t.brand(th.displayName) : t.text(th.displayName)} ${t.dim(`(${th.type})`)}`;
        });
        addSystemMessage(
          `${t.brandBold("Themes")}\n` +
          `  Current: ${t.brand(current)}\n\n` +
          lines.join("\n") +
          `\n\n  ${t.dim("Use")} ${t.muted("/theme <name>")} ${t.dim("to switch.")}`,
        );
        return;
      }

      // Switch theme
      const themes = listThemes();
      const match = themes.find((th) => th.name === themeName);
      if (!match) {
        const available = themes.map((th) => th.name).join(", ");
        addSystemMessage(formatError(`Unknown theme "${themeName}". Available: ${available}`));
        return;
      }

      setActiveTheme(themeName as ThemePreset);
      addSystemMessage(t.green(`✓ Theme switched to ${match.displayName}`));
    },
  };
}
