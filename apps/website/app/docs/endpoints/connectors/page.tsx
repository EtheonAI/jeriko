import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { ParamTable } from "../../components/param-table";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Connector Endpoints | Jeriko API",
  description: "Connector management and invocation endpoints.",
};

export default function ConnectorsPage() {
  return (
    <article>
      <h1>Connectors</h1>
      <p>
        Connectors are integrations with external services (GitHub, Stripe,
        Google Drive, etc.). They can use OAuth or API keys for authentication.
        The daemon caches health checks for 30 seconds.
      </p>

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/connector"
        description="List all connectors with health status."
        auth
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl http://127.0.0.1:3000/connector \\
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
      "name": "github",
      "type": "oauth",
      "status": "healthy",
      "connected": true
    },
    {
      "name": "stripe",
      "type": "api_key",
      "status": "healthy",
      "connected": true
    }
  ]
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/connector/:name"
        description="Get the status of a specific connector."
        auth
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "name": "github",
    "type": "oauth",
    "status": "healthy",
    "connected": true,
    "scopes": ["repo", "user"]
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/connector/:name/call"
        description="Execute a method on a connector."
        auth
      />
      <ParamTable
        params={[
          { name: "method", type: "string", required: true, description: "Method path (e.g. \"charges.list\", \"repos.list\")" },
          { name: "params", type: "object", required: false, description: "Method parameters" },
        ]}
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl -X POST http://127.0.0.1:3000/connector/stripe/call \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"method": "charges.list", "params": {"limit": 5}}'`,
          },
          {
            label: "JavaScript",
            code: `const res = await fetch("http://127.0.0.1:3000/connector/stripe/call", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    method: "charges.list",
    params: { limit: 5 },
  }),
});`,
          },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "result": [...]
  }
}`}
      />
    </article>
  );
}
