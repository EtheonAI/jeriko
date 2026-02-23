require('dotenv').config();

const WebSocket = require('ws');
const { spawn, execSync } = require('child_process');
const path = require('path');

const PROXY_URL = process.env.PROXY_URL || 'ws://localhost:3000/ws';
const NODE_NAME = process.env.NODE_NAME;
const NODE_TOKEN = process.env.NODE_TOKEN;
const AI_BACKEND = process.env.AI_BACKEND || 'claude-code';

if (!NODE_NAME || !NODE_TOKEN) {
  console.error('NODE_NAME and NODE_TOKEN are required.');
  console.error('Generate a token on the proxy: /token <name> (Telegram) or GET /api/token/<name>');
  process.exit(1);
}

let ws = null;
let reconnectDelay = 1000;

function connect() {
  const url = `${PROXY_URL}?name=${encodeURIComponent(NODE_NAME)}&token=${encodeURIComponent(NODE_TOKEN)}`;
  console.log(`[agent] Connecting to ${PROXY_URL} as "${NODE_NAME}"...`);

  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`[agent] Connected to proxy as "${NODE_NAME}"`);
    reconnectDelay = 1000;
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      handleTask(msg);
    } catch (err) {
      console.error('[agent] Bad message:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`[agent] Disconnected. Reconnecting in ${reconnectDelay / 1000}s...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });

  ws.on('error', (err) => {
    console.error('[agent] WebSocket error:', err.message);
  });
}

function handleTask({ taskId, command }) {
  console.log(`[agent] Task ${taskId}: ${command.slice(0, 80)}...`);

  if (AI_BACKEND === 'claude-code') {
    return handleClaudeCode(taskId, command);
  }
  // claude (Anthropic API) or openai — use router
  handleAPI(taskId, command);
}

// Dev: spawn Claude Code CLI
function handleClaudeCode(taskId, command) {
  const env = { ...process.env };
  delete env.CLAUDECODE;

  const proc = spawn('claude', ['-p', '--output-format', 'text', '--dangerously-skip-permissions', command], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5 * 60 * 1000,
  });

  proc.stdout.on('data', (data) => {
    send({ taskId, type: 'chunk', data: data.toString() });
  });

  proc.stderr.on('data', (data) => {
    send({ taskId, type: 'chunk', data: data.toString() });
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      send({ taskId, type: 'error', data: `claude exited with code ${code}` });
    } else {
      send({ taskId, type: 'result', data: '' });
    }
  });

  proc.on('error', (err) => {
    send({ taskId, type: 'error', data: `Failed to run claude: ${err.message}` });
  });
}

// Prod: use router.js (Anthropic API or OpenAI)
async function handleAPI(taskId, command) {
  try {
    const { route } = require(path.join(__dirname, '..', 'server', 'router.js'));
    const result = await route(command, (chunk) => {
      send({ taskId, type: 'chunk', data: chunk });
    });
    send({ taskId, type: 'result', data: '' });
  } catch (err) {
    send({ taskId, type: 'error', data: err.message });
  }
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

connect();

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('[agent] Shutting down...');
  if (ws) ws.close();
  process.exit(0);
});

process.once('SIGTERM', () => {
  if (ws) ws.close();
  process.exit(0);
});
