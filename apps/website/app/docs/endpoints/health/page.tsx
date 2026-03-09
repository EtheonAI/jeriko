import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Health Endpoint | Jeriko API",
  description: "Health check endpoint for the Jeriko daemon.",
};

export default function HealthPage() {
  return (
    <article>
      <h1>Health</h1>
      <p>
        The health endpoint provides daemon status information. It requires no
        authentication and is designed for load balancers, monitoring, and the{" "}
        <code>jeriko health</code> CLI command.
      </p>

      <Endpoint
        method="GET"
        path="/health"
        description="Returns daemon status, runtime, uptime, and memory usage."
      />

      <h3>Example</h3>
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl http://127.0.0.1:7741/health`,
          },
          {
            label: "JavaScript",
            code: `const res = await fetch("http://127.0.0.1:7741/health");
const { data } = await res.json();
console.log(\`Status: \${data.status}, Uptime: \${data.uptime_human}\`);`,
          },
          {
            label: "Python",
            code: `import requests

res = requests.get("http://127.0.0.1:7741/health")
data = res.json()["data"]
print(f"Status: {data['status']}, Uptime: {data['uptime_human']}")`,
          },
        ]}
      />

      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "status": "healthy",
    "version": "2.0.0",
    "node": "v22.0.0",
    "runtime": "bun",
    "uptime_seconds": 3600,
    "uptime_human": "1h 0m 0s",
    "memory": {
      "rss_mb": 48,
      "heap_mb": 24
    },
    "timestamp": "2026-03-03T12:00:00.000Z"
  }
}`}
      />
    </article>
  );
}
