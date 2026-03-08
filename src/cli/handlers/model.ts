/**
 * Model command handlers — unified model management.
 *
 * One command to rule them all:
 *
 *   `/model`              → interactive picker: configured models + available providers
 *   `/model <name>`       → direct switch (prompts for API key if provider unconfigured)
 *   `/model list`         → browse all providers + models
 *   `/model add [id]`     → add a provider (preset picker or API key)
 *   `/model rm [id]`      → remove a provider
 */

import type { Backend } from "../backend.js";
import type { AppAction, ModelInfo, ProviderInfo, WizardConfig } from "../types.js";
import {
  formatModelList,
  formatProviderAdded,
  formatProviderRemoved,
  formatError,
} from "../format.js";
import { t } from "../theme.js";
import { validateApiKey, BUILT_IN_PROVIDER_IDS, MIN_API_KEY_LENGTH } from "../lib/setup.js";
import { getProviderAuth, getOAuthConfig, hasOAuth } from "../lib/provider-auth.js";
import { runOAuthFlow } from "../lib/oauth-flow.js";
import { verifyApiKey } from "../wizard/verify.js";

export interface ModelCommandContext {
  backend: Backend;
  dispatch: (action: AppAction) => void;
  addSystemMessage: (content: string) => void;
  state: { model: string };
  wizardConfigRef: React.MutableRefObject<WizardConfig | null>;
}

