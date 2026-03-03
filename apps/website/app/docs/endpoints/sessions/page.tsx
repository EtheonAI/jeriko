import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { ParamTable } from "../../components/param-table";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Session Endpoints | Jeriko API",
  description: "Session management endpoints for the Jeriko API.",
};

export default function SessionsPage() {
  return (
    <article>
      <h1>Sessions</h1>
      <p>
        Sessions represent conversations between the user and the agent. Each
        session tracks its messages, model, and status.
      </p>

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/session"
        description="List all sessions with pagination."
        auth
      />
      <ParamTable
        params={[
          { name: "archived", type: "boolean", required: false, description: "Include archived sessions (query param)" },
          { name: "limit", type: "number", required: false, description: "Results per page (default 50, max 200)" },
          { name: "offset", type: "number", required: false, description: "Pagination offset (default 0)" },
        ]}
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl "http://127.0.0.1:3000/session?limit=10&offset=0" \\
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
      "model": "claude-sonnet-4-20250514",
      "title": "GitHub issue summary",
      "status": "active",
      "created_at": "2026-03-03T10:00:00Z",
      "message_count": 8
    }
  ]
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/session/:id"
        description="Get a single session with all its messages."
        auth
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "session": {
      "id": "a1b2c3d4",
      "model": "claude-sonnet-4-20250514",
      "title": "GitHub issue summary",
      "status": "active"
    },
    "messages": [
      { "role": "user", "content": "Summarize my issues" },
      { "role": "assistant", "content": "You have 3 open issues..." }
    ]
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/session/:id/resume"
        description="Resume an archived session (unarchive and mark active)."
        auth
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "session_id": "a1b2c3d4",
    "status": "resumed"
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="DELETE"
        path="/session/:id"
        description="Archive a session (soft delete)."
        auth
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "session_id": "a1b2c3d4",
    "status": "archived"
  }
}`}
      />
    </article>
  );
}
