# Phase 3: Integrations + Triggers

**Duration:** Week 5-6
**Depends on:** Phase 2 complete
**Goal:** Inline integration setup, OAuth flows, webhook relay, trigger management, autonomous background execution.

---

## Objectives

1. Inline integration detection — detect missing integrations from AI tool calls
2. API key integration flow — inline setup for Stripe, GitHub, Vercel, PayPal, Twilio
3. OAuth integration flow — browser-based auth for Google Drive, OneDrive, X
4. Protocol handler — `jeriko://` catches OAuth callbacks
5. Email integration — IMAP/SMTP credential setup inline
6. Webhook relay client — persistent WebSocket to relay.jeriko.dev
7. Trigger engine — start/stop from Electron main process
8. Trigger creation through prompt — natural language → trigger
9. Trigger notifications — OS notifications + in-app "while you were away"
10. Settings: integration and trigger management panels
11. Credential lifecycle — store, rotate, revoke, backup, import

---

## Integration Detection

### How It Works

The AI (via router.js) already knows about integrations. When it tries to use Stripe and there's no `STRIPE_SECRET_KEY` in env, the tool call fails. Currently this returns an error string.

For the terminal, we intercept this pattern in the engine wrapper:

```typescript
// src/main/engine.ts

function wrapRoute(route: Function, credentials: CredentialStore) {
  return async function(text: string, onChunk: Function, onStatus: Function, history: any[]) {

    // Wrap onStatus to intercept integration-missing errors
    const wrappedOnStatus = (status: any) => {
      if (status.type === 'tool_result' && isIntegrationMissing(status.result)) {
        const integration = detectMissingIntegration(status.result);
        onStatus({
          type: 'integration_required',
          integration: integration.name,
          authType: integration.authType,
          setupUrl: integration.setupUrl,
          envKey: integration.envKey,
        });
        return;  // Don't forward the raw error
      }
      onStatus(status);
    };

    return route(text, onChunk, wrappedOnStatus, history);
  };
}

function isIntegrationMissing(result: string): boolean {
  const patterns = [
    /STRIPE_SECRET_KEY.*not set/i,
    /ANTHROPIC_API_KEY.*not set/i,
    /GITHUB_TOKEN.*not set/i,
    /GOOGLE_DRIVE.*not connected/i,
    /VERCEL_TOKEN.*not set/i,
    /TWILIO.*not configured/i,
    /PAYPAL.*not configured/i,
    /IMAP.*not configured/i,
    /SMTP.*not configured/i,
  ];
  return patterns.some((p) => p.test(result));
}

function detectMissingIntegration(result: string): IntegrationInfo {
  // Map error patterns to integration metadata
  if (/stripe/i.test(result)) return {
    name: 'Stripe',
    authType: 'api_key',
    setupUrl: 'https://dashboard.stripe.com/apikeys',
    envKey: 'STRIPE_SECRET_KEY',
    placeholder: 'sk-live-...',
    credentialKey: 'stripe_secret_key',
  };
  // ... similar for each integration
}
```

### Integration Registry

