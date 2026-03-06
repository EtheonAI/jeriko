import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { ParamTable } from "../../components/param-table";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Scheduler Endpoints | Jeriko API",
  description: "Schedule recurring tasks using the Triggers API with cron triggers.",
};

export default function SchedulerPage() {
  return (
    <article>
      <h1>Scheduler</h1>
      <p>
        Jeriko does not have separate <code>/scheduler</code> routes. All
        scheduling is handled by the{" "}
        <a href="/docs/endpoints/triggers">Triggers API</a> using triggers with{" "}
        <code>type: &quot;cron&quot;</code>. This page shows the common
        scheduling workflows using trigger endpoints.
      </p>

      <h2>Create a Scheduled Task</h2>
      <p>
        Create a cron trigger via <code>POST /triggers</code> with{" "}
        <code>type: &quot;cron&quot;</code> and a cron expression in the config.
      </p>

      <Endpoint
        method="POST"
        path="/triggers"
        description="Create a cron trigger to schedule a recurring task."
        auth
      />
      <ParamTable
        params={[
          { name: "type", type: "string", required: true, description: "Must be \"cron\"" },
          { name: "config", type: "object", required: true, description: "{ expression: \"cron string\", timezone?: \"IANA timezone\" }" },
          { name: "action", type: "object", required: true, description: "{ type: \"shell\"|\"agent\", command?, prompt?, notify? }" },
          { name: "label", type: "string", required: false, description: "Human-readable name for the task" },
          { name: "enabled", type: "boolean", required: false, description: "Start enabled (default: true)" },
          { name: "max_runs", type: "number", required: false, description: "Auto-disable after N fires (0 = unlimited)" },
        ]}
      />
      <CodeBlock
        tabs={[
          {
            label: "curl — Shell action",
            code: `curl -X POST http://127.0.0.1:3000/triggers \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "cron",
    "config": { "expression": "0 2 * * *" },
    "action": { "type": "shell", "command": "jeriko backup create" },
    "label": "Daily backup"
  }'`,
          },
          {
            label: "curl — Agent action",
            code: `curl -X POST http://127.0.0.1:3000/triggers \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "cron",
    "config": {
      "expression": "0 9 * * MON",
      "timezone": "America/New_York"
    },
    "action": { "type": "agent", "prompt": "Summarize my week" },
    "label": "Weekly summary"
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

      <h2>List Scheduled Tasks</h2>
      <p>
        Filter triggers by <code>type=cron</code> to list only scheduled tasks.
      </p>

      <Endpoint
        method="GET"
        path="/triggers?type=cron"
        description="List all cron triggers (scheduled tasks)."
        auth
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl "http://127.0.0.1:3000/triggers?type=cron" \\
  -H "Authorization: Bearer $TOKEN"`,
          },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": [
    {
      "id": "a1b2c3d4",
      "type": "cron",
      "label": "Weekly summary",
      "config": {
        "expression": "0 9 * * MON",
        "timezone": "America/New_York"
      },
      "enabled": true,
      "run_count": 12,
      "last_fired": "2026-02-24T14:00:00Z"
    }
  ]
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <h2>Enable / Disable</h2>
      <p>
        Toggle a scheduled task on or off without deleting it.
      </p>

      <Endpoint
        method="POST"
        path="/triggers/:id/toggle"
        description="Toggle a cron trigger between enabled and disabled."
        auth
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl -X POST http://127.0.0.1:3000/triggers/a1b2c3d4/toggle \\
  -H "Authorization: Bearer $TOKEN"`,
          },
        ]}
      />

      {/* ----------------------------------------------------------------- */}

      <h2>Remove a Scheduled Task</h2>

      <Endpoint
        method="DELETE"
        path="/triggers/:id"
        description="Permanently delete a cron trigger."
        auth
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl -X DELETE http://127.0.0.1:3000/triggers/a1b2c3d4 \\
  -H "Authorization: Bearer $TOKEN"`,
          },
        ]}
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

      <h2>Cron Expression Reference</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Expression</th>
            <th>Schedule</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>* * * * *</code></td>
            <td>Every minute</td>
          </tr>
          <tr>
            <td><code>0 * * * *</code></td>
            <td>Every hour</td>
          </tr>
          <tr>
            <td><code>0 9 * * *</code></td>
            <td>Daily at 9:00 AM</td>
          </tr>
          <tr>
            <td><code>0 9 * * MON</code></td>
            <td>Every Monday at 9:00 AM</td>
          </tr>
          <tr>
            <td><code>0 0 1 * *</code></td>
            <td>First day of every month</td>
          </tr>
        </tbody>
      </table>

      <p>
        For the full trigger API including webhook, file, HTTP, and email
        triggers, see the{" "}
        <a href="/docs/endpoints/triggers">Triggers documentation</a>.
      </p>
    </article>
  );
}
