// CLI command: jeriko provider
//
// Manage custom LLM providers (OpenRouter, DeepInfra, Together, Groq, etc.).
//
//   jeriko provider list                                     → list all providers
//   jeriko provider add <id> --url <baseUrl> --key <apiKey>  → add custom provider
//   jeriko provider remove <id>                              → remove provider
//   jeriko provider test <id>                                → test API connectivity

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig, getConfigDir, type ProviderConfig } from "../../../shared/config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDaemonRunning(): boolean {
  return existsSync(join(homedir(), ".jeriko", "daemon.sock"));
}

function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

function readConfigFile(): Record<string, unknown> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

function writeConfigFile(config: Record<string, unknown>): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n");
}

function printHelp(): void {
  console.log("Usage: jeriko provider <action> [options]");
  console.log("\nManage custom LLM providers.\n");
  console.log("Actions:");
  console.log("  list                              List all providers");
  console.log("  add <id> --url <base-url> --key <api-key>");
  console.log("                                    Add a custom provider");
  console.log("  remove <id>                       Remove a custom provider");
  console.log("  test <id>                         Test provider connectivity");
  console.log("\nOptions:");
  console.log("  --url <base-url>     API base URL (required for add)");
  console.log("  --key <api-key>      API key (required for add)");
  console.log("  --name <display>     Display name (default: capitalized id)");
  console.log("  --default-model <m>  Default model for this provider");
  console.log("  --help               Show this help");
  console.log("\nExamples:");
  console.log("  jeriko provider list                              # list all providers");
  console.log("  jeriko provider add groq                          # add from preset (if GROQ_API_KEY is set)");
  console.log("  jeriko provider add openrouter --key sk-or-...    # add from preset with explicit key");
  console.log('  jeriko provider add custom --url https://api.example.com/v1 --key sk-...');
  console.log("  jeriko provider remove openrouter");
  console.log("  jeriko provider test groq");
  console.log("\nKnown presets: openrouter, groq, deepseek, google, xai, mistral,");
  console.log("  together, fireworks, deepinfra, cerebras, perplexity, cohere,");
  console.log("  github-models, nvidia, nebius, huggingface, and more.");
  console.log("\nSet the env var to auto-discover: export GROQ_API_KEY=gsk-...");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function actionList(): Promise<void> {
  if (isDaemonRunning()) {
    const { sendRequest } = await import("../../../daemon/api/socket.js");
    const response = await sendRequest("providers.list", {});
    if (!response.ok) fail(response.error ?? "Failed to list providers");
    ok(response.data);
  }

  // Direct mode — read config + presets
  const config = loadConfig();
  const { listPresets, discoverProviderPresets } = await import("../../../daemon/agent/drivers/presets.js");

  const providers: Array<{
    id: string;
    name: string;
    type: "built-in" | "custom" | "discovered" | "available";
    baseUrl?: string;
    defaultModel?: string;
    modelCount?: number;
    envKey?: string;
  }> = [];

  // Built-in drivers
  const builtInNames = ["anthropic", "openai", "local"] as const;
  for (const name of builtInNames) {
    providers.push({
      id: name,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      type: "built-in",
    });
  }

  // Custom providers from config
  const configIds = new Set<string>();
  for (const p of config.providers ?? []) {
    configIds.add(p.id);
    providers.push({
      id: p.id,
      name: p.name,
      type: "custom",
      baseUrl: p.baseUrl,
      defaultModel: p.defaultModel,
      modelCount: p.models ? Object.keys(p.models).length : undefined,
    });
  }

  // Auto-discovered from env vars
  const discovered = discoverProviderPresets(configIds);
  for (const p of discovered) {
    configIds.add(p.id);
    providers.push({
      id: p.id,
      name: p.name,
      type: "discovered",
      baseUrl: p.baseUrl,
      defaultModel: p.defaultModel,
    });
  }

  // Available presets (not configured, env var not set)
  for (const preset of listPresets()) {
    if (configIds.has(preset.id)) continue;
    if (builtInNames.includes(preset.id as typeof builtInNames[number])) continue;
    providers.push({
      id: preset.id,
      name: preset.name,
      type: "available",
      baseUrl: preset.baseUrl,
      defaultModel: preset.defaultModel,
      envKey: preset.envKey,
    });
  }

  ok(providers);
}

async function actionAdd(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  const id = parsed.positional[1];
  if (!id) fail("Provider ID is required. Usage: jeriko provider add <id> --url <base-url> --key <api-key>");

  let baseUrl = flagStr(parsed, "url", "");
  let apiKey = flagStr(parsed, "key", "");
  const name = flagStr(parsed, "name", "");
  const defaultModel = flagStr(parsed, "default-model", "");

  // If no --url/--key provided, check if this is a known preset
  if (!baseUrl || !apiKey) {
    const { getPreset } = await import("../../../daemon/agent/drivers/presets.js");
    const preset = getPreset(id);

    if (preset) {
      if (!baseUrl) baseUrl = preset.baseUrl;
      if (!apiKey) {
        // Try env var first, then require explicit --key
        const envVal = process.env[preset.envKey]
          ?? (preset.envKeyAlt ? process.env[preset.envKeyAlt] : undefined);
        if (envVal) {
          apiKey = `{env:${preset.envKey}}`;
        } else {
          fail(
            `--key is required for "${id}". Set ${preset.envKey} in your environment, ` +
            `or pass --key explicitly.\n\n  Example: export ${preset.envKey}=sk-...`,
          );
        }
      }
    } else {
      if (!baseUrl) fail("--url is required (no preset found for this provider)");
      if (!apiKey) fail("--key is required");
    }
  }

  // Validate URL format
  try {
    new URL(baseUrl);
  } catch {
    fail(`Invalid URL: ${baseUrl}`);
  }

  // Resolve display name and default model from preset if not explicitly set
  let resolvedName = name;
  let resolvedDefaultModel = defaultModel;
  if (!resolvedName || !resolvedDefaultModel) {
    const { getPreset } = await import("../../../daemon/agent/drivers/presets.js");
    const preset = getPreset(id);
    if (preset) {
      if (!resolvedName) resolvedName = preset.name;
      if (!resolvedDefaultModel && preset.defaultModel) resolvedDefaultModel = preset.defaultModel;
    }
  }
  if (!resolvedName) resolvedName = id.charAt(0).toUpperCase() + id.slice(1);

  if (isDaemonRunning()) {
    const { sendRequest } = await import("../../../daemon/api/socket.js");
    const params: Record<string, unknown> = {
      id,
      base_url: baseUrl,
      api_key: apiKey,
      name: resolvedName,
    };
    if (resolvedDefaultModel) params.default_model = resolvedDefaultModel;

    const response = await sendRequest("providers.add", params);
    if (!response.ok) fail(response.error ?? "Failed to add provider");
    ok(response.data);
  }

  // Direct mode — write to config file
  const fileConfig = readConfigFile();
  const providers = (fileConfig.providers as ProviderConfig[] | undefined) ?? [];

  if (providers.some((p) => p.id === id)) {
    fail(`Provider "${id}" already exists. Remove it first with: jeriko provider remove ${id}`);
  }

  const newProvider: ProviderConfig = {
    id,
    name: resolvedName,
    baseUrl,
    apiKey,
    type: "openai-compatible",
    ...(resolvedDefaultModel ? { defaultModel: resolvedDefaultModel } : {}),
  };

  providers.push(newProvider);
  fileConfig.providers = providers;
  writeConfigFile(fileConfig);

  ok({ id, name: newProvider.name, baseUrl, message: `Provider "${id}" added successfully` });
}

async function actionRemove(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  const id = parsed.positional[1];
  if (!id) fail("Provider ID is required. Usage: jeriko provider remove <id>");

  if (isDaemonRunning()) {
    const { sendRequest } = await import("../../../daemon/api/socket.js");
    const response = await sendRequest("providers.remove", { id });
    if (!response.ok) fail(response.error ?? "Failed to remove provider");
    ok(response.data);
  }

  // Direct mode
  const fileConfig = readConfigFile();
  const providers = (fileConfig.providers as ProviderConfig[] | undefined) ?? [];

  const idx = providers.findIndex((p) => p.id === id);
  if (idx === -1) fail(`Provider "${id}" not found`);

  providers.splice(idx, 1);
  fileConfig.providers = providers;
  writeConfigFile(fileConfig);

  ok({ id, removed: true, message: `Provider "${id}" removed` });
}

async function actionTest(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  const id = parsed.positional[1];
  if (!id) fail("Provider ID is required. Usage: jeriko provider test <id>");

  const config = loadConfig();
  const provider = config.providers?.find((p) => p.id === id);

  if (!provider) {
    fail(`Provider "${id}" not found. Use 'jeriko provider list' to see available providers.`);
  }

  // Resolve env ref in API key
  let resolvedKey = provider.apiKey;
  const envMatch = resolvedKey.match(/^\{env:(\w+)\}$/);
  if (envMatch) {
    resolvedKey = process.env[envMatch[1]!] ?? "";
    if (!resolvedKey) {
      fail(`Environment variable ${envMatch[1]} is not set`);
    }
  }

  const modelsUrl = `${provider.baseUrl.replace(/\/$/, "")}/models`;
  const start = Date.now();

  try {
    const resp = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${resolvedKey}`,
        ...(provider.headers ?? {}),
      },
      signal: AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      fail(`API returned HTTP ${resp.status}: ${resp.statusText}`, 2);
    }

    const data = await resp.json() as { data?: Array<{ id: string }> };
    const modelCount = Array.isArray(data.data) ? data.data.length : 0;

    ok({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      status: "connected",
      latencyMs,
      modelCount,
      message: `Connected to ${provider.name} (${latencyMs}ms, ${modelCount} models available)`,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    fail(`Connection to ${provider.name} failed after ${latencyMs}ms: ${message}`, 2);
  }
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export const command: CommandHandler = {
  name: "provider",
  description: "Manage custom LLM providers",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help") || parsed.positional.length === 0) {
      printHelp();
    }

    const action = parsed.positional[0];

    switch (action) {
      case "list":
        return actionList();
      case "add":
        return actionAdd(parsed);
      case "remove":
        return actionRemove(parsed);
      case "test":
        return actionTest(parsed);
      default:
        fail(`Unknown action: "${action}". Run 'jeriko provider --help' for usage.`);
    }
  },
};
