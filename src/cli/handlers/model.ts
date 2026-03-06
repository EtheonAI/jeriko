/**
 * Model & Provider command handlers.
 */

import type { Backend } from "../backend.js";
import type { AppAction, ProviderInfo } from "../types.js";
import {
  formatModelList,
  formatProviderList,
  formatProviderAdded,
  formatProviderRemoved,
  formatError,
} from "../format.js";
import { t } from "../theme.js";

export interface ModelCommandContext {
  backend: Backend;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
  state: { model: string };
  /** Ref to store providers for the picker UI. */
  pickerProvidersRef: React.MutableRefObject<ProviderInfo[]>;
}

export function createModelHandlers(ctx: ModelCommandContext) {
  const { backend, dispatch, addSystemMessage, state } = ctx;

  return {
    async model(args: string): Promise<void> {
      const modelArg = args.trim();
      if (!modelArg) {
        addSystemMessage(t.muted(`Current model: ${t.blue(state.model)}`));
      } else {
        dispatch({ type: "SET_MODEL", model: modelArg });
        await backend.updateSessionModel(modelArg);
        addSystemMessage(t.green(`Model switched to ${modelArg}`));
      }
    },

    async models(): Promise<void> {
      const models = await backend.listModels();
      addSystemMessage(formatModelList(models, state.model));
    },

    async providers(): Promise<void> {
      const providersList = await backend.listProviders();
      addSystemMessage(formatProviderList(providersList, state.model));
    },

    async provider(args: string): Promise<void> {
      const providerArgs = args.trim();
      if (!providerArgs || providerArgs === "list") {
        const providersList = await backend.listProviders();
        addSystemMessage(formatProviderList(providersList, state.model));
        return;
      }

      const parts = providerArgs.split(/\s+/);
      const action = parts[0];

      if (action === "add") {
        const providerId = parts[1];
        if (!providerId) {
          // Launch interactive provider picker
          try {
            const allProviders = await backend.listProviders();
            ctx.pickerProvidersRef.current = allProviders;
            dispatch({ type: "SET_PHASE", phase: "provider-add" });
          } catch (err) {
            addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
          }
          return;
        }
        // Inline syntax: /provider add <id> <base-url> <api-key>
        const providerUrl = parts[2];
        if (!providerUrl) {
          addSystemMessage(t.yellow("Usage: /provider add <id> <base-url> [api-key]"));
          return;
        }
        const providerKey = parts[3] ?? "";
        if (!providerKey) {
          addSystemMessage(t.yellow("API key required. Usage: /provider add <id> <base-url> <api-key>"));
          return;
        }
        try {
          const result = await backend.addProvider({
            id: providerId,
            baseUrl: providerUrl,
            apiKey: providerKey,
          });
          addSystemMessage(formatProviderAdded(result.id, result.name));
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      if (action === "remove" || action === "rm") {
        const removeId = parts[1];
        if (!removeId) {
          addSystemMessage(t.yellow("Usage: /provider remove <id>"));
          return;
        }
        try {
          await backend.removeProvider(removeId);
          addSystemMessage(formatProviderRemoved(removeId));
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      addSystemMessage(t.yellow("Usage: /provider [list | add <id> <url> <key> | remove <id>]"));
    },
  };
}
