# Trigger System Guide

Triggers are reactive AI automation. Define a condition, and Jeriko executes an action when it fires — either by sending the event to the agent loop for intelligent processing, or by running a shell command directly.

## Overview

```
Event Source          Trigger Engine                     Action
-----------          ------------------                  ------
Cron schedule   -->  src/daemon/services/triggers/  -->  Agent run (full tool access)
Webhook POST    -->  engine.ts + cron.ts +          -->  Shell command (safeSpawn, 5 min cap)
New email (IMAP)-->  webhook.ts + file-watch.ts +   -->  Notification via channel
HTTP status     -->  email.ts + http-poll + once    -->  Chained trigger
File change     -->                                 -->  ...
One-time at     -->                                 -->
```

Trigger management is available through three surfaces:

- **CLI**: `jeriko task list | add | remove | run | enable | disable`
- **REPL slash**: `/tasks` (lists, inspect, stop)
- **Telegram / WhatsApp**: same commands through the channel bus

Shell-action triggers execute inside `safeSpawn()` with a 5-minute wall-clock ceiling and `SIGTERM → SIGKILL` escalation so a runaway action can never stall the engine.

## 6 Trigger Types

### Cron

Time-based scheduling using cron expressions or shorthand.

```
/watch cron "0 9 * * MON" generate a weekly status report and send it

/watch cron every 5m check server health and alert if anything is wrong

/watch cron "0 */2 * * *" summarize unread emails
```

Cron expressions use standard 5-field format (minute, hour, day, month, weekday). The `every Nm/Nh/Ns` shorthand is converted automatically:
- `every 5m` -> `*/5 * * * *`
- `every 2h` -> `0 */2 * * *`
- `every 30s` -> `*/30 * * * * *` (6-field with seconds)

### Webhook

Receive HTTP POST requests from external services (GitHub, Stripe, etc.).

```
/watch webhook stripe log payment details and notify me

/watch webhook github summarize the push and check for security issues

/watch webhook custom process the payload and update the database
```

After creation, the trigger gets a unique webhook URL:

```
POST http://yourserver:3000/hooks/<trigger-id>
```

Configure this URL in the external service. The webhook payload is passed to the action as event data.

**Live Webhook URL:** `https://bot.jeriko.ai/hooks/<trigger-id>` (named Cloudflare Tunnel, permanent URL)

**Pre-configured Webhook Triggers:**

| Service | Trigger ID | Events | Hook Formatter |
|---------|-----------|--------|----------------|
| Stripe | ff87d788 | charges, invoices, payments, customers | `jeriko stripe hook --no-notify` |
| PayPal | 8a7f8e3f | payments, subscriptions, checkouts | `jeriko paypal hook --no-notify` |
| GitHub | 4eae23a1 | push, PRs, issues, releases, CI | `jeriko github hook --no-notify` |
| Twilio | 3f896c67 | call status, SMS delivery | `jeriko twilio hook --no-notify` |

**Hook Formatters:** Each service has a `hook` subcommand that formats webhook payloads into clean, human-readable notifications without requiring AI. The `--no-notify` flag prevents the hook from sending its own Telegram message (the engine handles both Telegram + macOS notification).

Optional signature verification: set `secret` in the trigger config. Supports GitHub (`x-hub-signature-256`), Stripe (`stripe-signature`), and generic HMAC (`x-webhook-signature`).

### Email

Poll an IMAP inbox for new messages.

```
/watch email from:boss@company.com summarize the email and notify me

/watch email summarize any new emails and flag urgent ones
```

Configuration comes from `.env`:
- `IMAP_HOST` (default: `imap.gmail.com`)
- `IMAP_PORT` (default: `993`)
- `IMAP_USER`
- `IMAP_PASSWORD`

Polling interval: every 2 minutes (configurable per trigger). Each new email fires the trigger independently with event data:

```json
{
  "type": "email",
  "from": "sender@example.com",
  "subject": "Important update",
  "date": "2026-02-23T10:00:00Z",
  "snippet": "First 500 chars of email body..."
}
```

### HTTP Monitor

Watch a URL and fire on status changes.

```
/watch http https://mysite.com alert me if it goes down

/watch http https://api.myservice.com/health notify me if the API fails
```

Default check interval: 60 seconds. Fire conditions:
- `down`: fire when HTTP response is not 2xx (or connection fails)
- `up`: fire when HTTP response is 2xx
- `any`: fire on every check
- `slow`: fire when response takes longer than threshold (default: 3000ms)

