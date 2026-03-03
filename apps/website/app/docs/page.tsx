import type { Metadata } from "next";
import { CodeBlock } from "./components/code-block";

export const metadata: Metadata = {
  title: "API Overview | Jeriko",
  description: "Get started with the Jeriko daemon API.",
};

export default function DocsOverview() {
  return (
    <article>
      <h1>Jeriko API</h1>
      <p>
        The Jeriko daemon exposes an HTTP API, WebSocket endpoint, and Unix
        socket for inter-process communication. All endpoints return JSON with a
        consistent <code>{"{ ok, data, error }"}</code> envelope.
      </p>

      <h2>Base URL</h2>
      <p>
        The daemon listens on <code>127.0.0.1:3000</code> by default. The port
        is configurable via the <code>JERIKO_PORT</code> environment variable or
        the <code>port</code> field in your config.
      </p>

      <h2>Quick Start</h2>
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `# Check daemon health
curl http://127.0.0.1:3000/health

# Send a message to the agent
curl -X POST http://127.0.0.1:3000/agent/chat \\
  -H "Authorization: Bearer $JERIKO_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "What time is it?"}'`,
          },
          {
            label: "JavaScript",
            code: `const res = await fetch("http://127.0.0.1:3000/agent/chat", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.JERIKO_TOKEN}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "What time is it?" }),
});

const { ok, data, error } = await res.json();`,
          },
          {
            label: "Python",
            code: `import os, requests

res = requests.post(
    "http://127.0.0.1:3000/agent/chat",
    headers={
        "Authorization": f"Bearer {os.environ['JERIKO_TOKEN']}",
        "Content-Type": "application/json",
    },
    json={"message": "What time is it?"},
)

data = res.json()`,
          },
        ]}
      />

      <h2>Response Format</h2>
      <p>
        Every endpoint returns a JSON object with an <code>ok</code> boolean.
        On success, the result is in <code>data</code>. On failure,{" "}
        <code>error</code> contains a human-readable message and{" "}
        <code>code</code> contains a numeric status code.
      </p>

      <CodeBlock
        tabs={[
          {
            label: "Success",
            code: `{
  "ok": true,
  "data": {
    "response": "The current time is 3:42 PM.",
    "tokensIn": 128,
    "tokensOut": 24,
    "sessionId": "abc123"
  }
}`,
          },
          {
            label: "Error",
            code: `{
  "ok": false,
  "error": "Missing Authorization header",
  "code": 401
}`,
          },
        ]}
      />

      <h2>Endpoints</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Group</th>
            <th>Base Path</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Health</td><td><code>/health</code></td><td>Daemon status and uptime</td></tr>
          <tr><td>Agent</td><td><code>/agent</code></td><td>Chat, streaming, session spawning</td></tr>
          <tr><td>Sessions</td><td><code>/session</code></td><td>Session CRUD and history</td></tr>
          <tr><td>Channels</td><td><code>/channel</code></td><td>Telegram, WhatsApp management</td></tr>
          <tr><td>Connectors</td><td><code>/connector</code></td><td>OAuth and API key integrations</td></tr>
          <tr><td>Triggers</td><td><code>/triggers</code></td><td>Cron, webhook, file, HTTP, email</td></tr>
          <tr><td>Scheduler</td><td><code>/scheduler</code></td><td>Cron task facade</td></tr>
          <tr><td>Shares</td><td><code>/share</code></td><td>Shareable session links</td></tr>
          <tr><td>Webhooks</td><td><code>/hooks</code></td><td>Inbound webhook receiver</td></tr>
          <tr><td>OAuth</td><td><code>/oauth</code></td><td>OAuth authorization flow</td></tr>
        </tbody>
      </table>
    </article>
  );
}
