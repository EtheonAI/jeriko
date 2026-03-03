import type { Metadata } from "next";
import { CodeBlock } from "../components/code-block";

export const metadata: Metadata = {
  title: "WebSocket Protocol | Jeriko API",
  description: "WebSocket protocol, authentication, and message types for the Jeriko API.",
};

export default function WebSocketPage() {
  return (
    <article>
      <h1>WebSocket Protocol</h1>
      <p>
        The daemon accepts WebSocket connections at <code>/ws</code> for
        real-time, bidirectional communication. Remote agents connect via
        WebSocket to send messages and receive streaming events.
      </p>

      <h2>Connecting</h2>
      <CodeBlock
        tabs={[
          {
            label: "JavaScript",
            code: `const ws = new WebSocket("ws://127.0.0.1:3000/ws");

ws.onopen = () => {
  // First message must be an auth message
  ws.send(JSON.stringify({
    type: "auth",
    token: process.env.JERIKO_TOKEN,
    name: "my-agent",  // optional display name
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg.type, msg);
};`,
          },
          {
            label: "Python",
            code: `import json, os, websockets, asyncio

async def connect():
    async with websockets.connect("ws://127.0.0.1:3000/ws") as ws:
        await ws.send(json.dumps({
            "type": "auth",
            "token": os.environ["JERIKO_TOKEN"],
            "name": "my-agent",
        }))

        async for message in ws:
            msg = json.loads(message)
            print(msg["type"], msg)

asyncio.run(connect())`,
          },
        ]}
      />

      <h2>Authentication</h2>
      <p>
        The first message after connecting <strong>must</strong> be an{" "}
        <code>auth</code> message. Until authenticated, only <code>auth</code>{" "}
        and <code>ping</code> messages are accepted.
      </p>
      <p>
        After <strong>3 failed auth attempts</strong>, the connection is closed
        with code <code>1008</code>.
      </p>

      <h2>Inbound Messages (Client &rarr; Server)</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Fields</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>auth</code></td>
            <td><code>token</code>, <code>name?</code></td>
            <td>Authenticate with Bearer token</td>
          </tr>
          <tr>
            <td><code>chat</code></td>
            <td><code>message</code>, <code>sessionId?</code></td>
            <td>Send a message to the agent</td>
          </tr>
          <tr>
            <td><code>ping</code></td>
            <td>&mdash;</td>
            <td>Keep-alive ping</td>
          </tr>
          <tr>
            <td><code>tool_result</code></td>
            <td><code>toolCallId</code>, <code>content</code>, <code>isError?</code></td>
            <td>Return result of a tool call</td>
          </tr>
        </tbody>
      </table>

      <h2>Outbound Messages (Server &rarr; Client)</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Fields</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>auth_ok</code></td>
            <td><code>agentId</code></td>
            <td>Authentication succeeded</td>
          </tr>
          <tr>
            <td><code>auth_fail</code></td>
            <td><code>error</code></td>
            <td>Authentication failed</td>
          </tr>
          <tr>
            <td><code>text_delta</code></td>
            <td><code>content</code></td>
            <td>Streaming text chunk from agent</td>
          </tr>
          <tr>
            <td><code>tool_call</code></td>
            <td><code>id</code>, <code>name</code>, <code>arguments</code></td>
            <td>Agent wants to call a tool</td>
          </tr>
          <tr>
            <td><code>turn_complete</code></td>
            <td><code>tokensIn</code>, <code>tokensOut</code></td>
            <td>Agent finished its turn</td>
          </tr>
          <tr>
            <td><code>error</code></td>
            <td><code>message</code></td>
            <td>Error occurred</td>
          </tr>
          <tr>
            <td><code>pong</code></td>
            <td>&mdash;</td>
            <td>Response to ping</td>
          </tr>
        </tbody>
      </table>

      <h2>Connection Lifecycle</h2>
      <ol>
        <li>Client opens WebSocket to <code>ws://host:port/ws</code></li>
        <li>Server assigns a unique <code>agentId</code></li>
        <li>Client sends <code>auth</code> message with token</li>
        <li>Server responds with <code>auth_ok</code> or <code>auth_fail</code></li>
        <li>Client sends <code>chat</code> messages, receives streaming events</li>
        <li>Either side can close the connection at any time</li>
      </ol>

      <h2>Close Codes</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>1000</code></td><td>Normal disconnection</td></tr>
          <tr><td><code>1008</code></td><td>Too many failed auth attempts</td></tr>
        </tbody>
      </table>
    </article>
  );
}
