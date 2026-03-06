/**
 * useSlashCommands — extracted slash command dispatch from App.tsx.
 *
 * Replaces the monolithic 600-line switch statement with a clean
 * dispatch map backed by extracted handler modules.
 *
 * Each handler module (session.ts, model.ts, connector.ts, system.ts)
 * is a pure function factory that returns async command handlers.
 */

import { useCallback, useMemo, useRef } from "react";
import type { Backend } from "../backend.js";
import type { AppAction, AppState, ProviderInfo } from "../types.js";
import { createSessionHandlers } from "../handlers/session.js";
import { createModelHandlers } from "../handlers/model.js";
import { createConnectorHandlers } from "../handlers/connector.js";
import { createSystemHandlers } from "../handlers/system.js";

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
  const pickerProvidersRef = useRef<ProviderInfo[]>([]);

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
      };
      const session = createSessionHandlers(sessionCtx);

      const modelCtx = {
        backend,
        dispatch,
        addSystemMessage,
        state: { model: state.model },
        pickerProvidersRef,
      };
      const model = createModelHandlers(modelCtx);

      const connectorCtx = { backend, dispatch, addSystemMessage };
      const connector = createConnectorHandlers(connectorCtx);

      const systemCtx = { backend, dispatch, addSystemMessage };
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

        // Model & Providers
        "/model":         () => model.model(args),
        "/models":        () => model.models(),
        "/providers":     () => model.providers(),
        "/provider":      () => model.provider(args),

        // Connectors & Channels
        "/connectors":    () => connector.connectors(),
        "/connect":       () => connector.connect(args),
        "/disconnect":    () => connector.disconnect(args),
        "/channels":      () => connector.channels(),
        "/channel":       () => connector.channel(args),
        "/triggers":      () => connector.triggers(),
        "/auth":          () => connector.auth(args),

        // Skills
        "/skills":        () => system.skills(),
        "/skill":         () => system.skill(args),

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

        // Tasks & Notifications
        "/tasks":         () => system.tasks(),
        "/notifications": () => system.notifications(),

        // Theme
        "/theme":         () => system.theme(args),
      };

      const handler = handlers[name];
      if (!handler) return false;

      await handler(args);
      return true;
    },
    [backend, state.model, state.stats, addSystemMessage, dispatch],
  );

  return { handleSlashCommand, pickerProvidersRef };
}
