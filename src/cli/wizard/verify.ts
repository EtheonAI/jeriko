/**
 * API key verification — lightweight ping to validate credentials.
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

    // Local models don't need verification
    return true;
  } catch {
    // Network error — can't verify, assume key is OK
    return true;
  } finally {
    clearTimeout(timer);
  }
}