```typescript
// src/shared/integrations.ts

export const INTEGRATIONS: Record<string, IntegrationConfig> = {
  stripe: {
    name: 'Stripe',
    authType: 'api_key',
    setupUrl: 'https://dashboard.stripe.com/apikeys',
    envKeys: ['STRIPE_SECRET_KEY'],
    credentialKeys: ['stripe_secret_key'],
    placeholder: 'sk-live-...',
    description: 'Manage invoices, payments, customers, subscriptions',
    icon: 'stripe',
  },
  github: {
    name: 'GitHub',
    authType: 'api_key',
    setupUrl: 'https://github.com/settings/tokens',
    envKeys: ['GITHUB_TOKEN'],
    credentialKeys: ['github_token'],
    placeholder: 'ghp_...',
    description: 'Repos, issues, pull requests, actions',
    icon: 'github',
  },
  vercel: {
    name: 'Vercel',
    authType: 'api_key',
    setupUrl: 'https://vercel.com/account/tokens',
    envKeys: ['VERCEL_TOKEN'],
    credentialKeys: ['vercel_token'],
    placeholder: '',
    description: 'Deploy, manage projects, domains',
    icon: 'vercel',
  },
  twilio: {
    name: 'Twilio',
    authType: 'multi_key',
    setupUrl: 'https://console.twilio.com',
    envKeys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    credentialKeys: ['twilio_account_sid', 'twilio_auth_token', 'twilio_phone_number'],
    fields: [
      { key: 'twilio_account_sid', label: 'Account SID', placeholder: 'AC...' },
      { key: 'twilio_auth_token', label: 'Auth Token', placeholder: '' },
      { key: 'twilio_phone_number', label: 'Phone Number', placeholder: '+1...' },
    ],
    description: 'SMS, calls, phone numbers',
    icon: 'twilio',
  },
  paypal: {
    name: 'PayPal',
    authType: 'multi_key',
    setupUrl: 'https://developer.paypal.com/dashboard/applications',
    envKeys: ['PAYPAL_CLIENT_ID', 'PAYPAL_SECRET'],
    credentialKeys: ['paypal_client_id', 'paypal_secret'],
    fields: [
      { key: 'paypal_client_id', label: 'Client ID', placeholder: '' },
      { key: 'paypal_secret', label: 'Secret', placeholder: '' },
    ],
    description: 'Transactions, balances, payouts',
    icon: 'paypal',
  },
  google_drive: {
    name: 'Google Drive',
    authType: 'oauth',
    oauthProvider: 'google',
    envKeys: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN'],
    credentialKeys: ['google_drive_client_id', 'google_drive_client_secret', 'google_drive_tokens'],
    description: 'Files, search, upload, download',
    icon: 'gdrive',
  },
  onedrive: {
    name: 'OneDrive',
    authType: 'oauth',
    oauthProvider: 'microsoft',
    envKeys: ['ONEDRIVE_CLIENT_ID', 'ONEDRIVE_REFRESH_TOKEN'],
    credentialKeys: ['onedrive_client_id', 'onedrive_tokens'],
    description: 'Files, search, upload, download',
    icon: 'onedrive',
  },
  x: {
    name: 'X (Twitter)',
    authType: 'oauth',
    oauthProvider: 'x',
    envKeys: ['X_BEARER_TOKEN', 'X_CLIENT_ID', 'X_CLIENT_SECRET'],
    credentialKeys: ['x_tokens'],
    description: 'Post tweets, read timeline',
    icon: 'x',
  },
  email: {
    name: 'Email',
    authType: 'multi_key',
    setupUrl: null,
    envKeys: ['IMAP_HOST', 'IMAP_PORT', 'IMAP_USER', 'IMAP_PASSWORD', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'],
    credentialKeys: ['email_imap_host', 'email_imap_port', 'email_imap_user', 'email_imap_password', 'email_smtp_host', 'email_smtp_port', 'email_smtp_user', 'email_smtp_password', 'email_smtp_from'],
    fields: [
      { key: 'email_imap_host', label: 'IMAP Server', placeholder: 'imap.gmail.com' },
      { key: 'email_imap_user', label: 'Email Address', placeholder: 'you@gmail.com' },
      { key: 'email_imap_password', label: 'Password / App Password', placeholder: '' },
      { key: 'email_smtp_host', label: 'SMTP Server', placeholder: 'smtp.gmail.com' },
    ],
    description: 'Send and receive email',
    icon: 'email',
  },
};
```

---

## Inline Integration Setup — API Key Type

### Renderer Component

```tsx
// src/renderer/components/output/IntegrationSetup.tsx

function IntegrationSetup({ integration, onConnected, onCancel }) {
  const config = INTEGRATIONS[integration];
  const [values, setValues] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  async function handleConnect() {
    setConnecting(true);
    setError('');

    try {
      // Store each credential
      for (const field of config.fields || [{ key: config.credentialKeys[0], label: 'API Key' }]) {
        await window.api.storeCredential(field.key, values[field.key]);
      }

      // Notify engine to reload env vars with new credentials
      await window.api.setSetting(`integrations.${integration}.connected`, true);

      onConnected();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  if (config.authType === 'oauth') {
    return <OAuthSetup integration={integration} config={config} onConnected={onConnected} onCancel={onCancel} />;
  }

  return (
    <div className="card integration-setup">
      <div className="card-header warning">
        {config.name} isn't connected yet.
      </div>
      <div className="integration-body">
        {config.setupUrl && (
          <p className="dim">
            Get your credentials at: <a href={config.setupUrl} onClick={openExternal}>{config.setupUrl}</a>
          </p>
        )}

        {(config.fields || [{ key: config.credentialKeys[0], label: 'API Key', placeholder: config.placeholder }]).map((field) => (
          <div key={field.key} className="input-group">
            <label>{field.label}:</label>
            <input
              type="password"
              value={values[field.key] || ''}
              onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
              placeholder={field.placeholder}
            />
          </div>
        ))}

        <p className="dim">Your credentials are encrypted and stored locally.</p>

        {error && <p className="error">{error}</p>}

        <div className="integration-actions">
          <button className="button-primary" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
          <button className="button-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

---

## OAuth Flow

### Protocol Handler Setup

```typescript
// src/main/protocol.ts
import { app, BrowserWindow, shell } from 'electron';

