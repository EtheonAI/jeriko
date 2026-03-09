import type { Metadata } from "next";
import { Endpoint } from "../../components/endpoint";
import { CodeBlock } from "../../components/code-block";

export const metadata: Metadata = {
  title: "OAuth Endpoints | Jeriko API",
  description: "OAuth authorization flow for connectors.",
};

export default function OAuthPage() {
  return (
    <article>
      <h1>OAuth</h1>
      <p>
        The OAuth endpoints handle the authorization code flow for connecting
        external services. They are not called directly by API clients &mdash;
        they are used by the <code>jeriko connect</code> CLI command and channel
        commands to authorize connectors.
      </p>

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/oauth/:provider/start"
        description="Redirect to the OAuth provider's consent page."
      />
      <p>
        The <code>state</code> query parameter is required. It contains a
        cryptographically random token (256 bits) that expires after 10 minutes
        and is single-use for CSRF protection.
      </p>
      <CodeBlock
        tabs={[
          {
            label: "Flow",
            code: `# 1. CLI generates state token and opens browser
jeriko connect github

# 2. Browser redirects to:
# GET /oauth/github/start?state=<random-token>
# → 302 redirect to GitHub authorization page

# 3. User approves, GitHub redirects back to:
# GET /oauth/github/callback?code=<auth-code>&state=<token>

# 4. Daemon exchanges code for access token
# 5. Connector is now authenticated`,
          },
        ]}
      />

      {/* ----------------------------------------------------------------- */}

      <Endpoint
        method="GET"
        path="/oauth/:provider/callback"
        description="OAuth callback — exchanges authorization code for access token."
      />
      <p>
        On success, renders an HTML page confirming the connection and sends a
        notification to the originating chat. On failure, renders an error page.
      </p>

      <h2>Supported Providers</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Type</th>
            <th>Scopes</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>GitHub</td><td>OAuth</td><td>repo, user, notifications</td></tr>
          <tr><td>X (Twitter)</td><td>OAuth + PKCE</td><td>tweet.read, users.read</td></tr>
          <tr><td>Google Drive</td><td>OAuth</td><td>drive.file</td></tr>
          <tr><td>OneDrive</td><td>OAuth</td><td>Files.ReadWrite</td></tr>
          <tr><td>Gmail</td><td>OAuth</td><td>gmail.readonly, gmail.send</td></tr>
          <tr><td>Outlook</td><td>OAuth</td><td>Mail.ReadWrite, Mail.Send</td></tr>
          <tr><td>Vercel</td><td>OAuth</td><td>user, deployments</td></tr>
          <tr><td>HubSpot</td><td>OAuth</td><td>crm.objects.contacts.read, crm.objects.deals.read</td></tr>
          <tr><td>Shopify</td><td>OAuth</td><td>read_products, read_orders</td></tr>
          <tr><td>Instagram</td><td>OAuth</td><td>instagram_basic, pages_show_list</td></tr>
          <tr><td>Threads</td><td>OAuth</td><td>threads_basic, threads_content_publish</td></tr>
        </tbody>
      </table>

      <h2>Security</h2>
      <ul>
        <li>State tokens are single-use and expire after 10 minutes</li>
        <li>X/Twitter uses PKCE (Proof Key for Code Exchange) for additional security</li>
        <li>Secrets are never logged or exposed in error responses</li>
        <li>Tokens are stored securely in the daemon&rsquo;s credential store</li>
      </ul>
    </article>
  );
}
