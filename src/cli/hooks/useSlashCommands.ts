/**
 * useSlashCommands — extracted slash command dispatch from App.tsx.
 *
 * Replaces the monolithic 600-line switch statement with a clean
 * dispatch map backed by extracted handler modules.
 *
 * Each handler module (session.ts, model.ts, connector.ts, system.ts)
 * is a pure function factory that returns async command handlers.
 */

import { useCallback, useRef } from "react";
import type { Backend } from "../backend.js";
import type { AppAction, AppState, WizardConfig } from "../types.js";
import { createSessionHandlers } from "../handlers/session.js";
import { createModelHandlers } from "../handlers/model.js";
import { createConnectorHandlers } from "../handlers/connector.js";
import { createSystemHandlers } from "../handlers/system.js";
import { withTimeout, TimeoutError } from "../lib/timeout.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseSlashCommandsOptions {
  backend: Backend;
  state: AppState;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
}

type CommandHandler = (args: string) => Promise<void>;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSlashCommands({
  backend,
  state,
  dispatch,
  addSystemMessage,
}: UseSlashCommandsOptions) {
  const wizardConfigRef = useRef<WizardConfig | null>(null);

  /**
   * Dispatch map: slash command name → handler function.
   *
   * This is rebuilt when dependencies change but the lookup is O(1).
   * Each handler is a simple async function that does its work and
   * calls addSystemMessage with the formatted result.
   */
  const handleSlashCommand = useCallback(
    async (name: string, args: string): Promise<boolean> => {
      // Build handlers lazily (they close over current state)
      const sessionCtx = {
        backend,
        dispatch,
        addSystemMessage,
        state: { model: state.model, stats: state.stats },
        wizardConfigRef,
      };
      const session = createSessionHandlers(sessionCtx);

      const modelCtx = {
        backend,
        dispatch,
        addSystemMessage,
        state: { model: state.model },
        wizardConfigRef,
      };
      const model = createModelHandlers(modelCtx);

      const connectorCtx = { backend, dispatch, addSystemMessage, wizardConfigRef };
      const connector = createConnectorHandlers(connectorCtx);

      const systemCtx = { backend, dispatch, addSystemMessage, wizardConfigRef };
      const system = createSystemHandlers(systemCtx);

      // Dispatch table
      const handlers: Record<string, CommandHandler> = {
        // Session
        "/help":          () => system.help(),
        "/new":           () => session.new(),
        "/session":       () => session.session(),
        "/sessions":      () => session.sessions(),
        "/resume":        () => session.resume(args),
        "/switch":        () => session.resume(args),    // alias
        "/history":       () => session.history(),
        "/clear":         () => session.clear(),
        "/compact":       () => session.compact(),
        "/share":         () => session.share(args),
        "/cost":          () => session.cost(),
        "/kill":          () => session.kill(),
        "/archive":       () => session.archive(),
        "/delete":        () => session.delete(args),

        // Model (includes provider management)
        "/model":         () => model.model(args),
        "/models":        () => model.model("list"),     // alias → /model list

        // Connectors & Channels
        "/connectors":    () => connector.connectors(),
        "/connect":       () => connector.connect(args),
        "/disconnect":    () => connector.disconnect(args),
        "/channels":      () => connector.channels(),
        "/channel":       () => connector.channel(args),
        "/auth":          () => connector.auth(args),

        // Tasks (unified: trigger, schedule, cron)
        "/task":          () => system.task(args),
        "/tasks":         () => system.task(""),       // alias → /task hub
        "/triggers":      () => system.triggers(),

        // Skills
        "/skills":        () => system.skills(),
        "/skill":         () => system.skill(args),

        // Onboarding
        "/onboard":       () => system.onboard(),

        // System
        "/status":        () => system.status(),
        "/health":        () => system.health(),
        "/sys":           () => system.sys(),
        "/config":        () => system.config(),

        // Billing
        "/plan":          () => system.plan(),
        "/upgrade":       () => system.upgrade(args),
        "/billing":       () => system.billing(),
        "/cancel":        () => system.cancel(),

        // Notifications
        "/notifications": () => system.notifications(),

        // Theme
        "/theme":         () => system.theme(args),
      };

      const handler = handlers[name];
      if (!handler) return false;

      // Guard: don't overwrite an active wizard
      if (state.phase === "wizard" && wizardConfigRef.current) {
        addSystemMessage("A wizard is already active. Complete or cancel it first.");
        return true;
      }

      /** Max time for a slash command before we declare the backend unresponsive. */
      const COMMAND_TIMEOUT_MS = 30_000;

      try {
        await withTimeout(handler(args), COMMAND_TIMEOUT_MS, name);
      } catch (err: unknown) {
        if (err instanceof TimeoutError) {
          addSystemMessage(`${name} timed out. The daemon may be unresponsive — try /status.`);
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          addSystemMessage(`Error: ${msg}`);
        }
      }
      return true;
    },
    [backend, state.model, state.stats, state.phase, addSystemMessage, dispatch],
  );

  return { handleSlashCommand, wizardConfigRef };
}