const pendingOAuth = new Map<string, { state: string; resolve: Function; reject: Function }>();

export function setupProtocolHandler(mainWindow: BrowserWindow) {
  // macOS: app is already running, URL comes via event
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleOAuthCallback(url, mainWindow);
  });

  // Windows/Linux: URL comes via second instance
  app.on('second-instance', (event, argv) => {
    const url = argv.find((arg) => arg.startsWith('jeriko://'));
    if (url) handleOAuthCallback(url, mainWindow);
    mainWindow.show();
    mainWindow.focus();
  });
}

function handleOAuthCallback(url: string, mainWindow: BrowserWindow) {
  const parsed = new URL(url);
  // jeriko://oauth/{provider}/callback?code=XXX&state=YYY

  const pathParts = parsed.pathname.split('/').filter(Boolean);
  // ['oauth', 'google', 'callback']
  const provider = pathParts[1];
  const code = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  const error = parsed.searchParams.get('error');

  const pending = pendingOAuth.get(provider);
  if (!pending || pending.state !== state) {
    mainWindow.webContents.send('oauth:callback', provider, {
      success: false,
      error: 'Invalid OAuth state. Please try again.',
    });
    return;
  }

  if (error) {
    pending.reject(new Error(error));
    mainWindow.webContents.send('oauth:callback', provider, { success: false, error });
  } else {
    // Exchange code for tokens
    exchangeCodeForTokens(provider, code!)
      .then((tokens) => {
        pending.resolve(tokens);
        mainWindow.webContents.send('oauth:callback', provider, { success: true, provider });
      })
      .catch((err) => {
        pending.reject(err);
        mainWindow.webContents.send('oauth:callback', provider, { success: false, error: err.message });
      });
  }

  pendingOAuth.delete(provider);
}

export async function startOAuth(provider: string): Promise<any> {
  const config = getOAuthConfig(provider);
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL(config.authorizationUrl);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', `jeriko://oauth/${provider}/callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scope);
  authUrl.searchParams.set('state', state);
  if (config.accessType) authUrl.searchParams.set('access_type', config.accessType);

  return new Promise((resolve, reject) => {
    pendingOAuth.set(provider, { state, resolve, reject });

    // Open browser
    shell.openExternal(authUrl.toString());

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingOAuth.has(provider)) {
        pendingOAuth.delete(provider);
        reject(new Error('OAuth timed out. Please try again.'));
      }
    }, 300000);
  });
}
```

### OAuth Provider Configs

```typescript
function getOAuthConfig(provider: string): OAuthConfig {
  switch (provider) {
    case 'google':
      return {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: credentials.get('google_drive_client_id') || BUILTIN_GOOGLE_CLIENT_ID,
        clientSecret: credentials.get('google_drive_client_secret') || BUILTIN_GOOGLE_CLIENT_SECRET,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        accessType: 'offline',
      };

    case 'microsoft':
      return {
        authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        clientId: credentials.get('onedrive_client_id') || BUILTIN_MICROSOFT_CLIENT_ID,
        scope: 'Files.ReadWrite.All offline_access',
      };

    case 'x':
      return {
        authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        clientId: credentials.get('x_client_id') || '',
        scope: 'tweet.read tweet.write users.read offline.access',
        usePKCE: true,
      };

    default:
      throw new Error(`Unknown OAuth provider: ${provider}`);
  }
}
```

### Token Exchange

```typescript
async function exchangeCodeForTokens(provider: string, code: string): Promise<OAuthTokens> {
  const config = getOAuthConfig(provider);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: `jeriko://oauth/${provider}/callback`,
    client_id: config.clientId,
  });

  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokens = await response.json();

  // Store tokens encrypted
  credentials.store(`${provider}_tokens`, JSON.stringify(tokens));

  // Set env vars for the engine
  setIntegrationEnvVars(provider, tokens);

  return tokens;
}
```

### Token Refresh

```typescript
// Called when a tool call fails with a 401/token expired error
async function refreshToken(provider: string): Promise<boolean> {
  const stored = credentials.get(`${provider}_tokens`);
  if (!stored) return false;

  const tokens = JSON.parse(stored);
  if (!tokens.refresh_token) return false;

  const config = getOAuthConfig(provider);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: config.clientId,
  });

  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }

  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) return false;

    const newTokens = await response.json();
    newTokens.refresh_token = newTokens.refresh_token || tokens.refresh_token;

    credentials.store(`${provider}_tokens`, JSON.stringify(newTokens));
    setIntegrationEnvVars(provider, newTokens);

    return true;
  } catch {
    return false;
  }
}
```

---

## Webhook Relay Client

### Persistent Connection

```typescript
// src/main/relay.ts
import WebSocket from 'ws';

