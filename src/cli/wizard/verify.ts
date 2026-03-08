/**
 * Provider verification — lightweight pings to validate API keys and services.
 *
 * Each provider has a specific verification endpoint. We make a minimal
 * request and check for auth errors (401/403). Non-auth errors (rate limit,
 * server error, network timeout) are treated as "probably valid" since the
 * key format is correct and the provider is reachable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerifyEndpoint {
  url: string;
  method: "GET" | "POST";
  headers: (apiKey: string) => Record<string, string>;
  body?: (apiKey: string) => string;
  /** HTTP status codes that indicate an invalid key. Default: [401]. */
  invalidStatuses?: number[];
}

// ---------------------------------------------------------------------------
// Provider verification endpoints
// ---------------------------------------------------------------------------

const VERIFY_ENDPOINTS: Record<string, VerifyEndpoint> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    method: "POST",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    }),
    body: () => JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  groq: {
    url: "https://api.groq.com/openai/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  deepseek: {
    url: "https://api.deepseek.com/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    method: "GET",
    headers: () => ({}),
    // Google Gemini uses API key as query param, handled in verifyApiKey
  },
  xai: {
    url: "https://api.x.ai/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  mistral: {
    url: "https://api.mistral.ai/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  together: {
    url: "https://api.together.xyz/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  fireworks: {
    url: "https://api.fireworks.ai/inference/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  deepinfra: {
    url: "https://api.deepinfra.com/v1/openai/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  perplexity: {
    url: "https://api.perplexity.ai/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  cohere: {
    url: "https://api.cohere.com/v2/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  "github-models": {
    url: "https://models.github.ai/inference/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  nvidia: {
    url: "https://integrate.api.nvidia.com/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  nebius: {
    url: "https://api.tokenfactory.nebius.com/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  huggingface: {
    url: "https://router.huggingface.co/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  requesty: {
    url: "https://router.requesty.ai/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  helicone: {
    url: "https://ai-gateway.helicone.ai/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  alibaba: {
    url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  siliconflow: {
    url: "https://api.siliconflow.com/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  novita: {
    url: "https://api.novita.ai/openai/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  sambanova: {
    url: "https://api.sambanova.ai/v1/models",
    method: "GET",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
};

// ---------------------------------------------------------------------------
// API key verification
// ---------------------------------------------------------------------------

/**
 * Verify an API key works by making a lightweight API call.
 *
 * Returns true if the key appears valid:
 *   - 200/2xx = valid
 *   - 401/403 = invalid key
 *   - Other errors (429, 5xx, network) = assume valid (key format OK, provider issue)
 *
 * @param provider  Provider ID (e.g. "anthropic", "openai", "groq")
 * @param apiKey    The API key to verify
 * @param timeoutMs Request timeout in milliseconds (default: 10s)
 */
export async function verifyApiKey(
  provider: string,
  apiKey: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  // Local providers don't need verification
  if (provider === "local" || provider === "lmstudio") return true;

  const endpoint = VERIFY_ENDPOINTS[provider];
  if (!endpoint) {
    // Unknown provider — can't verify, assume OK
    return true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Google Gemini uses API key as query param
    let url = endpoint.url;
    if (provider === "google") {
      url = `${endpoint.url}?key=${encodeURIComponent(apiKey)}`;
    }

    const fetchOpts: RequestInit = {
      method: endpoint.method,
      headers: endpoint.headers(apiKey),
      signal: controller.signal,
    };

    if (endpoint.body) {
      fetchOpts.body = endpoint.body(apiKey);
    }

    const res = await fetch(url, fetchOpts);

    const invalidStatuses = endpoint.invalidStatuses ?? [401, 403];
    return !invalidStatuses.includes(res.status);
  } catch {
    // Network error, timeout, etc. — can't verify, assume OK
    return true;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Local server defaults
// ---------------------------------------------------------------------------

/** Default Ollama API port (configurable via OLLAMA_HOST env). */
const OLLAMA_BASE_URL = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

/** Default LM Studio API URL (override via LMSTUDIO_HOST env). */
const LMSTUDIO_BASE_URL = process.env.LMSTUDIO_HOST ?? "http://127.0.0.1:1234";

/** Timeout for local service health checks (ms). */
const LOCAL_CHECK_TIMEOUT_MS = 3_000;

/** Timeout for local model list fetches (ms). */
const LOCAL_LIST_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Ollama
// ---------------------------------------------------------------------------

/**
 * Check if Ollama is running and reachable.
 * @param baseUrl  Override the Ollama API URL (default: OLLAMA_HOST env or 127.0.0.1:11434)
 */
export async function verifyOllamaRunning(baseUrl?: string): Promise<boolean> {
  const url = baseUrl ?? OLLAMA_BASE_URL;
  try {
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(LOCAL_CHECK_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch the list of installed Ollama models from the local API.
 * Returns model name strings (e.g. ["llama3:latest", "deepseek-coder:6.7b"]).
 * @param baseUrl  Override the Ollama API URL (default: OLLAMA_HOST env or 127.0.0.1:11434)
 */
export async function fetchOllamaModelList(baseUrl?: string): Promise<string[]> {
  const url = baseUrl ?? OLLAMA_BASE_URL;
  try {
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(LOCAL_LIST_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      models?: Array<{ name?: string }>;
    };

    if (!Array.isArray(data.models)) return [];

    return data.models
      .map((m) => m.name ?? "")
      .filter((name) => name.length > 0);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// LM Studio
// ---------------------------------------------------------------------------

/**
 * Check if LM Studio is running.
 * @param baseUrl  Override the LM Studio API URL (default: LMSTUDIO_HOST env or 127.0.0.1:1234)
 */
export async function verifyLMStudioRunning(baseUrl?: string): Promise<boolean> {
  const url = baseUrl ?? LMSTUDIO_BASE_URL;
  try {
    const res = await fetch(`${url}/v1/models`, {
      signal: AbortSignal.timeout(LOCAL_CHECK_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
