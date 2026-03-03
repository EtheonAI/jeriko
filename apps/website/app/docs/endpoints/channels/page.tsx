import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Channel Endpoints | Jeriko API",
  description: "Channel management endpoints for Telegram, WhatsApp, and more.",
};

export default function ChannelsPage() {
  return (
    <article>
      <h1>Channels</h1>
      <p>
        Channels are messaging integrations (Telegram, WhatsApp) that the daemon
        manages. Use these endpoints to list, connect, and disconnect channels.
      </p>

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/channel"
        description="List all registered channels with their connection status."
        auth
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl http://127.0.0.1:3000/channel \\
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
      "name": "telegram",
      "status": "connected",
      "connected_at": "2026-03-03T10:00:00Z"
    },
    {
      "name": "whatsapp",
      "status": "disconnected"
    }
  ]
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/channel/:name/connect"
        description="Connect a channel by name."
        auth
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl -X POST http://127.0.0.1:3000/channel/telegram/connect \\
  -H "Authorization: Bearer $TOKEN"`,
          },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "name": "telegram",
    "status": "connected",
    "connected_at": "2026-03-03T12:00:00Z"
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/channel/:name/disconnect"
        description="Disconnect a channel by name."
        auth
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "name": "telegram",
    "status": "disconnected"
  }
}`}
      />
    </article>
  );
}