class RelayClient {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(
    private relayUrl: string,
    private authToken: string,
    private onEvent: (event: WebhookEvent) => void,
  ) {}

  connect(): void {
    this.ws = new WebSocket(`${this.relayUrl}/stream`, {
      headers: { 'Authorization': `Bearer ${this.authToken}` },
    });

    this.ws.on('open', () => {
      console.log('[relay] Connected');
      this.reconnectDelay = 1000;  // Reset backoff
      this.startPing();
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString());

        if (event.type === 'queued_events') {
          // Flush queued events from while we were offline
          for (const queuedEvent of event.events) {
            this.onEvent(queuedEvent);
          }
        } else if (event.type === 'webhook') {
          this.onEvent(event);
        }
      } catch (err) {
        console.error('[relay] Parse error:', err);
      }
    });

    this.ws.on('close', () => {
      console.log('[relay] Disconnected, reconnecting...');
      this.stopPing();
      this.reconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[relay] Error:', err.message);
    });
  }

  private reconnect(): void {
    setTimeout(() => {
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
  }

  async registerWebhook(triggerId: string, source: string): Promise<string> {
    const response = await fetch(`${this.relayUrl}/register`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ triggerId, source }),
    });

    const { webhookUrl } = await response.json();
    return webhookUrl;
  }

  async unregisterWebhook(triggerId: string): Promise<void> {
    await fetch(`${this.relayUrl}/unregister`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ triggerId }),
    });
  }

  disconnect(): void {
    this.stopPing();
    this.ws?.close();
    this.ws = null;
  }
}
```

### Integration with Trigger Engine

```typescript
// In src/main/index.ts

// Start relay connection if user has triggers with webhooks
const relay = new RelayClient(
  'wss://relay.jeriko.dev',
  settings.get('license.key') || '',
  (event) => {
    // Forward webhook event to trigger engine
    const triggerEngine = require(path.join(enginePath, 'server', 'triggers', 'engine'));
    triggerEngine.fireTrigger(event.triggerId, event.payload);

    // Notify renderer
    mainWindow.webContents.send('triggers:event', {
      triggerId: event.triggerId,
      triggerName: event.triggerName,
      type: 'webhook',
      data: event.payload,
      timestamp: new Date().toISOString(),
    });
  },
);
```

---

## Trigger Engine Integration

### Starting Triggers from Electron

```typescript
// src/main/triggers.ts