/** Launch a wizard. Wraps onComplete with error handling so async failures show a message. */
function launchWizard(ctx: ModelCommandContext, config: WizardConfig): void {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build unified picker options: configured models + unconfigured providers. */
function buildPickerOptions(
  models: ReadonlyArray<ModelInfo>,
  providers: ReadonlyArray<ProviderInfo>,
  currentModel: string,
): Array<{ value: string; label: string; hint: string }> {
  const activeIds = new Set(
    providers
      .filter((p) => p.type !== "available")
      .map((p) => p.id),
  );

  // Group models by provider
  const byProvider = new Map<string, ModelInfo[]>();
  for (const m of models) {
    if (!activeIds.has(m.provider)) continue;
    const group = byProvider.get(m.provider) ?? [];
    group.push(m);
    byProvider.set(m.provider, group);
  }

  const options: Array<{ value: string; label: string; hint: string }> = [];
  const builtIn = BUILT_IN_PROVIDER_IDS;

  // Section 1: Models from configured providers
  for (const [provider, providerModels] of byProvider) {
    const sorted = [...providerModels].sort((a, b) => {
      const aCur = a.id === currentModel ? 1 : 0;
      const bCur = b.id === currentModel ? 1 : 0;
      if (aCur !== bCur) return bCur - aCur;
      const aScore = (a.supportsTools ? 2 : 0) + (a.supportsReasoning ? 2 : 0);
      const bScore = (b.supportsTools ? 2 : 0) + (b.supportsReasoning ? 2 : 0);
      return bScore - aScore;
    });

    for (const m of sorted.slice(0, 5)) {
      // Always use provider:model format so parseModelSpec() can resolve the driver.
      // Bare model IDs like "gpt-5.3-codex" cause "Unknown LLM backend" errors.
      const modelSpec = `${provider}:${m.id}`;
      const hints: string[] = [provider];
      if (m.contextWindow) hints.push(`${Math.round(m.contextWindow / 1000)}k`);
      if (m.supportsReasoning) hints.push("reasoning");
      if (m.supportsTools) hints.push("tools");

      options.push({
        value: modelSpec,
        label: m.id,
        hint: hints.join(" \u00B7 "),
      });
    }
  }

  // Section 2: Unconfigured providers (available to connect)
  const available = providers.filter((p) => p.type === "available");
  for (const p of available.slice(0, 8)) {
    const connectHint = hasOAuth(p.id) ? "sign in or API key" : "add API key";
    options.push({
      value: `__add__:${p.id}`,
      label: `+ ${p.name}`,
      hint: p.defaultModel
        ? `${connectHint} \u00B7 ${p.defaultModel}`
        : connectHint,
    });
  }

  if (available.length > 8) {
    options.push({
      value: "__add_more__",
      label: "+ More providers...",
      hint: `${available.length - 8} more available`,
    });
  }

  return options;
}

// ---------------------------------------------------------------------------
// Connect + switch — OAuth-aware auth chain
//
// Flow: Auth method picker (if OAuth available) → OAuth or API key → connect
// Follows the same composable chain pattern as system.ts onboarding.
// ---------------------------------------------------------------------------

/** Accumulated state for the connect flow. */
interface ConnectState {
  provider: ProviderInfo;
  targetModel?: string;
  apiKey?: string;
}

/**
 * Connect a provider and switch to its model.
 * Shows OAuth picker for providers that support it, otherwise straight to API key.
 */
function connectAndSwitch(
  ctx: ModelCommandContext,
  provider: ProviderInfo,
  targetModel?: string,
): void {
  const state: ConnectState = { provider, targetModel };
  const authDef = getProviderAuth(provider.id);

  // Provider has multiple auth methods (e.g. OpenRouter: OAuth + API key)
  if (authDef && authDef.choices.length > 1) {
    launchWizard(ctx, {
      title: `Connect ${provider.name}`,
      steps: [
        {
          type: "select",
          message: "How would you like to authenticate?",
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
          await connectOAuth(ctx, state);
        } else {
          connectApiKey(ctx, state);
        }
      },
    });
    return;
  }

  // No OAuth — straight to API key
  connectApiKey(ctx, state);
}

/**
 * OAuth flow — opens browser, waits for callback, then finalizes.
 * Falls back to API key on failure.
 */
async function connectOAuth(ctx: ModelCommandContext, state: ConnectState): Promise<void> {
  const oauthConfig = getOAuthConfig(state.provider.id);
  if (!oauthConfig) {
    ctx.addSystemMessage(formatError("OAuth not configured for this provider"));
    connectApiKey(ctx, state);
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
    await connectFinalize(ctx, state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.addSystemMessage(formatError(`OAuth failed: ${msg}`));
    ctx.addSystemMessage(t.muted("Falling back to API key input..."));
    connectApiKey(ctx, state);
  }
}

/**
 * API key input with validation and verification.
 */
function connectApiKey(ctx: ModelCommandContext, state: ConnectState): void {
  launchWizard(ctx, {
    title: `Connect ${state.provider.name}`,
    steps: [
      {
        type: "password",
        message: `Enter your ${state.provider.name} API key`,
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
      const valid = await verifyApiKey(state.provider.id, key);
      if (valid) {
        ctx.addSystemMessage(t.green("\u2713 API key verified"));
      } else {
        ctx.addSystemMessage(t.warning("Could not verify key (continuing anyway)"));
      }

      await connectFinalize(ctx, state);
    },
  });
}

/**
 * Finalize connection — save API key, add provider config if needed, switch model.
 *
 * Built-in providers (anthropic, openai) already have native drivers. They only
 * need their API key written to .env — no providers[] config entry. Custom/preset
 * providers need a config entry so the daemon registers a driver for them at boot.
 */
async function connectFinalize(ctx: ModelCommandContext, state: ConnectState): Promise<void> {
  const { provider, targetModel, apiKey } = state;

  try {
    const isBuiltIn = BUILT_IN_PROVIDER_IDS.has(provider.id);

    if (isBuiltIn && apiKey && provider.envKey) {
      // Built-in provider — just save the API key to .env and process.env.
      // No config entry needed; the native driver is always registered.
      const { writeEnvBatch } = await import("../wizard/onboarding.js");
      const { join } = await import("node:path");
      const { getConfigDir } = await import("../../shared/config.js");
      const envPath = join(getConfigDir(), ".env");
      writeEnvBatch(envPath, { [provider.envKey]: apiKey });
      process.env[provider.envKey] = apiKey;
    } else {
      // Custom/preset provider — add a config entry so the daemon registers it.
      await ctx.backend.addProvider({
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl ?? "",
        apiKey: apiKey ?? "",
        defaultModel: provider.defaultModel,
      });
    }

    const modelSpec = targetModel ?? (
      provider.defaultModel
        ? `${provider.id}:${provider.defaultModel}`
        : provider.id
    );
    ctx.dispatch({ type: "SET_MODEL", model: modelSpec });
    await ctx.backend.updateSessionModel(modelSpec);

    ctx.addSystemMessage(
      `${t.green("\u2713")} ${t.blue(provider.name)} connected \u2014 switched to ${t.blue(modelSpec)}`,
    );
  } catch (err) {
    ctx.addSystemMessage(
      formatError(err instanceof Error ? err.message : String(err)),
    );
  }
}

/** Auto-connect a discovered provider (env var already set). */
async function autoConnect(
  ctx: ModelCommandContext,
  provider: ProviderInfo,
): Promise<void> {
  const result = await ctx.backend.addProvider({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl ?? "",
    apiKey: `{env:${provider.envKey}}`,
    defaultModel: provider.defaultModel,
  });
  const modelSpec = provider.defaultModel
    ? `${provider.id}:${provider.defaultModel}`
    : provider.id;
  ctx.dispatch({ type: "SET_MODEL", model: modelSpec });
  await ctx.backend.updateSessionModel(modelSpec);
  ctx.addSystemMessage(
    `${t.green("\u2713")} ${t.blue(result.name)} connected \u2014 switched to ${t.blue(modelSpec)}`,
  );
}

// ---------------------------------------------------------------------------
// Add sub-command
// ---------------------------------------------------------------------------

async function handleAdd(ctx: ModelCommandContext, providerId?: string): Promise<void> {
  const { backend, dispatch, addSystemMessage } = ctx;

  if (!providerId) {
    // No id → show all available providers as picker
    const allProviders = await backend.listProviders();
    const addable = allProviders.filter(
      (p) => p.type === "available" || p.type === "discovered",
    );
    if (addable.length === 0) {
      addSystemMessage(t.muted("All providers are already configured."));
      return;
    }
    launchWizard(ctx, {
      title: "Add a Provider",
      steps: [
        {
          type: "select",
          message: "Choose a provider to add:",
          options: addable.map((p) => {
            const authHint = p.type === "discovered"
              ? "env detected"
              : hasOAuth(p.id) ? "sign in or API key" : "needs API key";
            return {
              value: p.id,
              label: p.name,
              hint: p.defaultModel
                ? `${authHint} \u00B7 ${p.defaultModel}`
                : authHint,
            };
          }),
        },
      ],
      onComplete: async ([selected]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        const provider = addable.find((p) => p.id === selected);
        if (!provider) return;

        if (provider.type === "discovered") {
          try {
            await autoConnect(ctx, provider);
          } catch (err) {
            addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
          }
        } else {
          connectAndSwitch(ctx, provider);
        }
      },
    });
    return;
  }

  // Has id — look it up
  const allProviders = await backend.listProviders();
  const provider = allProviders.find(
    (p) => p.id === providerId && (p.type === "available" || p.type === "discovered"),
  );

  if (provider) {
    if (provider.type === "discovered") {
      try {
        await autoConnect(ctx, provider);
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    } else {
      connectAndSwitch(ctx, provider);
    }
    return;
  }

  // Check if already configured
  const existing = allProviders.find((p) => p.id === providerId);
  if (existing && (existing.type === "built-in" || existing.type === "custom")) {
    addSystemMessage(t.muted(`Provider "${providerId}" is already configured.`));
    return;
  }

  // Unknown provider id — prompt for custom URL + key
  launchWizard(ctx, {
    title: `Add Provider: ${providerId}`,
    steps: [
      {
        type: "text",
        message: "Enter the base URL:",
        placeholder: "https://api.example.com/v1",
        validate: (v) => !v.startsWith("http") ? "Must be a valid URL" : undefined,
      },
      {
        type: "password",
        message: "Enter the API key:",
        validate: (value) => {
          if (!validateApiKey(value)) {
            return value.trim().length < MIN_API_KEY_LENGTH
              ? `API key must be at least ${MIN_API_KEY_LENGTH} characters`
              : "API key must not contain whitespace";
          }
        },
      },
    ],
    onComplete: async ([url, key]) => {
      dispatch({ type: "SET_PHASE", phase: "idle" });
      try {
        const result = await backend.addProvider({
          id: providerId,
          baseUrl: url!,
          apiKey: key!,
        });
        addSystemMessage(formatProviderAdded(result.id, result.name));
      } catch (err) {
        addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Remove sub-command
// ---------------------------------------------------------------------------

async function handleRemove(ctx: ModelCommandContext, removeId?: string): Promise<void> {
  const { backend, dispatch, addSystemMessage } = ctx;

  const allProviders = await backend.listProviders();
  const configured = allProviders.filter(
    (p) => p.type === "built-in" || p.type === "custom" || p.type === "discovered",
  );

  /** Confirm before removing the last provider. Returns false if user aborts. */
  async function confirmLastProvider(providerId: string): Promise<boolean> {
    // Count active providers (built-in + custom + discovered), excluding the one being removed
    const remaining = configured.filter((p) => p.id !== providerId);
    if (remaining.length > 0) return true;

    return new Promise((resolve) => {
      launchWizard(ctx, {
        title: "Remove Last Provider",
        steps: [
          {
            type: "select",
            message: "This is your only configured provider. Removing it means you can't chat. Continue?",
            options: [
              { value: "yes", label: "Yes, remove it" },
              { value: "no", label: "Cancel" },
            ],
          },
        ],
        onComplete: async ([answer]) => {
          dispatch({ type: "SET_PHASE", phase: "idle" });
          resolve(answer === "yes");
        },
      });
    });
  }

  if (!removeId) {
    const removable = allProviders.filter(
      (p) => p.type === "custom" || p.type === "discovered",
    );
    if (removable.length === 0) {
      addSystemMessage(t.muted("No custom providers to remove."));
      return;
    }
    launchWizard(ctx, {
      title: "Remove a Provider",
      steps: [
        {
          type: "select",
          message: "Choose a provider to remove:",
          options: removable.map((p) => ({
            value: p.id,
            label: p.name || p.id,
            hint: p.defaultModel,
          })),
        },
      ],
      onComplete: async ([selected]) => {
        dispatch({ type: "SET_PHASE", phase: "idle" });
        if (!selected) return;

        const confirmed = await confirmLastProvider(selected);
        if (!confirmed) {
          addSystemMessage(t.muted("Removal cancelled."));
          return;
        }

        try {
          await backend.removeProvider(selected);
          addSystemMessage(formatProviderRemoved(selected));
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
      },
    });
    return;
  }

  const confirmed = await confirmLastProvider(removeId);
  if (!confirmed) {
    addSystemMessage(t.muted("Removal cancelled."));
    return;
  }

  try {
    await backend.removeProvider(removeId);
    addSystemMessage(formatProviderRemoved(removeId));
  } catch (err) {
    addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function createModelHandlers(ctx: ModelCommandContext) {
  const { backend, dispatch, addSystemMessage, state } = ctx;

  return {
    /**
     * /model — unified model command.
     *
     *   /model              → interactive picker (models + add provider)
     *   /model <name>       → direct switch (or connect-then-switch)
     *   /model list         → browse all providers + models
     *   /model add [id]     → add a provider (preset picker or API key only)
     *   /model rm [id]      → remove a provider
     */
    async model(args: string): Promise<void> {
      const modelArg = args.trim();

      // /model list → full browse view
      if (modelArg === "list") {
        const [models, providers] = await Promise.all([
          backend.listModels(),
          backend.listProviders(),
        ]);
        addSystemMessage(formatModelList(models, state.model, providers));
        return;
      }

      // /model add [id] → add a provider
      if (modelArg === "add" || modelArg.startsWith("add ")) {
        const addId = modelArg === "add" ? undefined : modelArg.slice(4).trim();
        try {
          await handleAdd(ctx, addId || undefined);
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      // /model rm [id] or /model remove [id] → remove a provider
      if (modelArg === "rm" || modelArg.startsWith("rm ") ||
          modelArg === "remove" || modelArg.startsWith("remove ")) {
        const rmParts = modelArg.split(/\s+/);
        const rmId = rmParts[1];
        try {
          await handleRemove(ctx, rmId);
        } catch (err) {
          addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      // /model <name> → direct switch (with smart connect)
      if (modelArg) {
        const colonIdx = modelArg.indexOf(":");
        if (colonIdx > 0) {
          const providerId = modelArg.slice(0, colonIdx);
          try {
            const providers = await backend.listProviders();
            const provider = providers.find((p) => p.id === providerId);
            if (provider && provider.type === "available") {
              connectAndSwitch(ctx, provider, modelArg);
              return;
            }
          } catch {
            // Backend not available — try switching anyway
          }
        }

        dispatch({ type: "SET_MODEL", model: modelArg });
        await backend.updateSessionModel(modelArg);
        addSystemMessage(t.green(`Model switched to ${modelArg}`));
        return;
      }

      // No arg → unified interactive picker
      try {
        const [models, providers] = await Promise.all([
          backend.listModels(),
          backend.listProviders(),
        ]);

        const options = buildPickerOptions(models, providers, state.model);
        if (options.length === 0) {
          addSystemMessage(
            t.muted(`Current model: ${t.blue(state.model)}\n`) +
            t.dim(`  No models or providers available.`),
          );
          return;
        }

        launchWizard(ctx, {
          title: "Switch Model",
          steps: [
            {
              type: "select",
              message: `Current: ${state.model}`,
              options,
            },
          ],
          onComplete: async ([selected]) => {
            dispatch({ type: "SET_PHASE", phase: "idle" });

            if (selected === "__add_more__") {
              await handleAdd(ctx);
              return;
            }

            if (selected?.startsWith("__add__:")) {
              const providerId = selected.slice("__add__:".length);
              try {
                await handleAdd(ctx, providerId);
              } catch (err) {
                addSystemMessage(formatError(err instanceof Error ? err.message : String(err)));
              }
              return;
            }

            // Regular model switch
            dispatch({ type: "SET_MODEL", model: selected! });
            await backend.updateSessionModel(selected!);
            addSystemMessage(t.green(`Model switched to ${selected}`));
          },
        });
      } catch {
        addSystemMessage(
          t.muted(`Current model: ${t.blue(state.model)}\n`) +
          t.dim(`  /model              interactive picker\n`) +
          t.dim(`  /model <name>       switch model\n`) +
          t.dim(`  /model list         browse all\n`) +
          t.dim(`  /model add [id]     add a provider\n`) +
          t.dim(`  /model rm [id]      remove a provider`),
        );
      }
    },
  };
}
