import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { ParamTable } from "../../components/param-table";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Agent Endpoints | Jeriko API",
  description: "Agent chat, streaming, and session endpoints.",
};

const chatParams = [
  { name: "message", type: "string", required: true, description: "The message to send to the agent" },
  { name: "session_id", type: "string", required: false, description: "Resume an existing session" },
  { name: "model", type: "string", required: false, description: "Override the LLM model" },
  { name: "system", type: "string", required: false, description: "Override the system prompt" },
  { name: "max_tokens", type: "number", required: false, description: "Token generation limit" },
  { name: "tools", type: "string[]", required: false, description: "Tool IDs to enable for this request" },
];

export default function AgentPage() {
  return (
    <article>
      <h1>Agent</h1>
      <p>
        The agent endpoints let you send messages to the AI agent and receive
        responses. You can use the synchronous chat endpoint or the streaming
        endpoint for real-time events.
      </p>

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/agent/chat"
        description="Send a message and receive a complete response."
        auth
      />
      <ParamTable params={chatParams} />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl -X POST http://127.0.0.1:3000/agent/chat \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Summarize my open GitHub issues"}'`,
          },
          {
            label: "JavaScript",
            code: `const res = await fetch("http://127.0.0.1:3000/agent/chat", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    message: "Summarize my open GitHub issues",
  }),
});
const { data } = await res.json();
console.log(data.response);`,
          },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "response": "You have 3 open issues...",
    "tokensIn": 256,
    "tokensOut": 128,
    "sessionId": "a1b2c3d4"
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/agent/stream"
        description="Send a message and stream agent events via Server-Sent Events."
        auth
      />
      <ParamTable params={chatParams} />
      <p>
        The response is a <code>text/event-stream</code>. Each event has a{" "}
        <code>type</code> field:
      </p>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Event Type</th>
            <th>Data Fields</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>text_delta</code></td><td><code>content</code></td><td>Streaming text chunk</td></tr>
          <tr><td><code>tool_call</code></td><td><code>id</code>, <code>name</code>, <code>arguments</code></td><td>Agent invoking a tool</td></tr>
          <tr><td><code>tool_result</code></td><td><code>toolCallId</code>, <code>result</code>, <code>isError</code></td><td>Tool execution result</td></tr>
          <tr><td><code>thinking</code></td><td><code>content</code></td><td>Extended thinking output</td></tr>
          <tr><td><code>turn_complete</code></td><td><code>tokensIn</code>, <code>tokensOut</code></td><td>Agent finished its turn</td></tr>
          <tr><td><code>done</code></td><td><code>sessionId</code></td><td>Stream complete</td></tr>
          <tr><td><code>error</code></td><td><code>message</code></td><td>Error occurred</td></tr>
        </tbody>
      </table>
      <CodeBlock
        tabs={[
          {
            label: "JavaScript",
            code: `const res = await fetch("http://127.0.0.1:3000/agent/stream", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "Hello" }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const event = JSON.parse(line.slice(6));
      if (event.type === "text_delta") {
        process.stdout.write(event.content);
      }
    }
  }
}`,
          },
        ]}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/agent/list"
        description="List all active agent sessions."
        auth
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": [
    {
      "id": "a1b2c3d4",
      "model": "claude-sonnet-4-20250514",
      "status": "active",
      "created_at": "2026-03-03T10:00:00Z",
      "message_count": 12
    }
  ]
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/agent/spawn"
        description="Spawn a new agent session with an initial prompt."
        auth
      />
      <ParamTable
        params={[
          { name: "prompt", type: "string", required: true, description: "Initial prompt for the new session" },
          { name: "model", type: "string", required: false, description: "LLM model override" },
          { name: "tools", type: "string[]", required: false, description: "Tool IDs to enable" },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "session_id": "e5f6g7h8"
  }
}`}
      />
    </article>
  );
}
