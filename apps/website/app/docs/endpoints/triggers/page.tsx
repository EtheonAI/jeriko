import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { ParamTable } from "../../components/param-table";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Trigger Endpoints | Jeriko API",
  description: "Trigger CRUD, toggle, and manual fire endpoints.",
};

const createParams = [
  { name: "type", type: "string", required: true, description: "Trigger type: cron, webhook, file, http, or email" },
  { name: "config", type: "object", required: true, description: "Type-specific configuration (see below)" },
  { name: "action", type: "object", required: true, description: "Action to execute: { type: \"shell\"|\"agent\", command?, prompt?, notify? }" },
  { name: "label", type: "string", required: false, description: "Human-readable display name" },
  { name: "enabled", type: "boolean", required: false, description: "Start enabled (default: true)" },
  { name: "max_runs", type: "number", required: false, description: "Auto-disable after N fires (0 = unlimited)" },
];

export default function TriggersPage() {
  return (
    <article>
      <h1>Triggers</h1>
      <p>
        Triggers are automated event handlers. They fire on cron schedules,
        inbound webhooks, file changes, HTTP polling, or incoming email. Each
        trigger executes a shell command or an agent prompt when it fires.
      </p>

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/triggers"
        description="List all triggers, optionally filtered by type or enabled state."
        auth
      />
      <ParamTable
        params={[
          { name: "type", type: "string", required: false, description: "Filter by type (query param)" },
          { name: "enabled", type: "boolean", required: false, description: "Filter by enabled state (query param)" },
        ]}
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl "http://127.0.0.1:3000/triggers?type=cron&enabled=true" \\
  -H "Authorization: Bearer $TOKEN"`,
          },
        ]}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/triggers/:id"
        description="Get a single trigger by ID. Webhook triggers include the computed webhook_url."
        auth
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/triggers"
        description="Create a new trigger."
        auth
      />
      <ParamTable params={createParams} />

      <h3>Config by Type</h3>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Config Fields</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>cron</code></td>
            <td><code>expression</code> (cron string), <code>timezone?</code></td>
          </tr>
          <tr>
            <td><code>webhook</code></td>
            <td><code>service?</code> (stripe, github, paypal, twilio), <code>secret?</code> (HMAC key)</td>
          </tr>
          <tr>
            <td><code>file</code></td>
            <td><code>paths</code> (string[]), <code>events?</code> (create, modify, delete), <code>debounceMs?</code></td>
          </tr>
          <tr>
            <td><code>http</code></td>
            <td><code>url</code>, <code>method?</code>, <code>headers?</code>, <code>intervalMs?</code>, <code>jqFilter?</code></td>
          </tr>
          <tr>
            <td><code>email</code></td>
            <td><code>connector?</code> (gmail, outlook), <code>user?</code>, <code>intervalMs?</code></td>
          </tr>
        </tbody>
      </table>

      <CodeBlock
        tabs={[
          {
            label: "curl — Cron",
            code: `curl -X POST http://127.0.0.1:3000/triggers \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "cron",
    "config": { "expression": "0 9 * * MON", "timezone": "America/New_York" },
    "action": { "type": "agent", "prompt": "Summarize my week" },
    "label": "Weekly summary"
  }'`,
          },
          {
            label: "curl — Webhook",
            code: `curl -X POST http://127.0.0.1:3000/triggers \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "webhook",
    "config": { "service": "github", "secret": "whsec_..." },
    "action": { "type": "shell", "command": "jeriko github hook" },
    "label": "GitHub events"
  }'`,
          },
        ]}
      />
      <Response
        status={201}
        body={`{
  "ok": true,
  "data": {
    "id": "a1b2c3d4",
    "type": "cron",
    "enabled": true,
    "label": "Weekly summary",
    "run_count": 0,
    "created_at": "2026-03-03T12:00:00Z"
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="PUT"
        path="/triggers/:id"
        description="Update an existing trigger (partial update)."
        auth
      />
      <ParamTable
        params={[
          { name: "config", type: "object", required: false, description: "Updated type-specific config" },
          { name: "action", type: "object", required: false, description: "Updated action" },
          { name: "label", type: "string", required: false, description: "Updated label" },
          { name: "enabled", type: "boolean", required: false, description: "Enable or disable" },
          { name: "max_runs", type: "number", required: false, description: "Updated max runs" },
        ]}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="DELETE"
        path="/triggers/:id"
        description="Delete a trigger permanently."
        auth
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "id": "a1b2c3d4",
    "status": "deleted"
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/triggers/:id/toggle"
        description="Toggle a trigger between enabled and disabled."
        auth
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/triggers/:id/fire"
        description="Manually fire a trigger for testing."
        auth
      />
      <ParamTable
        params={[
          { name: "payload", type: "any", required: false, description: "Optional test payload" },
        ]}
      />

      <h2>Auto-Disable</h2>
      <p>
        Triggers auto-disable after <strong>5 consecutive errors</strong> or
        when <code>max_runs</code> is reached. Disabled triggers can be
        re-enabled via the toggle endpoint.
      </p>
    </article>
  );
}
