export default function SupportPage() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back to Jeriko</a>

      <h1>Support</h1>
      <p className="effective">
        Get help with Jeriko installation, configuration, and usage.
      </p>

      <section>
        <h2>Contact Support</h2>
        <p>
          For support inquiries, bug reports, or feature requests, reach out
          through any of the following channels:
        </p>
        <ul>
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:support@jeriko.ai">support@jeriko.ai</a> — we
            typically respond within 24 hours on business days.
          </li>
          <li>
            <strong>GitHub Issues:</strong>{" "}
            <a
              href="https://github.com/etheonai/jeriko/issues"
              target="_blank"
              rel="noreferrer"
            >
              github.com/etheonai/jeriko/issues
            </a>{" "}
            — for bug reports and feature requests.
          </li>
        </ul>
      </section>

      <section>
        <h2>Documentation</h2>
        <p>
          Comprehensive documentation is available for all Jeriko features:
        </p>
        <ul>
          <li>
            <a href="/docs/installation">Installation Guide</a> — get started
            with a one-command install on macOS or Linux.
          </li>
          <li>
            <a href="/docs">API Documentation</a> — full HTTP API reference for
            the Jeriko daemon.
          </li>
          <li>
            <a href="/docs/endpoints/agent">Agent API</a> — send messages,
            manage sessions, and control the AI agent.
          </li>
          <li>
            <a href="/docs/endpoints/connectors">Connectors API</a> — connect
            and manage third-party integrations.
          </li>
        </ul>
      </section>

      <section>
        <h2>Common Issues</h2>

        <h3>Installation</h3>
        <p>
          If you encounter issues during installation, ensure you have macOS
          12+ or a supported Linux distribution. Run{" "}
          <code>jeriko doctor</code> to diagnose common problems.
        </p>

        <h3>API Key Configuration</h3>
        <p>
          Jeriko requires an AI provider API key (OpenAI, Anthropic, or a
          local model). Run <code>jeriko init</code> to configure your
          provider interactively.
        </p>

        <h3>Connector Issues</h3>
        <p>
          If a connector fails to connect, run{" "}
          <code>jeriko connector health stripe</code> to check the connection
          status. For OAuth connectors, try disconnecting and reconnecting.
        </p>

        <h3>Stripe Integration</h3>
        <p>
          For Stripe-specific issues, visit the{" "}
          <a href="/integrations/stripe">Stripe integration page</a> or run{" "}
          <code>jeriko connect stripe</code> to re-authorize.
        </p>
      </section>

      <section>
        <h2>System Requirements</h2>
        <ul>
          <li>macOS 12+ (Apple Silicon or Intel) or Linux (x86_64)</li>
          <li>4 GB RAM minimum</li>
          <li>100 MB disk space</li>
          <li>Internet connection for AI providers and OAuth connectors</li>
        </ul>
      </section>
    </main>
  );
}
