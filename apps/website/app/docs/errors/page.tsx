import type { Metadata } from "next";
import { CodeBlock } from "../components/code-block";

export const metadata: Metadata = {
  title: "Errors | Jeriko API",
  description: "Error format and status codes in the Jeriko API.",
};

export default function ErrorsPage() {
  return (
    <article>
      <h1>Errors</h1>
      <p>
        All errors return a JSON body with <code>ok: false</code> and a
        human-readable <code>error</code> message. Stack traces are never
        exposed.
      </p>

      <h2>Error Format</h2>
      <CodeBlock
        tabs={[
          {
            label: "JSON",
            code: `{
  "ok": false,
  "error": "Human-readable error message"
}`,
          },
        ]}
      />

      <h2>HTTP Status Codes</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Meaning</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>200</code></td><td>OK</td><td>Successful request</td></tr>
          <tr><td><code>201</code></td><td>Created</td><td>Resource created (triggers, shares)</td></tr>
          <tr><td><code>400</code></td><td>Bad Request</td><td>Missing or invalid parameters</td></tr>
          <tr><td><code>401</code></td><td>Unauthorized</td><td>Missing Authorization header</td></tr>
          <tr><td><code>403</code></td><td>Forbidden</td><td>Invalid token</td></tr>
          <tr><td><code>404</code></td><td>Not Found</td><td>Resource or endpoint not found</td></tr>
          <tr><td><code>429</code></td><td>Too Many Requests</td><td>Rate limit exceeded</td></tr>
          <tr><td><code>500</code></td><td>Internal Server Error</td><td>Unhandled error</td></tr>
          <tr><td><code>503</code></td><td>Service Unavailable</td><td>Auth secret not configured</td></tr>
        </tbody>
      </table>

      <h2>CLI Exit Codes</h2>
      <p>
        When interacting via the CLI, commands use numeric exit codes that map to
        error categories:
      </p>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Exit Code</th>
            <th>Name</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>0</code></td><td>SUCCESS</td><td>Command completed successfully</td></tr>
          <tr><td><code>1</code></td><td>GENERAL</td><td>General error</td></tr>
          <tr><td><code>2</code></td><td>NETWORK</td><td>Network or connectivity failure</td></tr>
          <tr><td><code>3</code></td><td>AUTH</td><td>Authentication error</td></tr>
          <tr><td><code>5</code></td><td>NOT_FOUND</td><td>Resource not found</td></tr>
          <tr><td><code>7</code></td><td>TIMEOUT</td><td>Operation timed out</td></tr>
        </tbody>
      </table>
    </article>
  );
}
