import type { Metadata } from "next";
import { CodeBlock } from "../components/code-block";
import { PLATFORMS } from "../../../lib/install";

export const metadata: Metadata = {
  title: "Quickstart | Jeriko",
  description: "Get up and running with Jeriko in under a minute.",
};

export default function QuickstartPage() {
  return (
    <article>
      <h1>Quickstart</h1>
      <p>
        From zero to running AI agent in four steps.
      </p>

      <h2>1. Install</h2>
      <p>
        Run the one-liner for your platform.
        See <a href="/docs/installation">Installation</a> for all options.
      </p>
      <CodeBlock
        tabs={PLATFORMS.map((p) => ({ label: p.label, code: p.command }))}
      />

      <h2>2. Setup</h2>
      <p>
        The wizard walks you through provider keys, channels, and connectors:
      </p>
      <CodeBlock tabs={[{ label: "Shell", code: "jeriko init" }]} />

      <h2>3. Start Chatting</h2>
      <p>
        Launch the interactive terminal UI:
      </p>
      <CodeBlock tabs={[{ label: "Shell", code: "jeriko" }]} />

      <h2>4. Run Commands</h2>
      <p>
        Jeriko commands work standalone or piped together:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "System",
            code: `jeriko sys --format text
jeriko health`,
          },
          {
            label: "AI Agent",
            code: `jeriko ask "summarize my last 5 commits"
jeriko ask "find large files in this repo"`,
          },
          {
            label: "Daemon",
            code: `jeriko server start
jeriko server status
jeriko server stop`,
          },
        ]}
      />

      <h2>5. Start the Daemon</h2>
      <p>
        The daemon enables channels (Telegram, WhatsApp), triggers, and the HTTP API:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "Shell",
            code: `# Start in background
jeriko server start

# Check status
jeriko health --format text`,
          },
        ]}
      />

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs">API Reference</a> — full HTTP and WebSocket documentation</li>
        <li><a href="/docs/authentication">Authentication</a> — securing your daemon</li>
        <li>
          <a href="https://github.com/etheonai/jeriko" target="_blank" rel="noreferrer">
            GitHub
          </a>{" "}
          — source code and issue tracker
        </li>
      </ul>
    </article>
  );
}
