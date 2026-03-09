import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Webhook Endpoints | Jeriko API",
  description: "Inbound webhook receiver for external services.",
};

export default function WebhooksPage() {
  return (
    <article>
      <h1>Webhooks</h1>
      <p>
        The webhook endpoint receives events from external services like Stripe,
        GitHub, PayPal, and Twilio. Each webhook trigger has a unique URL that
        external services post to.
      </p>

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/hooks/:triggerId"
        description="Receive an external webhook event. No Bearer auth required — verified by signature."
      />

      <h2>Verification Flow</h2>
      <ol>
        <li>
          <strong>Connector dispatch</strong> &mdash; If the trigger has a{" "}
          <code>service</code> field and the connector is available, the webhook
          is dispatched to the connector for service-specific signature
          verification and rich event parsing.
        </li>
        <li>
          <strong>Built-in verification</strong> &mdash; If no connector is
          available, the built-in verifier checks the HMAC signature using the
          trigger&rsquo;s <code>secret</code>.
        </li>
        <li>
          <strong>No secret</strong> &mdash; If no secret is configured, the
          webhook fires but a warning is logged for audit purposes.
        </li>
      </ol>

      <h2>Supported Services</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Signature Header</th>
            <th>Verification</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Stripe</td><td><code>Stripe-Signature</code></td><td>HMAC-SHA256 with timestamp</td></tr>
          <tr><td>GitHub</td><td><code>X-Hub-Signature-256</code></td><td>HMAC-SHA256</td></tr>
          <tr><td>PayPal</td><td>PayPal headers</td><td>PayPal webhook verification API</td></tr>
          <tr><td>Twilio</td><td><code>X-Twilio-Signature</code></td><td>HMAC-SHA1</td></tr>
          <tr><td>Generic</td><td><code>X-Signature</code></td><td>HMAC-SHA256</td></tr>
        </tbody>
      </table>

      <h2>Setting Up a Webhook</h2>
      <CodeBlock
        tabs={[
          {
            label: "1. Create trigger",
            code: `curl -X POST http://127.0.0.1:7741/triggers \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "webhook",
    "config": {
      "service": "github",
      "secret": "your-webhook-secret"
    },
    "action": {
      "type": "shell",
      "command": "jeriko github hook"
    },
    "label": "GitHub push events"
  }'`,
          },
          {
            label: "2. Register URL",
            code: `# The trigger response includes the webhook URL:
# https://bot.jeriko.ai/hooks/<trigger-id>
#
# Add this URL in your service's webhook settings:
# - GitHub: Settings → Webhooks → Add webhook
# - Stripe: Dashboard → Developers → Webhooks
# - PayPal: Developer → My Apps → Webhooks`,
          },
        ]}
      />

      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "trigger_id": "4eae23a1"
  }
}`}
      />

      <h2>Failed Verification</h2>
      <p>
        If signature verification fails, the endpoint returns{" "}
        <code>200 OK</code> with the trigger ID but does not fire the action.
        This prevents external services from retrying indefinitely.
      </p>
    </article>
  );
}
