/**
 * Onboarding — First-run wizard using WizardPrompter interface.
 *
 * Flow:
 *   1. Intro — "Welcome to Jeriko"
 *   2. Provider select — Claude (recommended), GPT, Local/Ollama, 22+ presets
 *   3. Auth method — OAuth (if available) or API key
 *   4. Credential acquisition — browser OAuth flow or key paste + verify
 *   5. Persist config + env (atomic writes)
 *   6. Outro — ready to chat
 *
 * Channels and connectors are added post-setup via /connect.
 * Daemon startup is handled by createBackend() via ensureDaemon().
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateApiKey, validateUrl, getProviderOptions, BUILT_IN_PROVIDER_IDS, MIN_API_KEY_LENGTH } from "../lib/setup.js";
import { getProviderAuth, getOAuthConfig, getAvailableAuthChoices, type AuthChoice } from "../lib/provider-auth.js";
import { runOAuthFlow } from "../lib/oauth-flow.js";
import { getConfigDir } from "../../shared/config.js";
import { verifyApiKey, verifyOllamaRunning, fetchOllamaModelList, verifyLMStudioRunning } from "./verify.js";
import type { WizardPrompter } from "./prompter.js";
import { JERIKO_DIR } from "../lib/daemon.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingResult {
  provider: string;
  model: string;
  apiKey: string;
  envKey: string;
  /** Specific local model selected (written as LOCAL_MODEL in .env). */
  localModel?: string;
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

/**
 * Run the first-launch onboarding wizard.
 * Returns null if the user cancels.
 */
export async function runOnboarding(
  prompter: WizardPrompter,
  version: string,
): Promise<OnboardingResult | null> {
  prompter.intro(`jeriko v${version}`);

  const providerOptions = getProviderOptions();

  // Loop: provider selection → auth/detection → success or go back to picker
  while (true) {
    // ── Step 1: Provider selection ─────────────────────────────────
    const providerId = await prompter.select({
      message: "Choose your AI provider",
      options: providerOptions.map((p, i) => ({
        value: p.id,
        label: p.name,
        hint: i === 0 ? "recommended" : !p.needsApiKey ? "no API key needed" : undefined,
      })),
    });

    if (isCancel(providerId)) {
      prompter.outro("Setup cancelled.");
      return null;
    }

    const provider = providerOptions.find((p) => p.id === providerId);
    if (!provider) {
      prompter.outro("Setup cancelled.");
      return null;
    }

    // ── Step 2: Authentication / detection ─────────────────────────
    let apiKey = "";
    let resolvedModel = provider.model;
    let localModel: string | undefined;

    if (provider.needsApiKey) {
      const result = await authenticateProvider(prompter, provider.id, provider.name, provider.envKey);
      if (result === "back") continue;  // user chose "go back" → re-show provider picker
      if (!result) return null;          // cancelled
      apiKey = result;
    } else if (provider.id === "local") {
      const localResult = await handleLocalProvider(prompter);
      if (localResult === "back") continue;  // user chose "go back" → re-show provider picker
      if (!localResult) return null;          // user cancelled (Ctrl+C)
      resolvedModel = localResult.model;
      localModel = localResult.localModel;
    } else if (provider.id === "lmstudio") {
      const lmResult = await handleLMStudio(prompter);
      if (lmResult === "back") continue;     // user chose "go back"
      if (!lmResult) return null;             // user cancelled
    }

    prompter.outro("You're all set! Use /connect to add channels later.");

    return {
      provider: provider.id,
      model: resolvedModel,
      apiKey,
      envKey: provider.envKey,
      localModel,
    };
  }
}

// ---------------------------------------------------------------------------
// Authentication — OAuth or API key
// ---------------------------------------------------------------------------

/**
 * Authenticate with a provider. Shows auth method picker if OAuth is
 * available, otherwise goes straight to API key input.
 *
 * Does NOT check env vars — if the user has env vars set, needsSetup()
 * returns false and the wizard is skipped entirely.
 *
 * @returns The API key string, "back" to return to provider picker, or null if cancelled.
 */
async function authenticateProvider(
  prompter: WizardPrompter,
  providerId: string,
  providerName: string,
  envKey: string,
): Promise<string | "back" | null> {
  // Get auth choices filtered by daemon availability.
  // During onboarding the daemon hasn't started yet, so relay-dependent
  // OAuth flows are excluded — the user goes straight to API key input.
  const { isDaemonRunning } = await import("../lib/daemon.js");
  const choices = getAvailableAuthChoices(providerId, isDaemonRunning());

  if (choices && choices.length > 1) {
    // Multiple auth methods — let user choose
    const choiceId = await prompter.select({
      message: `How would you like to authenticate with ${providerName}?`,
      options: [
        ...choices.map((c) => ({
          value: c.id,
          label: c.label,
          hint: c.hint,
        })),
        { value: "back", label: "Go back", hint: "choose a different provider" },
      ],
    });

    if (isCancel(choiceId)) {
      prompter.outro("Setup cancelled.");
      return null;
    }
    if (choiceId === "back") return "back";

    const choice = choices.find((c) => c.id === choiceId);
    if (!choice) return null;

    if (choice.method === "oauth-pkce") {
      return handleOAuthFlow(prompter, providerId);
    }

    // Fall through to API key input
  }

  // API key input
  return handleApiKeyInput(prompter, providerId, providerName, envKey);
}

