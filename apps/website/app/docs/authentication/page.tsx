import type { Metadata } from "next";
import { CodeBlock } from "../components/code-block";

export const metadata: Metadata = {
  title: "Authentication | Jeriko API",
  description: "How to authenticate with the Jeriko daemon API.",
};

export default function AuthenticationPage() {
  return (
    <article>
      <h1>Authentication</h1>
      <p>
        The Jeriko daemon uses Bearer token authentication. The token is the
        value of the <code>NODE_AUTH_SECRET</code> environment variable set when
        the daemon starts.
      </p>

      <h2>Getting Your Token</h2>
      <p>
        When you run <code>jeriko init</code>, a cryptographically random token
        is generated and stored in your config. You can retrieve it with:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "Shell",
            code: `# Print your auth token
jeriko config get NODE_AUTH_SECRET

# Or read it from the environment
echo $NODE_AUTH_SECRET`,
          },
        ]}
      />

      <h2>Using the Token</h2>
      <p>
        Include the token in the <code>Authorization</code> header with the{" "}
        <code>Bearer</code> prefix:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl http://127.0.0.1:7741/agent/chat \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "hello"}'`,
          },
          {
            label: "JavaScript",
            code: `fetch("http://127.0.0.1:7741/agent/chat", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "hello" }),
});`,
          },
          {
            label: "Python",
            code: `requests.post(
    "http://127.0.0.1:7741/agent/chat",
    headers={"Authorization": f"Bearer {token}"},
    json={"message": "hello"},
)`,
          },
        ]}
      />

      <h2>Unauthenticated Endpoints</h2>
      <p>The following endpoints do not require authentication:</p>
      <ul>
        <li><code>GET /health</code> &mdash; health check</li>
        <li><code>POST /hooks/:triggerId</code> &mdash; inbound webhooks (verified by signature)</li>
        <li><code>GET /oauth/:provider/*</code> &mdash; OAuth flow</li>
        <li><code>GET /callback</code> &mdash; legacy OAuth callback</li>
        <li><code>GET /s/:id</code> &mdash; public shared sessions</li>
        <li><code>POST /billing/webhook</code> &mdash; Stripe webhooks (verified by signature)</li>
      </ul>

      <h2>Error Responses</h2>
      <p>Authentication failures return standard JSON errors:</p>
      <CodeBlock
        tabs={[
          {
            label: "401 — Missing Header",
            code: `{
  "ok": false,
  "error": "Missing Authorization header"
}`,
          },
          {
            label: "403 — Invalid Token",
            code: `{
  "ok": false,
  "error": "Invalid authorization token"
}`,
          },
          {
            label: "503 — Not Configured",
            code: `{
  "ok": false,
  "error": "Server authentication is not configured"
}`,
          },
        ]}
      />

      <h2>Security Notes</h2>
      <ul>
        <li>Tokens are compared using timing-safe comparison to prevent enumeration attacks.</li>
        <li>WebSocket connections also require auth via the first message (see <a href="/docs/websocket">WebSocket</a>).</li>
        <li>The daemon binds to <code>127.0.0.1</code> by default &mdash; not accessible from the network.</li>
      </ul>
    </article>
  );
}
