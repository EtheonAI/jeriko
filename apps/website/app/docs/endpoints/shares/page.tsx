import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { ParamTable } from "../../components/param-table";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Share Endpoints | Jeriko API",
  description: "Session sharing and public link endpoints.",
};

export default function SharesPage() {
  return (
    <article>
      <h1>Shares</h1>
      <p>
        Share endpoints let you create public links to session snapshots.
        Shared sessions are accessible without authentication at{" "}
        <code>/s/:id</code> and can optionally expire.
      </p>

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/share"
        description="Create a shareable link for a session snapshot."
        auth
      />
      <ParamTable
        params={[
          { name: "session_id", type: "string", required: true, description: "Session to share" },
          { name: "expires_in_ms", type: "number | null", required: false, description: "Expiration in milliseconds (null = no expiry)" },
        ]}
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl -X POST http://127.0.0.1:7741/share \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"session_id": "a1b2c3d4", "expires_in_ms": 86400000}'`,
          },
          {
            label: "JavaScript",
            code: `const res = await fetch("http://127.0.0.1:7741/share", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    session_id: "a1b2c3d4",
    expires_in_ms: 86400000,  // 24 hours
  }),
});
const { data } = await res.json();
console.log("Share URL:", data.url);`,
          },
          {
            label: "Python",
            code: `import os, requests

res = requests.post(
    "http://127.0.0.1:7741/share",
    headers={"Authorization": f"Bearer {os.environ['NODE_AUTH_SECRET']}"},
    json={"session_id": "a1b2c3d4", "expires_in_ms": 86400000},
)
share = res.json()["data"]
print(f"Share URL: {share['url']}")`,
          },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "share_id": "Xk9mQ2pL",
    "url": "http://127.0.0.1:7741/s/Xk9mQ2pL",
    "title": "GitHub issue summary",
    "model": "claude-sonnet-4-20250514",
    "message_count": 8,
    "created_at": "2026-03-03T12:00:00Z",
    "expires_at": "2026-03-04T12:00:00Z"
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/share"
        description="List all shared sessions."
        auth
      />
      <ParamTable
        params={[
          { name: "session_id", type: "string", required: false, description: "Filter by source session (query param)" },
          { name: "limit", type: "number", required: false, description: "Results per page (default 50)" },
        ]}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/share/:id"
        description="Get share metadata (JSON)."
        auth
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="DELETE"
        path="/share/:id"
        description="Revoke a shared link."
        auth
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "share_id": "Xk9mQ2pL",
    "status": "revoked"
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/s/:id"
        description="Public page — renders a styled HTML view of the shared conversation."
      />
      <p>
        This endpoint renders an HTML page, not JSON. It checks expiration and
        revocation before serving. Share IDs use 48 bits of entropy from{" "}
        <code>crypto.randomBytes</code>, making them unguessable.
      </p>
    </article>
  );
}