/**
 * Handle OAuth PKCE flow — opens browser, waits for callback.
 */
async function handleOAuthFlow(
  prompter: WizardPrompter,
  providerId: string,
): Promise<string | null> {
  const oauthConfig = getOAuthConfig(providerId);
  if (!oauthConfig) {
    prompter.note("OAuth not configured for this provider", "Error");
    return null;
  }

  const s = prompter.spinner();
  s.start("Opening browser for authentication...");

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

    s.stop("Authenticated successfully");
    return result.key;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    s.stop(`Authentication failed: ${msg}`);

    // Offer API key fallback
    const fallback = await prompter.confirm({
      message: "Would you like to enter an API key instead?",
      initialValue: true,
    });

    if (isCancel(fallback) || !fallback) {
      prompter.outro("Setup cancelled.");
      return null;
    }

    return handleApiKeyInput(prompter, providerId, providerId, oauthConfig.envKey);
  }
}

/**
 * Handle API key paste + verification with retry on failure.
 *
 * If the key fails verification, the user can retry, use it anyway,
 * or go back to the provider picker. Validation (format) happens inline
 * via clack; verification (API call) happens after input.
 *
 * @returns The API key string, "back" to return to provider picker, or null if cancelled.
 */
async function handleApiKeyInput(
  prompter: WizardPrompter,
  providerId: string,
  providerName: string,
  envKey: string,
): Promise<string | "back" | null> {
  while (true) {
    const key = await prompter.password({
      message: `Enter your ${providerName} API key`,
      validate: (value) => {
        if (!validateApiKey(value)) {
          return value.trim().length < MIN_API_KEY_LENGTH
            ? `API key must be at least ${MIN_API_KEY_LENGTH} characters`
            : "API key must not contain whitespace";
        }
      },
    });

    if (isCancel(key)) {
      prompter.outro("Setup cancelled.");
      return null;
    }

    if (typeof key !== "string") { prompter.outro("Setup cancelled."); return null; }
    const apiKey = key.trim();

    // Verify key against provider API
    const s = prompter.spinner();
    s.start("Verifying API key...");
    const valid = await verifyApiKey(providerId, apiKey);

    if (valid) {
      s.stop("API key verified");
      return apiKey;
    }

    // Verification failed — let user retry, use anyway, go back, or cancel
    s.stop("API key verification failed");

    const action = await prompter.select({
      message: "The API key could not be verified. What would you like to do?",
      options: [
        { value: "retry", label: "Enter a different key" },
        { value: "use-anyway", label: "Use this key anyway", hint: "provider may be temporarily unreachable" },
        { value: "back", label: "Go back", hint: "choose a different provider" },
        { value: "cancel", label: "Cancel setup" },
      ],
    });

    if (isCancel(action) || action === "cancel") {
      prompter.outro("Setup cancelled.");
      return null;
    }

    if (action === "use-anyway") {
      return apiKey;
    }

    if (action === "back") {
      return "back";
    }

    // retry → loops back to password input
  }
}

// ---------------------------------------------------------------------------
// Local providers (Ollama, LM Studio)
// ---------------------------------------------------------------------------

/**
 * Handle Ollama setup — check if running, detect models, let user pick.
 *
 * If Ollama is not reachable at the default URL, offers the user a choice:
 *   1. Enter a custom URL (for non-standard ports or remote servers)
 *   2. Go back and pick a different provider
 *
 * Returns "back" if user wants to pick a different provider.
 * Returns null if user cancels (Ctrl+C).
 * Returns { model, localModel } on success.
 */