Event data includes status code, response time, and state.

### File Watch

Monitor a file or directory for changes.

```
/watch file /var/log/app.log alert on errors

/watch file /Users/me/Documents analyze any new files
```

Uses Node.js `fs.watch`. Supports recursive watching. Optional pattern filter to match specific filenames.

Event data:

```json
{
  "type": "file_watch",
  "event": "change",
  "filename": "app.log",
  "path": "/var/log/app.log"
}
```

### Once

Fire once at a specific ISO datetime, then auto-disable. Great for "remind me at 4pm" and "deploy the thing on Monday morning."

```
/watch once "2026-04-24T16:00:00-07:00" deploy the release branch and run smoke tests
```

Internally the engine sets a `setTimeout` to the target timestamp and fires the action exactly once; `max_runs: 1` and the auto-disable path ensure the trigger cannot re-fire after restart.

## Action Types

### Agent Mode (default)

The event data is sent to the agent with the trigger's action text as instructions — whichever LLM is configured (Anthropic, OpenAI, local Ollama, Claude Code, or any OpenAI/Anthropic-compatible provider). The agent processes the event and can run `jeriko` commands to take action.

```
/watch cron "0 9 * * *" check system health, summarize issues, and notify me
```

The agent receives:
```
[Trigger Event: cron]
Trigger: Cron: check system health
Event data:
{"type":"cron","time":"2026-02-23T09:00:00Z"}

Instructions: check system health, summarize issues, and notify me
```

The agent then runs `jeriko sys`, analyzes the output, and may run `jeriko notify` to send results.

### Shell Mode

For triggers with `actionType: "shell"`, the `shellCommand` runs directly without AI processing. The event data is available as the `TRIGGER_EVENT` env var.

```bash
# Shell trigger (set programmatically)
{
  "actionType": "shell",
  "shellCommand": "jeriko sys --format text | jeriko notify"
}
```

Shell mode is useful for simple automations that don't need AI reasoning.

## Using Plugin Commands in Triggers

Triggers that use Claude mode can invoke plugin commands, because Claude discovers all available commands (core + plugins) via `jeriko discover`. No special configuration needed.

```
/watch cron every 1h use jeriko gh-issues to check for new issues and summarize them
```

Plugin commands in shell-mode triggers work as long as the plugin is installed and trusted on the machine running the trigger.

## Plugin Trigger Templates

Plugins with webhooks get automatic trigger integration. When a trusted plugin declares webhooks in its manifest, the server registers routes at:

```
POST /hooks/plugin/<namespace>/<webhook-name>
```

These are separate from user-created webhook triggers. Plugin webhook handlers run the plugin's own handler script (not Claude), with restricted env and a 60-second timeout.

## Monitoring

### List Triggers

```
/triggers
```

Shows all triggers with:
- Status: `ON` or `OFF`
- ID (8-character hex)
- Name
- Type
- Run count
- Last execution time

### View Execution Log

```
/trigger_log
```

Shows the 10 most recent trigger executions with timestamp, status (ok/error), trigger ID, and output summary.

### Pause / Resume

```
/trigger_pause <id>
/trigger_resume <id>
```

Pausing stops the trigger from firing but preserves its configuration. Resuming reactivates it.

### Delete

```
/trigger_delete <id>
```

Permanently removes the trigger and stops any active cron job, poller, or file watcher.

## Auto-Disable

Triggers automatically disable after **5 consecutive errors**. This prevents runaway failures from consuming resources or spamming notifications.

When auto-disabled:
1. The trigger's `enabled` flag is set to `false`
2. The cron job / poller / watcher is stopped
3. A Telegram notification is sent: `Trigger "Name" disabled after 5 consecutive errors.`

To re-enable: fix the underlying issue, then `/trigger_resume <id>`.

Successful executions reset the consecutive error counter to 0.

## Max Runs

Triggers can have a `maxRuns` limit. When the run count reaches `maxRuns`, the trigger auto-disables. Useful for one-shot or limited automations.

## Data Storage

Trigger definitions: `data/triggers.json`
Execution log: `data/trigger-log.json` (keeps last 500 entries)

Both files are JSON and can be inspected directly. The trigger engine loads from `triggers.json` on startup and activates all enabled triggers.
