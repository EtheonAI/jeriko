import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { ParamTable } from "../../components/param-table";
import { CodeBlock } from "../../components/code-block";
import { Response } from "../../components/response";

export const metadata: Metadata = {
  title: "Billing Endpoints | Jeriko API",
  description: "Billing plan, checkout, portal, and event endpoints for the Jeriko API.",
};

export default function BillingPage() {
  return (
    <article>
      <h1>Billing</h1>
      <p>
        The billing endpoints manage subscription tiers, Stripe Checkout
        sessions, customer portal access, and billing event audit trails. All
        endpoints except the webhook require authentication.
      </p>

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/billing/plan"
        description="Returns the current billing tier, feature limits, and usage counts."
        auth
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl http://127.0.0.1:3000/billing/plan \\
  -H "Authorization: Bearer $TOKEN"`,
          },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "tier": "free",
    "limits": {
      "connectors": 2,
      "triggers": 3
    },
    "usage": {
      "connectors": 1,
      "triggers": 2
    }
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/billing/checkout"
        description="Creates a Stripe Checkout session and returns a redirect URL."
        auth
      />
      <ParamTable
        params={[
          { name: "email", type: "string", required: false, description: "Customer email for the checkout session" },
          { name: "client_ip", type: "string", required: false, description: "Client IP address for tax calculation" },
          { name: "user_agent", type: "string", required: false, description: "Client user agent string" },
        ]}
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl -X POST http://127.0.0.1:3000/billing/checkout \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com"
  }'`,
          },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "url": "https://checkout.stripe.com/c/pay/cs_live_..."
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/billing/portal"
        description="Creates a Stripe Customer Portal session for managing the subscription."
        auth
      />
      <ParamTable
        params={[
          { name: "customer_id", type: "string", required: true, description: "Stripe customer ID" },
        ]}
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl -X POST http://127.0.0.1:3000/billing/portal \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer_id": "cus_..."
  }'`,
          },
        ]}
      />
      <Response
        status={200}
        body={`{
  "ok": true,
  "data": {
    "url": "https://billing.stripe.com/p/session/..."
  }
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/billing/events"
        description="Returns an audit trail of billing events."
        auth
      />
      <ParamTable
        params={[
          { name: "limit", type: "number", required: false, description: "Max events to return (query param)" },
          { name: "type", type: "string", required: false, description: "Filter by event type (query param)" },
          { name: "include_payload", type: "boolean", required: false, description: "Include raw Stripe payload (query param)" },
        ]}
      />
      <CodeBlock
        tabs={[
          {
            label: "curl",
            code: `curl "http://127.0.0.1:3000/billing/events?limit=10&type=checkout.session.completed" \\
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
      "id": 1,
      "type": "checkout.session.completed",
      "stripe_event_id": "evt_...",
      "created_at": "2026-03-01T12:00:00Z"
    }
  ]
}`}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="POST"
        path="/billing/webhook"
        description="Stripe webhook endpoint. Verified via Stripe signature header, not Bearer auth."
      />
      <p>
        This endpoint is called by Stripe to deliver subscription lifecycle
        events (checkout completed, invoice paid, subscription updated/deleted).
        It verifies the <code>Stripe-Signature</code> header against your
        configured webhook secret. No Bearer token is required.
      </p>

      <h2>Tiers</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Connectors</th>
            <th>Triggers</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>free</code></td>
            <td>2</td>
            <td>3</td>
          </tr>
          <tr>
            <td><code>pro</code></td>
            <td>10</td>
            <td>Unlimited</td>
          </tr>
          <tr>
            <td><code>team</code></td>
            <td>Unlimited</td>
            <td>Unlimited</td>
          </tr>
          <tr>
            <td><code>enterprise</code></td>
            <td>Unlimited</td>
            <td>Unlimited</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