async function handleLocalProvider(
  prompter: WizardPrompter,
): Promise<{ model: string; localModel: string } | "back" | null> {
  let ollamaUrl = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

  // Retry loop — keeps trying until connected or user gives up
  while (true) {
    const s = prompter.spinner();
    s.start(`Checking Ollama at ${ollamaUrl}...`);

    const running = await verifyOllamaRunning(ollamaUrl);
    if (!running) {
      s.stop("Ollama not detected");

      const action = await prompter.select({
        message: "Ollama is not running. What would you like to do?",
        options: [
          { value: "custom-url", label: "Enter a custom URL", hint: "if Ollama is on another port or machine" },
          { value: "retry", label: "Retry", hint: "start Ollama first, then retry" },
          { value: "back", label: "Go back", hint: "choose a different provider" },
        ],
      });

      if (isCancel(action)) return null;     // Ctrl+C → exit wizard
      if (action === "back") return "back";   // go back → re-show provider picker

      if (action === "custom-url") {
        const urlInput = await prompter.text({
          message: "Enter the Ollama API URL",
          placeholder: "http://127.0.0.1:11434",
          validate: validateUrl,
        });

        if (isCancel(urlInput)) return null;  // Ctrl+C → exit
        if (typeof urlInput !== "string") return null;
        ollamaUrl = urlInput.trim().replace(/\/+$/, "");
        // Set env so the daemon also uses the custom URL
        process.env.OLLAMA_HOST = ollamaUrl;
      }
      // retry loops back to the top
      continue;
    }

    // Ollama is reachable — fetch models
    const models = await fetchOllamaModelList(ollamaUrl);
    s.stop(`Ollama running (${models.length} model${models.length !== 1 ? "s" : ""} found)`);

    if (models.length === 0) {
      prompter.note(
        "No models installed yet.\nRun in another terminal: ollama pull llama3\nThen come back and retry.",
        "No Models",
      );

      const retry = await prompter.confirm({
        message: "Retry model detection?",
        initialValue: true,
      });

      if (isCancel(retry)) return null;    // Ctrl+C → exit
      if (!retry) return "back";            // user said no → back to provider picker
      continue;
    }

    // Single model — auto-select
    if (models.length === 1) {
      const model = models[0]!;
      prompter.note(`Using: ${model}`, "Ollama Model");
      return { model: "local", localModel: model };
    }

    // Multiple models — let user pick
    const modelId = await prompter.select({
      message: "Choose an Ollama model",
      options: models.map((m) => ({ value: m, label: m })),
    });

    if (isCancel(modelId)) return null;
    if (typeof modelId !== "string") return null;
    return { model: "local", localModel: modelId };
  }
}

/**
 * Handle LM Studio setup — check if running, with retry and custom URL support.
 * Returns true on success, "back" to re-show provider picker, null on cancel.
 */
async function handleLMStudio(prompter: WizardPrompter): Promise<true | "back" | null> {
  let lmstudioUrl = process.env.LMSTUDIO_HOST ?? "http://127.0.0.1:1234";

  while (true) {
    const s = prompter.spinner();
    s.start(`Checking LM Studio at ${lmstudioUrl}...`);

    const running = await verifyLMStudioRunning(lmstudioUrl);
    if (running) {
      s.stop("LM Studio detected");
      return true;
    }

    s.stop("LM Studio not detected");

    const action = await prompter.select({
      message: "LM Studio is not running. What would you like to do?",
      options: [
        { value: "custom-url", label: "Enter a custom URL", hint: "if LM Studio is on another port" },
        { value: "retry", label: "Retry", hint: "start LM Studio first, then retry" },
        { value: "back", label: "Go back", hint: "choose a different provider" },
      ],
    });

    if (isCancel(action)) return null;     // Ctrl+C → exit wizard
    if (action === "back") return "back";   // go back → re-show provider picker

    if (action === "custom-url") {
      const urlInput = await prompter.text({
        message: "Enter the LM Studio API URL",
        placeholder: "http://127.0.0.1:1234",
        validate: validateUrl,
      });

      if (isCancel(urlInput)) return null;  // Ctrl+C → exit
      if (typeof urlInput !== "string") return null;
      lmstudioUrl = urlInput.trim().replace(/\/+$/, "");
      process.env.LMSTUDIO_HOST = lmstudioUrl;
    }
    // retry loops back
  }
}

// ---------------------------------------------------------------------------
// Persist setup result
// ---------------------------------------------------------------------------

/**
 * Write onboarding results to config + env files.
 *
 * Pure persistence — no daemon lifecycle management. createBackend()
 * owns daemon startup via ensureDaemon().
 *
 * All file writes are accumulated and performed atomically:
 * - config.json writes to a temp file then renames (POSIX atomic)
 * - .env vars are batch-merged in a single read-merge-write cycle
 */
