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
            code: `curl http://127.0.0.1:7741/channel \\
  -H "Authorization: Bearer $TOKEN"`,
          },
          {
            label: "JavaScript",
            code: `const res = await fetch("http://127.0.0.1:7741/channel", {
  headers: { "Authorization": \`Bearer \${token}\` },
});
const { data } = await res.json();
for (const [name, ch] of Object.entries(data)) {
  console.log(\`\${name}: \${ch.connected ? "connected" : "disconnected"}\`);
}`,
          },
          {
            label: "Python",
            code: `import os, requests

res = requests.get(
    "http://127.0.0.1:7741/channel",
    headers={"Authorization": f"Bearer {os.environ['NODE_AUTH_SECRET']}"},
)
channels = res.json()["data"]
for name, ch in channels.items():
    print(f"{name}: {'connected' if ch['connected'] else 'disconnected'}")`,
          },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "telegram": {
      "id": "telegram",
      "name": "telegram",
      "label": "Telegram",
      "connected": true,
      "qr_pending": false,
      "info": "Bot @mybot connected"
    },
    "whatsapp": {
      "id": "whatsapp",
      "name": "whatsapp",
      "label": "WhatsApp",
      "connected": false,
      "qr_pending": false,
      "info": null
    }
  }
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
            code: `curl -X POST http://127.0.0.1:7741/channel/telegram/connect \\
  -H "Authorization: Bearer $TOKEN"`,
          },
          {
            label: "JavaScript",
            code: `const res = await fetch("http://127.0.0.1:7741/channel/telegram/connect", {
  method: "POST",
  headers: { "Authorization": \`Bearer \${token}\` },
});
const { data } = await res.json();`,
          },
          {
            label: "Python",
            code: `import os, requests

res = requests.post(
    "http://127.0.0.1:7741/channel/telegram/connect",
    headers={"Authorization": f"Bearer {os.environ['NODE_AUTH_SECRET']}"},
)`,
          },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "id": "telegram",
    "name": "telegram",
    "label": "Telegram",
    "connected": true,
    "qr_pending": false,
    "info": "Bot @mybot connected"
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
    "id": "telegram",
    "name": "telegram",
    "label": "Telegram",
    "connected": false,
    "qr_pending": false,
    "info": null
  }
}`}
      />
    </article>
  );
}
