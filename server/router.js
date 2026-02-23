const { spawn, execSync } = require('child_process');
const path = require('path');

// Lazy-require websocket to avoid side effects when imported from CLI chat
let _ws;
function getWs() {
  if (!_ws) _ws = require('./websocket');
  return _ws;
}

const DEFAULT_NODE = process.env.DEFAULT_NODE || 'local';
const AI_BACKEND = process.env.AI_BACKEND || 'claude'; // 'claude' or 'openai'

// Absolute path to jeriko CLI — avoids PATH issues in non-interactive shells
const JERIKO = path.join(__dirname, '..', 'bin', 'jeriko');

// Auto-discover system prompt from installed commands
let BASE_PROMPT;
try {
  const raw = execSync(`node ${JERIKO} discover --raw`, { encoding: 'utf-8', timeout: 5000 });
  BASE_PROMPT = raw;
} catch {
  BASE_PROMPT = `You are JerikoBot. Run "node ${JERIKO} discover --list" to see available commands.`;
}
if (!process.env.JERIKO_CHAT_QUIET) {
  console.log('[router] System prompt loaded via jeriko discover');
}

// Build system prompt with session context injected
function getSystemPrompt() {
  let context = '';
  try {
    context = execSync(`node ${JERIKO} memory --context --raw --limit 5`, { encoding: 'utf-8', timeout: 3000 });
  } catch {
    // No context available
  }
  return context ? `${BASE_PROMPT}\n\n${context}` : BASE_PROMPT;
}

// Kept for backward compat
const SYSTEM_PROMPT = BASE_PROMPT;

function parseCommand(text) {
  const match = text.match(/^@(\S+)\s+(.+)$/s);
  if (match) {
    return { target: match[1], command: match[2].trim() };
  }
  return { target: DEFAULT_NODE, command: text.trim() };
}

// Log command+result to session memory (fire-and-forget)
function logSession(command, result) {
  try {
    const summary = typeof result === 'string' ? result.slice(0, 300) : '';
    execSync(`node ${JERIKO} memory --log --command "${command.replace(/"/g, '\\"')}" --summary "${summary.replace(/"/g, '\\"')}"`, {
      timeout: 3000,
      stdio: 'ignore',
    });
  } catch {
    // Non-critical — don't break routing if logging fails
  }
}

async function route(text, onChunk) {
  const { target, command } = parseCommand(text);

  let result;
  if (target === 'local') {
    result = await executeLocal(command, onChunk);
  } else if (!getWs().isNodeConnected(target)) {
    throw new Error(`Node "${target}" is not connected. Use /nodes to see available machines.`);
  } else {
    result = await getWs().sendTask(target, command, onChunk);
  }

  // Auto-log to session memory
  logSession(command, result);
  return result;
}

async function executeLocal(command, onChunk) {
  if (AI_BACKEND === 'openai') {
    return executeOpenAI(command, onChunk);
  }
  return executeClaude(command, onChunk);
}

// ========== CLAUDE BACKEND ==========

function executeClaude(command, onChunk) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn('claude', [
      '-p',
      '--output-format', 'text',
      '--dangerously-skip-permissions',
      '--system-prompt', getSystemPrompt(),
      command,
    ], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5 * 60 * 1000,
    });

    const chunks = [];

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      chunks.push(text);
      if (onChunk) onChunk(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      chunks.push(text);
    });

    proc.on('close', (code) => {
      const output = chunks.join('');
      if (code !== 0 && !output) {
        reject(new Error(`claude exited with code ${code}`));
      } else {
        resolve(output || '(no output)');
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run claude: ${err.message}`));
    });
  });
}

// ========== OPENAI BACKEND ==========

const BASH_TOOL = {
  type: 'function',
  function: {
    name: 'bash',
    description: 'Execute a bash command on the machine and return stdout+stderr',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command to run' },
      },
      required: ['command'],
    },
  },
};

function runBash(command) {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
      env: process.env,
      cwd: path.join(__dirname, '..'),
    });
    return stdout.slice(0, 10000);
  } catch (e) {
    const out = (e.stdout || '') + '\n' + (e.stderr || '');
    return (out.trim() || e.message).slice(0, 10000);
  }
}

async function executeOpenAI(command, onChunk) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in .env');

  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const messages = [
    { role: 'system', content: getSystemPrompt() },
    { role: 'user', content: command },
  ];

  // Agent loop: call API, execute tools, repeat until text response
  for (let turn = 0; turn < 15; turn++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: [BASH_TOOL],
        tool_choice: 'auto',
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const choice = data.choices[0];
    const msg = choice.message;

    // Add assistant message to history
    messages.push(msg);

    // If no tool calls, we're done — return the text
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const text = msg.content || '(no output)';
      if (onChunk) onChunk(text);
      return text;
    }

    // Execute each tool call
    for (const call of msg.tool_calls) {
      if (call.function.name === 'bash') {
        let args;
        try { args = JSON.parse(call.function.arguments); } catch {
          args = { command: call.function.arguments };
        }
        console.log(`[openai] bash: ${args.command.slice(0, 100)}`);
        const result = runBash(args.command);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result,
        });
      }
    }
  }

  return '(max tool call turns reached)';
}

module.exports = { route, parseCommand };