export async function persistSetup(result: OnboardingResult): Promise<void> {
  const configDir = getConfigDir();

  // Create directories with descriptive error on failure
  for (const dir of [JERIKO_DIR, configDir]) {
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Cannot create directory: ${dir} — ${msg}`);
      }
    }
  }

  // ── Build config.json ──────────────────────────────────────────────────
  // Channels and connectors are added later via /connect — not during onboarding.
  const config: Record<string, unknown> = {
    agent: { model: result.model },
    channels: {},
    connectors: {},
    logging: { level: "info" },
  };

  // For preset providers (not built-in), add a providers[] entry so the daemon
  // registers them at boot. Built-in providers have their own drivers and don't
  // need this. The API key is referenced via {env:VAR} so it's read from .env.
  if (!BUILT_IN_PROVIDER_IDS.has(result.provider) && result.provider) {
    try {
      const { PROVIDER_PRESETS } = await import("../../daemon/agent/drivers/presets.js");
      const preset = PROVIDER_PRESETS.find((p: { id: string }) => p.id === result.provider);
      if (preset) {
        config.providers = [{
          id: preset.id,
          name: preset.name,
          baseUrl: preset.baseUrl,
          apiKey: result.envKey ? `{env:${result.envKey}}` : "",
          defaultModel: preset.defaultModel,
        }];
      }
    } catch {
      // Presets not available — daemon will auto-discover from env var instead
    }
  }

  // Atomic config.json write: temp file → rename
  const configPath = join(configDir, "config.json");
  const configTmp = join(configDir, ".config.json.tmp");
  const configJson = JSON.stringify(config, null, 2) + "\n";
  writeFileSync(configTmp, configJson);
  renameSync(configTmp, configPath);

  // ── Accumulate env vars and write in one batch ─────────────────────────
  const envVars: Record<string, string> = {};

  if (result.apiKey && result.envKey) {
    envVars[result.envKey] = result.apiKey;
  }
  if (result.localModel) {
    envVars.LOCAL_MODEL = result.localModel;
  }
  if (process.env.OLLAMA_HOST && process.env.OLLAMA_HOST !== "http://127.0.0.1:11434") {
    envVars.OLLAMA_HOST = process.env.OLLAMA_HOST;
  }
  if (process.env.LMSTUDIO_HOST && process.env.LMSTUDIO_HOST !== "http://127.0.0.1:1234") {
    envVars.LMSTUDIO_HOST = process.env.LMSTUDIO_HOST;
  }
  if (!process.env.NODE_AUTH_SECRET) {
    const { randomBytes } = await import("node:crypto");
    envVars.NODE_AUTH_SECRET = randomBytes(32).toString("hex");
  }

  // Ensure a stable user identity exists for relay routing (share links, webhooks, billing)
  if (!process.env.JERIKO_USER_ID) {
    const { randomUUID } = await import("node:crypto");
    envVars.JERIKO_USER_ID = randomUUID();
  }

  const envPath = join(configDir, ".env");
  writeEnvBatch(envPath, envVars);

  // Propagate to current process so the daemon picks them up
  for (const [key, value] of Object.entries(envVars)) {
    process.env[key] = value;
  }

  // Daemon startup is NOT handled here. createBackend() owns the daemon
  // lifecycle via ensureDaemon() — it auto-starts, waits for socket, and
  // provides visible feedback on failure. Separating persistence from
  // process management keeps each concern clean.
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Atomically merge a batch of key=value pairs into a .env file.
 *
 * - Reads the file once, parses line-by-line, updates existing keys in place,
 *   appends new keys at the end, and writes once.
 * - Uses anchored regex per key to avoid substring false-positives
 *   (e.g., MY_API_KEY won't match MY_API_KEY_SECRET).
 * - Handles: missing file, empty file, duplicate keys, values containing `=`.
 *
 * @param envPath  Path to the .env file
 * @param vars     Key-value pairs to merge
 */
export function writeEnvBatch(envPath: string, vars: Record<string, string>): void {
  if (Object.keys(vars).length === 0) return;

  const existing = existsSync(envPath)
    ? readFileSync(envPath, "utf-8")
    : "";

  const lines = existing.split("\n");
  const handled = new Set<string>();

  // Update existing keys in place
  for (let i = 0; i < lines.length; i++) {
    for (const [key, value] of Object.entries(vars)) {
      if (handled.has(key)) continue;
      // Match: KEY= at start of line (anchored, no substring)
      const pattern = new RegExp(`^${escapeRegex(key)}=`);
      if (pattern.test(lines[i]!)) {
        lines[i] = `${key}=${value}`;
        handled.add(key);
      }
    }
  }

  // Append keys that weren't found
  for (const [key, value] of Object.entries(vars)) {
    if (!handled.has(key)) {
      // Ensure there's a trailing newline before appending
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      lines.push(`${key}=${value}`);
    }
  }

  // Ensure single trailing newline
  const content = lines.join("\n").replace(/\n*$/, "\n");
  writeFileSync(envPath, content, { mode: 0o600 });

  try {
    chmodSync(envPath, 0o600);
  } catch {
    // Best effort on filesystems that ignore chmod semantics
  }
}

/** Escape a string for safe use in a RegExp. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect user cancellation from a @clack/prompts response.
 * Clack returns a symbol when the user presses Ctrl+C or Escape.
 */
function isCancel(value: unknown): value is symbol {
  return typeof value === "symbol";
}
