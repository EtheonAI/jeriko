/**
 * API key and provider verification — lightweight pings to validate setup.
 */

/**
 * Verify an API key works by making a lightweight API call.
 * Returns true if the key is valid, false otherwise.
 */
export async function verifyApiKey(provider: string, apiKey: string): Promise<boolean> {
  const timeout = 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: controller.signal,
      });
      // 200 = valid, 401 = invalid key, other = treat as valid (rate limit, etc.)
      return res.status !== 401;
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      return res.status !== 401;
    }

    // Local models don't need API key verification
    return true;
  } catch {
    // Network error — can't verify, assume key is OK
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check if Ollama is running and reachable at localhost:11434.
 * Returns true if Ollama responds, false otherwise.
 */
export async function verifyOllamaRunning(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);

  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