export function initializeTriggers(enginePath: string, mainWindow: BrowserWindow) {
  const engine = require(path.join(enginePath, 'server', 'triggers', 'engine'));
  const store = require(path.join(enginePath, 'server', 'triggers', 'store'));

  // Load existing triggers
  const triggers = store.list();

  // Start the engine (registers cron jobs, file watchers, etc.)
  engine.init(null);  // null = no Telegram bot in terminal mode

  // Override notification handler to use Electron notifications
  engine.setNotifyHandler((trigger: any, result: any) => {
    // OS notification
    const { Notification } = require('electron');
    new Notification({
      title: `Jeriko: ${trigger.name}`,
      body: result.summary || 'Trigger fired',
    }).show();

    // In-app notification
    mainWindow.webContents.send('triggers:event', {
      triggerId: trigger.id,
      triggerName: trigger.name,
      type: trigger.type,
      data: result,
      timestamp: new Date().toISOString(),
    });

    // Dock badge
    if (process.platform === 'darwin') {
      app.dock.setBadge('1');
    }
  });
}
```

### "While You Were Away" Component

```tsx
// src/renderer/components/output/WhileYouWereAway.tsx

function WhileYouWereAway({ events, onDismiss }) {
  if (events.length === 0) return null;

  return (
    <div className="card while-away">
      <div className="card-header">While you were away:</div>
      {events.map((event) => (
        <div key={event.triggerId + event.timestamp} className="away-event">
          <span className="away-dot">●</span>
          <span className="away-text">{event.triggerName}</span>
          <span className="away-time dim">{formatTimeAgo(event.timestamp)}</span>
        </div>
      ))}
      <button className="button-secondary" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
```

---

## Settings: Integration + Trigger Management

### Integration Section in Settings

```tsx
function IntegrationSettings() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);

  useEffect(() => {
    loadIntegrationStatuses().then(setIntegrations);
  }, []);

  return (
    <div className="settings-section">
      <h3>Integrations</h3>
      {integrations.map((integration) => (
        <div key={integration.name} className="settings-row">
          <span>{integration.name}</span>
          {integration.connected ? (
            <>
              <span className="success">● Connected</span>
              <button onClick={() => disconnect(integration.name)}>Disconnect</button>
            </>
          ) : (
            <>
              <span className="dim">○ Not connected</span>
              <button onClick={() => connect(integration.name)}>Connect</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Trigger Section in Settings

```tsx
function TriggerSettings() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);

  useEffect(() => {
    window.api.listTriggers().then(setTriggers);
  }, []);

  return (
    <div className="settings-section">
      <h3>Triggers</h3>
      {triggers.map((trigger) => (
        <div key={trigger.id} className="settings-row">
          <span className={trigger.enabled ? 'success' : 'dim'}>
            {trigger.enabled ? '●' : '○'}
          </span>
          <span>{trigger.name}</span>
          <span className="dim">{trigger.type} · {trigger.runCount} runs</span>
          <button onClick={() => toggleTrigger(trigger.id)}>
            {trigger.enabled ? 'Pause' : 'Resume'}
          </button>
          <button onClick={() => deleteTrigger(trigger.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

---

## Acceptance Criteria

Phase 3 is complete when ALL of the following are true:

- [ ] When AI encounters a missing integration, inline setup appears (not raw error)
- [ ] API key integrations: Stripe, GitHub, Vercel can be connected inline
- [ ] Multi-field integrations: Twilio, PayPal, Email can be connected inline
- [ ] OAuth integrations: Google Drive OAuth flow works end-to-end
- [ ] OAuth: browser opens, user approves, jeriko:// callback caught, tokens stored
- [ ] OAuth: error handling — user cancels, timeout, invalid grant
- [ ] Credentials stored via safeStorage (never plaintext)
- [ ] After connecting, the original command resumes automatically
- [ ] Settings: integrations listed with connected/not-connected status
- [ ] Settings: can disconnect an integration (credentials deleted)
- [ ] Trigger creation works through natural language prompt
- [ ] Cron triggers fire on schedule
- [ ] File watch triggers fire on file change
- [ ] OS notifications appear when triggers fire
- [ ] "While you were away" shows on app return after trigger events
- [ ] Dock badge shows on trigger fire (macOS)
- [ ] Webhook relay: connects to relay.jeriko.dev via WebSocket
- [ ] Webhook relay: registers webhook URLs
- [ ] Webhook relay: receives forwarded events
- [ ] Webhook relay: handles offline queue (events received on reconnect)
- [ ] Settings: triggers listed with pause/resume/delete controls
- [ ] Token refresh works when OAuth token expires
- [ ] Credential export creates encrypted backup file
- [ ] Credential import restores from encrypted backup
