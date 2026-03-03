import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { ParamTable } from "../../components/param-table";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Scheduler Endpoints | Jeriko API",
  description: "Cron scheduler facade endpoints for the Jeriko API.",
};

export default function SchedulerPage() {
  return (
    <article>
      <h1>Scheduler</h1>
      <p>
        The scheduler is a convenience facade over the trigger engine for
        cron-only tasks. It provides a simplified interface for creating and
        managing scheduled jobs.
      </p>

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/scheduler"
        description="List all scheduled tasks (cron triggers)."
        auth
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl http://127.0.0.1:3000/scheduler \\
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
      "label": "Weekly summary",
      "schedule": "0 9 * * MON",
      "timezone": "America/New_York",
      "enabled": true,
      "run_count": 12,
      "last_fired": "2026-02-24T14:00:00Z"
    }
  ]
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/scheduler/:id"
        description="Get a single scheduled task."
        auth
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/scheduler"
        description="Create a new scheduled task."
        auth
      />
      <ParamTable
        params={[
          { name: "label", type: "string", required: true, description: "Task name" },
          { name: "schedule", type: "string", required: true, description: "Cron expression (e.g. \"0 9 * * MON\")" },
          { name: "timezone", type: "string", required: false, description: "IANA timezone (e.g. \"America/New_York\")" },
          { name: "action", type: "object", required: false, description: "Shell or agent action" },
          { name: "enabled", type: "boolean", required: false, description: "Start enabled (default: true)" },
        ]}
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl -X POST http://127.0.0.1:3000/scheduler \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "label": "Daily backup",
    "schedule": "0 2 * * *",
    "action": {
      "type": "shell",
      "command": "jeriko backup create"
    }
  }'`,
          },
        ]}
      />
      <Response
        status={201}
        body={`{
  "ok": true,
  "data": {
    "id": "e5f6g7h8",
    "label": "Daily backup",
    "schedule": "0 2 * * *",
    "enabled": true,
    "run_count": 0
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="DELETE"
        path="/scheduler/:id"
        description="Delete a scheduled task."
        auth
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "id": "e5f6g7h8",
    "status": "removed"
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/scheduler/:id/toggle"
        description="Enable or disable a scheduled task."
        auth
      />
    </article>
  );
}
