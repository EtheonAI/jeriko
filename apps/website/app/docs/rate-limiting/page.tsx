import type { Metadata } from "next";
import { CodeBlock } from "../components/code-block";

export const metadata: Metadata = {
  title: "Rate Limiting | Jeriko API",
  description: "Rate limiting behavior and headers in the Jeriko API.",
};

export default function RateLimitingPage() {
  return (
    <article>
      <h1>Rate Limiting</h1>
      <p>
        The API uses a token-bucket rate limiter. Each client gets a bucket of
        tokens that refills linearly over the window period. Requests that exceed
        the limit receive HTTP <code>429 Too Many Requests</code>.
      </p>

      <h2>Default Limits</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Max requests per window</td><td>100</td></tr>
          <tr><td>Window duration</td><td>60 seconds</td></tr>
          <tr><td>Refill rate</td><td>~1.67 requests/second</td></tr>
        </tbody>
      </table>

      <h2>Response Headers</h2>
      <p>Every response includes rate limit headers:</p>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Header</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>X-RateLimit-Limit</code></td><td>Maximum requests per window</td></tr>
          <tr><td><code>X-RateLimit-Remaining</code></td><td>Tokens remaining in current window</td></tr>
          <tr><td><code>X-RateLimit-Reset</code></td><td>Unix timestamp when the window resets</td></tr>
          <tr><td><code>Retry-After</code></td><td>Seconds to wait (only on 429 responses)</td></tr>
        </tbody>
      </table>

      <h2>429 Response</h2>
      <CodeBlock
        tabs={[
          {
            label: "Response",
            code: `HTTP/1.1 429 Too Many Requests
Retry-After: 3
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0

{
  "ok": false,
  "error": "Too many requests",
  "retry_after_seconds": 3
}`,
          },
        ]}
      />

      <h2>Retry Strategy</h2>
      <p>
        When you receive a 429, wait for the number of seconds in the{" "}
        <code>Retry-After</code> header before retrying. Exponential backoff is
        recommended for burst scenarios:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "JavaScript",
            code: `async function fetchWithRetry(url, opts, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, opts);
    if (res.status !== 429) return res;

    const retryAfter = Number(res.headers.get("Retry-After") ?? 1);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
  }
  throw new Error("Rate limit exceeded after retries");
}`,
          },
          {
            label: "Python",
            code: `import time, requests

def fetch_with_retry(url, **kwargs):
    for attempt in range(3):
        res = requests.request(**kwargs, url=url)
        if res.status_code != 429:
            return res
        retry_after = int(res.headers.get("Retry-After", 1))
        time.sleep(retry_after)
    raise Exception("Rate limit exceeded after retries")`,
          },
        ]}
      />
    </article>
  );
}
