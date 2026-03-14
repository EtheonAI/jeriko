# Multi-Machine Setup

Jeriko can orchestrate multiple machines from a single control plane. A central **hub** runs the server (Express + WebSocket), and remote **nodes** run the lightweight agent that connects back over WebSocket. Commands are routed to specific machines using `@name` prefix syntax from Telegram, WhatsApp, or the API.

---

## Table of Contents

- [Architecture](#architecture)
- [Hub Setup](#hub-setup)
- [Token Management](#token-management)
- [Node Setup](#node-setup)
  - [Quick Install (One-Line)](#quick-install-one-line)
  - [Manual Setup](#manual-setup)
- [Targeting Nodes](#targeting-nodes)
- [WebSocket Protocol](#websocket-protocol)
  - [Connection](#connection)
  - [Hub to Node Messages](#hub-to-node-messages)
  - [Node to Hub Messages](#node-to-hub-messages)
  - [Heartbeat](#heartbeat)
  - [Task Timeout](#task-timeout)
- [Reconnection](#reconnection)
- [Agent AI Backends](#agent-ai-backends)
- [Systemd Service](#systemd-service)
- [Security](#security)
- [Monitoring](#monitoring)
- [Example: 3-Machine Setup](#example-3-machine-setup)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
                        +---------------------------+
                        |         Hub (VPS)         |
                        |                           |
   Telegram -----+      |  Express   +  WebSocket   |
                  |      |  (REST API)   (wss://)    |
   WhatsApp -----+----->|                           |
                  |      |  router.js parses @target |
   REST API -----+      |  and routes to the right  |
                        |  node via sendTask()      |
                        +------+----------+---------+
                               |          |
                     WebSocket |          | WebSocket
                               |          |
                    +----------v--+    +--v----------+
                    | Node: macbook|    | Node: rpi    |
                    | agent.js     |    | agent.js     |
                    | (macOS)      |    | (Linux)      |
                    |              |    |              |
                    | AI Backend:  |    | AI Backend:  |
                    | claude-code  |    | local/ollama |
                    +--------------+    +--------------+
```

**Data flow:**

1. User sends `@macbook take a screenshot` via Telegram.
2. Hub's `router.js` calls `parseCommand()` which extracts target=`macbook`, command=`take a screenshot`.
3. Hub calls `websocket.sendTask("macbook", "take a screenshot")`.
4. The macbook node's `agent.js` receives the task, runs the AI backend, streams chunks back.
5. Hub collects chunks and delivers the final result to the user.

**Key files:**

| File | Role |
|------|------|
| `server/index.js` | Hub entry point (Express + WebSocket + Telegram + WhatsApp) |
| `server/websocket.js` | WebSocket server, node registry, task routing (148 lines) |
| `server/auth.js` | HMAC-SHA256 token generation and validation (46 lines) |
| `server/router.js` | Command parsing (`@target command`) and AI backend dispatch |
| `agent/agent.js` | Remote node agent, connects to hub via WebSocket (126 lines) |
| `agent/install.sh` | One-line installer for remote nodes |

---

## Hub Setup

The hub is the central server that all nodes connect to. It runs Express (HTTP/REST), WebSocket (node communication), and optionally Telegram/WhatsApp bots.

### Start the Hub

Any of these methods work:

```bash
# Option 1: npm
npm start

# Option 2: jeriko CLI
jeriko server --start

# Option 3: direct
node server/index.js
```

The server listens on port 7741 by default. Set `JERIKO_PORT` in `.env` to change it.

### Required Environment Variables

Create a `.env` file in the project root:

```bash
# Required for multi-machine
NODE_AUTH_SECRET=your-random-secret-here   # HMAC key for token generation (REQUIRED)

# Optional
JERIKO_PORT=7741                           # default: 7741
DEFAULT_NODE=local                         # default target when no @prefix used
AI_BACKEND=claude-code                     # local AI backend: claude-code, claude, openai, local

# Telegram (optional, for bot control)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
ADMIN_TELEGRAM_IDS=12345678,87654321
```

`NODE_AUTH_SECRET` is mandatory. The server refuses to generate tokens if it is not set. Use a strong random value:

```bash
openssl rand -hex 32
```

### Expose the Hub

Remote nodes need to reach the hub over the network. Options:

| Method | Command/Config | When to Use |
|--------|---------------|-------------|
| Direct | Open port 7741 on firewall | VPS with public IP |
| Reverse proxy | nginx/caddy in front of port 7741 | Production, TLS termination |
| Tunnel | `cloudflared tunnel`, `ngrok`, `bore` | Development, behind NAT |
| SSH tunnel | `ssh -R 7741:localhost:7741 vps` | Quick ad-hoc access |

For WebSocket support, ensure your reverse proxy passes the `Upgrade` header. Example nginx config:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:7741;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}

location / {
    proxy_pass http://127.0.0.1:7741;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## Token Management

Tokens authenticate remote nodes when they connect to the hub. They are HMAC-SHA256 hashes derived from the node name, keyed by `NODE_AUTH_SECRET`.

### How Tokens Work

```
token = HMAC-SHA256(NODE_AUTH_SECRET, nodeName)
```

- **Deterministic**: The same node name always produces the same token (as long as `NODE_AUTH_SECRET` stays the same).
- **Unforgeable**: Cannot be computed without knowing `NODE_AUTH_SECRET`.
- **Per-node**: Each node name produces a unique token.
- **Invalidation**: Changing `NODE_AUTH_SECRET` invalidates all existing tokens at once.

### Generate a Token

Three methods, all produce the same token for a given name:

```bash
# 1. Telegram bot command (admin only)
/token macbook

# 2. REST API (requires Bearer auth with NODE_AUTH_SECRET)
curl -H "Authorization: Bearer $NODE_AUTH_SECRET" \
     https://yourserver.com/api/token/macbook

# 3. jeriko CLI (on the hub machine)
jeriko server --token macbook
```

The response includes the token and instructions for configuring the node:

```
Token for "macbook":

a1b2c3d4e5f6...

Set on the agent:
NODE_NAME=macbook
NODE_TOKEN=a1b2c3d4e5f6...
PROXY_URL=wss://yourserver.com/ws
```

### Validation

When a node connects, the hub:

1. Extracts `name` and `token` from the WebSocket query string.
2. Recomputes HMAC-SHA256 of the name using `NODE_AUTH_SECRET`.
3. Compares the expected and provided tokens using `crypto.timingSafeEqual()` to prevent timing attacks.
4. If the token length differs or the comparison fails, the connection is rejected with 403.
5. If `NODE_AUTH_SECRET` is not set, `validateToken()` returns false for all tokens.

---

## Node Setup

### Quick Install (One-Line)

For Linux nodes with internet access, the installer script handles everything:

```bash
curl -sL https://yourserver.com/install | bash -s -- wss://yourserver.com/ws macbook <token>
```

Replace:
- `https://yourserver.com/install` with your hub URL serving `agent/install.sh`
- `wss://yourserver.com/ws` with the WebSocket endpoint (use `ws://` for non-TLS)
- `macbook` with the node name
- `<token>` with the token from `/token macbook`

**What the installer does:**

1. Checks for Node.js. If missing, installs it via [nvm](https://github.com/nvm-sh/nvm).
2. Warns if `claude` CLI is not found (needed for `claude-code` backend).
3. Clones the repo to `~/.Jeriko/repo` (or `git pull` if already cloned).
4. Creates `~/.Jeriko/.env` with `PROXY_URL`, `NODE_NAME`, `NODE_TOKEN`.
5. Runs `bun install --production` for dependencies.
6. If systemd is available: creates, enables, and starts a systemd service.
7. Otherwise: prints manual start instructions (direct or pm2).

### Manual Setup

```bash
# Clone the repo
git clone https://github.com/etheonai/jeriko.git
cd jeriko
bun install
```

Create a `.env` file in the project root:

```bash
PROXY_URL=wss://yourserver.com/ws    # Hub WebSocket URL
NODE_NAME=macbook                     # Unique name for this node
NODE_TOKEN=a1b2c3d4e5f6...           # Token from hub

# AI Backend (pick one)
AI_BACKEND=claude-code               # Claude Code CLI (default, requires `claude` installed)
# AI_BACKEND=claude                  # Anthropic API (requires ANTHROPIC_API_KEY)
# AI_BACKEND=openai                  # OpenAI API (requires OPENAI_API_KEY)
# AI_BACKEND=local                   # Local model (Ollama, LM Studio, etc.)
```

Start the agent:

```bash
# Using npm
npm run agent

# Or directly
node agent/agent.js
```

You should see:

```
[agent] Connecting to wss://yourserver.com/ws as "macbook"...
[agent] Connected to proxy as "macbook"
```

---

## Targeting Nodes

Commands are routed to specific machines using `@name` prefix syntax.

### Syntax

```
@<nodeName> <command>
```

### Examples

| Input | Target | Command |
|-------|--------|---------|
| `@macbook take a screenshot` | macbook | take a screenshot |
| `@server check disk usage` | server | check disk usage |
| `@rpi what's the temperature` | rpi | what's the temperature |
| `check the weather` | local (default) | check the weather |

### How It Works

The `parseCommand()` function in `server/router.js` parses the input:

```javascript
function parseCommand(text) {
  const match = text.match(/^@(\S+)\s+(.+)$/s);
  if (match) {
    return { target: match[1], command: match[2].trim() };
  }
  return { target: DEFAULT_NODE, command: text.trim() };
}
```

- If the text starts with `@`, the first word after `@` is the target node name.
- If no `@` prefix, the command runs on `DEFAULT_NODE` (defaults to `"local"`, configurable via `.env`).
- `"local"` means the hub itself runs the command using its own AI backend.

### Error Handling

If the targeted node is not connected:

```
Node "macbook" is not connected. Use /nodes to see available machines.
```

---

## WebSocket Protocol

### Connection

Nodes connect to the hub at:

```
ws://host:port/ws?name=<nodeName>&token=<token>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| Path | Yes | Must be `/ws` |
| `name` | Yes | Unique node name (query param) |
| `token` | Yes | HMAC-SHA256 token for the name (query param) |

**Connection lifecycle:**

1. Node initiates WebSocket upgrade to `/ws`.
2. Hub intercepts the `upgrade` event on the HTTP server.
3. Hub validates path is `/ws`, name and token are present, and token is valid.
4. On success: WebSocket handshake completes, node is registered in memory.
5. On failure: Socket receives `401 Unauthorized` or `403 Forbidden` and is destroyed.

**Duplicate names:** If a node connects with a name that is already registered, the old connection is terminated (`ws.terminate()`) and the new connection takes its place.

### Hub to Node Messages

The hub sends task assignments:

```json
{
  "taskId": "1",
  "command": "take a screenshot and describe it"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | string | Monotonically increasing ID, unique per hub session |
| `command` | string | Natural language command (the `@name` prefix is stripped) |

### Node to Hub Messages

Nodes send three types of messages back:

**Chunk** (streaming output):
```json
{
  "taskId": "1",
  "type": "chunk",
  "data": "Taking screenshot of primary display..."
}
```

**Result** (task complete):
```json
{
  "taskId": "1",
  "type": "result",
  "data": ""
}
```

**Error** (task failed):
```json
{
  "taskId": "1",
  "type": "error",
  "data": "Failed: claude exited with code 1"
}
```

| Type | Meaning | Effect on Hub |
|------|---------|---------------|
| `chunk` | Partial output (streaming) | Appended to `pending.chunks[]`, forwarded via `onChunk` callback |
| `result` | Task completed successfully | All chunks joined into final result, promise resolved |
| `error` | Task failed | Promise rejected with error message |

### Heartbeat

- The hub pings every connected node every **30 seconds**.
- Nodes respond with `pong` (automatic in the `ws` library, no application code needed).
- `lastPing` timestamp is updated on each pong, used for monitoring.

### Task Timeout

- Each task has a **5-minute timeout** (300,000ms).
- If the timeout fires and the task is still pending:
  - Any chunks received so far are joined and returned as the result.
  - If no chunks were received, the result is `"(timeout -- no output)"`.
- The pending task entry is cleaned up regardless.

---

## Reconnection

The agent implements exponential backoff for automatic reconnection:

```
Disconnect -> wait 1s -> reconnect
Disconnect -> wait 2s -> reconnect
Disconnect -> wait 4s -> reconnect
Disconnect -> wait 8s -> reconnect
...
Disconnect -> wait 30s -> reconnect  (capped)
Disconnect -> wait 30s -> reconnect  (stays at 30s)
```

**Parameters:**

| Setting | Value |
|---------|-------|
| Initial delay | 1 second |
| Backoff multiplier | 2x |
| Maximum delay | 30 seconds |
| Reset condition | Successful connection (`open` event) |

The agent never gives up. It will keep trying to reconnect indefinitely, which makes it resilient to hub restarts, network outages, and deploys.

**Relevant code from `agent/agent.js`:**

```javascript
ws.on('open', () => {
  reconnectDelay = 1000;  // Reset on success
});

ws.on('close', () => {
  setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30000);  // Double, cap at 30s
});
```

---

## Agent AI Backends

Each node can use a different AI backend. Set `AI_BACKEND` in the node's `.env`:

| Backend | Value | Requirements | How It Works |
|---------|-------|-------------|--------------|
| Claude Code CLI | `claude-code` (default) | `claude` CLI installed | Spawns `claude -p --output-format text --dangerously-skip-permissions` |
| Anthropic API | `claude` | `ANTHROPIC_API_KEY` | Uses `router.js` to call Anthropic Messages API |
| OpenAI API | `openai` | `OPENAI_API_KEY` | Uses `router.js` to call OpenAI Chat Completions API |
| Local model | `local` | Ollama, LM Studio, etc. running | Uses `router.js` to call local OpenAI-compatible endpoint |

**claude-code backend** (the default) spawns the Claude Code CLI as a subprocess:

```javascript
spawn('claude', ['-p', '--output-format', 'text', '--dangerously-skip-permissions', command], {
  timeout: 5 * 60 * 1000,  // 5 minute timeout
});
```

- stdout and stderr are both streamed back as `chunk` messages.
- The `CLAUDECODE` environment variable is deleted to prevent recursion.
- Exit code 0 sends a `result` message; non-zero sends an `error`.

**API backends** (claude, openai, local) use the same `router.js` module that the hub uses, complete with auto-discovered system prompts from `jeriko discover` and session memory injection.

---

## Systemd Service

For Linux nodes that should run persistently, the installer creates a systemd unit file:

```ini
[Unit]
Description=Jeriko Agent (macbook)
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/.Jeriko/repo
ExecStart=/usr/bin/node agent/agent.js
Restart=always
RestartSec=10
EnvironmentFile=/home/youruser/.Jeriko/.env

[Install]
WantedBy=multi-user.target
```

**Key properties:**

- `Restart=always` with `RestartSec=10`: Systemd restarts the agent 10 seconds after any crash, providing an additional layer of resilience beyond the agent's own reconnection logic.
- `EnvironmentFile`: Loads `PROXY_URL`, `NODE_NAME`, `NODE_TOKEN` from `~/.Jeriko/.env`.
- `After=network.target`: Waits for network before starting.

### Manage the Service

```bash
# Enable auto-start on boot
sudo systemctl enable Jeriko-agent

# Start / stop / restart
sudo systemctl start Jeriko-agent
sudo systemctl stop Jeriko-agent
sudo systemctl restart Jeriko-agent

# Check status and logs
systemctl status Jeriko-agent
journalctl -u Jeriko-agent -f          # follow logs
journalctl -u Jeriko-agent --since today
```

### Alternative: pm2 (macOS / no systemd)

On macOS or systems without systemd, use [pm2](https://pm2.keymetrics.io/):

```bash
bun install -g pm2
pm2 start agent/agent.js --name Jeriko-macbook
pm2 save
pm2 startup    # generates the OS-specific auto-start command
```

---

## Security

### Authentication Model

- **HMAC-SHA256 tokens**: Each node's token is the HMAC-SHA256 of its name, keyed by `NODE_AUTH_SECRET`. This means tokens cannot be forged without the secret, and the hub can validate them without storing them.
- **No insecure defaults**: `NODE_AUTH_SECRET` is required. The server refuses to generate tokens and `validateToken()` returns false for all inputs if the secret is not set.
- **Timing-safe comparison**: Token validation uses `crypto.timingSafeEqual()` to prevent timing side-channel attacks.
- **Per-connection auth**: Every WebSocket upgrade is authenticated. Failed auth results in socket destruction (401 or 403).
- **Admin API auth**: REST endpoints (`/api/nodes`, `/api/token/:name`, `/api/triggers`) require `Bearer NODE_AUTH_SECRET` in the Authorization header, also validated with timing-safe comparison.

### Recommendations

- Use `wss://` (WebSocket over TLS) in production. Tokens are sent in the query string, which is encrypted over TLS but may appear in server logs.
- Set `ADMIN_TELEGRAM_IDS` to restrict Telegram bot access. If not set, the `/token` command and AI routing are denied to all users.
- Rotate `NODE_AUTH_SECRET` periodically. This invalidates all existing tokens -- regenerate and redistribute them to all nodes.
- The agent strips the `CLAUDECODE` env variable before spawning the Claude CLI to prevent recursive agent invocation.
- Shell execution (`shell.js`) strips sensitive environment variables (API keys, tokens, secrets) from the subprocess environment.

---

## Monitoring

### Telegram Commands

| Command | Description |
|---------|-------------|
| `/nodes` | List connected nodes with connection time and last ping |
| `/status` | Hub health: uptime, node count, active triggers, memory usage |
| `/token <name>` | Generate a token for a new node (admin only) |

**Example `/nodes` output:**

```
Connected nodes:
- macbook -- connected 2 hours ago, last ping 15 seconds ago
- rpi -- connected 5 days ago, last ping 12 seconds ago
```

**Example `/status` output:**

```
Jeriko Status
Uptime: 14d 6h 32m
Connected nodes: 2
Active triggers: 5
Memory: 87MB
```

### REST API

| Endpoint | Auth | Response |
|----------|------|----------|
| `GET /` | None | `{"name":"Jeriko","status":"running","uptime":1234,"nodes":2,"activeTriggers":5}` |
| `GET /api/nodes` | Bearer | `[{"name":"macbook","connectedAt":"...","lastPing":"...","alive":true}]` |
| `GET /api/token/:name` | Bearer | `{"name":"macbook","token":"a1b2c3..."}` |

```bash
# Health check (no auth required)
curl https://yourserver.com/

# List connected nodes (auth required)
curl -H "Authorization: Bearer $NODE_AUTH_SECRET" https://yourserver.com/api/nodes
```

---

## Example: 3-Machine Setup

A realistic setup with a VPS hub, a MacBook at home, and a Raspberry Pi in the office.

### 1. Hub: VPS (Linux, DigitalOcean/Hetzner/etc.)

```bash
# On the VPS
git clone https://github.com/etheonai/jeriko.git
cd jeriko && bun install

# Generate a strong secret
openssl rand -hex 32
# outputs: a7f3e2d1c4b5...

# Create .env
cat > .env <<'EOF'
NODE_AUTH_SECRET=a7f3e2d1c4b5...
JERIKO_PORT=7741
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
ADMIN_TELEGRAM_IDS=12345678
AI_BACKEND=claude
ANTHROPIC_API_KEY=sk-ant-...
EOF

# Start the hub
npm start
# [server] Jeriko daemon running on port 7741
```

Set up a reverse proxy (nginx/caddy) with TLS for `Jeriko.yourdomain.com`.

### 2. Generate Tokens

From Telegram (or any method):

```
/token macbook
→ Token: 8b2f4a1d9c3e...

/token rpi
→ Token: 5d7e1f3a6b8c...
```

### 3. Node: MacBook Pro (Home)

```bash
# Clone and install
git clone https://github.com/etheonai/jeriko.git
cd jeriko && bun install

# Create .env
cat > .env <<'EOF'
PROXY_URL=wss://Jeriko.yourdomain.com/ws
NODE_NAME=macbook
NODE_TOKEN=8b2f4a1d9c3e...
AI_BACKEND=claude-code
EOF

# Start (using pm2 for persistence)
pm2 start agent/agent.js --name Jeriko-macbook
pm2 save && pm2 startup
```

The MacBook uses `claude-code` backend, so the Claude Code CLI handles all commands with full access to the local machine (screenshots, files, apps, browser, etc.).

### 4. Node: Raspberry Pi (Office)

```bash
# One-line install
curl -sL https://Jeriko.yourdomain.com/install | \
  bash -s -- wss://Jeriko.yourdomain.com/ws rpi 5d7e1f3a6b8c...
```

Or manually:

```bash
git clone https://github.com/etheonai/jeriko.git
cd jeriko && bun install

cat > .env <<'EOF'
PROXY_URL=wss://Jeriko.yourdomain.com/ws
NODE_NAME=rpi
NODE_TOKEN=5d7e1f3a6b8c...
AI_BACKEND=local
LOCAL_MODEL_URL=http://localhost:11434/v1
LOCAL_MODEL=llama3.2
EOF

# Systemd (auto-created by installer, or manually)
sudo systemctl enable Jeriko-agent
sudo systemctl start Jeriko-agent
```

The Pi runs a local Ollama model for fully offline, private operation.

### 5. Use It

From Telegram or WhatsApp:

```
# Run on the MacBook
@macbook take a screenshot and describe what's on screen

# Run on the Raspberry Pi
@rpi what's the CPU temperature and disk usage

# Run on the hub itself (no prefix)
search for the latest Node.js release

# Check which nodes are online
/nodes

# Hub health
/status
```

---

## Troubleshooting

### Node won't connect

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `NODE_NAME and NODE_TOKEN are required` | Missing `.env` or env vars not loaded | Check `.env` file exists and `dotenv` is installed |
| Connection immediately closes | Invalid token | Regenerate with `/token <name>` on the hub |
| `ECONNREFUSED` | Hub not running or wrong URL | Verify `PROXY_URL`, check hub is listening |
| Keeps reconnecting every 30s | Firewall blocking WebSocket | Check port is open, try `ws://` before `wss://` |
| `403 Forbidden` in hub logs | Token mismatch | Ensure `NODE_AUTH_SECRET` matches between hub and token generation |

### Commands not reaching node

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `Node "x" is not connected` | Node offline or wrong name | Run `/nodes` to see connected names |
| Command runs locally instead | Missing `@` prefix | Use `@nodename command` syntax |
| Timeout after 5 minutes | AI backend hanging | Check node logs, ensure `claude` CLI or API key works |

### Viewing logs

```bash
# Hub logs
journalctl -u Jeriko -f

# Node logs (systemd)
journalctl -u Jeriko-agent -f

# Node logs (pm2)
pm2 logs Jeriko-macbook

# Node logs (manual)
node agent/agent.js    # stdout shows all activity
```
