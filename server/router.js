const { spawn, execSync } = require('child_process');
const path = require('path');

// Lazy-require websocket to avoid side effects when imported from CLI chat
let _ws;
function getWs() {
  if (!_ws) _ws = require('./websocket');
  return _ws;
}

const DEFAULT_NODE = process.env.DEFAULT_NODE || 'local';
// 'claude-code' = Claude Code CLI (dev), 'claude' = Anthropic API (prod), 'openai' = OpenAI API, 'local' = Ollama/LM Studio/etc
const AI_BACKEND = process.env.AI_BACKEND || 'claude-code';
const LOCAL_MODEL_URL = process.env.LOCAL_MODEL_URL || 'http://localhost:11434/v1';
const LOCAL_MODEL = process.env.LOCAL_MODEL || 'llama3.2';

// Absolute path to jeriko CLI — avoids PATH issues in non-interactive shells
const JERIKO = path.join(__dirname, '..', 'bin', 'jeriko');
const os = require('os');
const fs = require('fs');

// Projects directory — where AI-built projects land
const PROJECTS_DIR = path.join(os.homedir(), '.jeriko', 'projects');
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

// Detect installed editor (checked once on startup)
function detectEditor() {
  const editors = [
    { cmd: 'code', name: 'VS Code', open: 'code' },
    { cmd: 'cursor', name: 'Cursor', open: 'cursor' },
    { cmd: 'subl', name: 'Sublime Text', open: 'subl' },
    { cmd: 'webstorm', name: 'WebStorm', open: 'webstorm' },
    { cmd: 'idea', name: 'IntelliJ IDEA', open: 'idea' },
    { cmd: 'zed', name: 'Zed', open: 'zed' },
    { cmd: 'atom', name: 'Atom', open: 'atom' },
    { cmd: 'vim', name: 'Vim', open: 'vim' },
    { cmd: 'nano', name: 'Nano', open: 'nano' },
  ];
  for (const e of editors) {
    try {
      execSync(`command -v ${e.cmd}`, { stdio: 'ignore', timeout: 2000 });
      return e;
    } catch { /* not found */ }
  }
  return null;
}

const EDITOR = detectEditor();

// Load FULL system prompt via jeriko prompt (includes ALL commands, templates, piping, plugins, architecture)
let BASE_PROMPT;
try {
  const raw = execSync(`node ${JERIKO} prompt --raw`, { encoding: 'utf-8', timeout: 10000 });
  BASE_PROMPT = raw;
} catch {
  // Fallback to discover if prompt command not available
  try {
    const raw = execSync(`node ${JERIKO} discover --raw`, { encoding: 'utf-8', timeout: 5000 });
    BASE_PROMPT = raw;
  } catch {
    BASE_PROMPT = `You are JerikoBot. Run "node ${JERIKO} prompt --list" to see available commands.`;
  }
}
if (!process.env.JERIKO_CHAT_QUIET) {
  console.log(`[router] System prompt loaded via jeriko prompt (${BASE_PROMPT.split('\n').length} lines)`);
  console.log(`[router] Projects dir: ${PROJECTS_DIR}`);
  console.log(`[router] Editor: ${EDITOR ? EDITOR.name : 'none detected'}`);
}

// Build system prompt with session context (workspace + editor already in BASE_PROMPT)
function getSystemPrompt() {
  let context = '';
  try {
    context = execSync(`node ${JERIKO} memory --context --raw --limit 5`, { encoding: 'utf-8', timeout: 3000 });
  } catch {
    // No context available
  }

  let prompt = BASE_PROMPT;
  if (context) prompt += `\n\n${context}`;
  return prompt;
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

// history (optional): an array of prior messages for multi-turn conversation.
// When passed, backends append to it in-place so the caller retains full history.
// Telegram/WhatsApp omit history (stateless). jeriko-chat passes it (stateful).
async function route(text, onChunk, onStatus, history) {
  const { target, command } = parseCommand(text);

  let result;
  if (target === 'local') {
    result = await executeLocal(command, onChunk, onStatus, history);
  } else if (!getWs().isNodeConnected(target)) {
    throw new Error(`Node "${target}" is not connected. Use /nodes to see available machines.`);
  } else {
    result = await getWs().sendTask(target, command, onChunk);
  }

  // Auto-log to session memory
  logSession(command, result);
  return result;
}

async function executeLocal(command, onChunk, onStatus, history) {
  if (AI_BACKEND === 'local') return executeLocalModel(command, onChunk, onStatus, history);
  if (AI_BACKEND === 'openai') return executeOpenAI(command, onChunk, onStatus, history);
  if (AI_BACKEND === 'claude') return executeClaude(command, onChunk, onStatus, history);
  return executeClaudeCode(command, onChunk, onStatus);
}

// ========== CLAUDE CODE CLI (dev only) ==========

function executeClaudeCode(command, onChunk, onStatus) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    if (onStatus) onStatus({ type: 'thinking' });

    const proc = spawn('claude', [
      '-p',
      '--output-format', 'text',
      '--dangerously-skip-permissions',
      '--system-prompt', getSystemPrompt(),
      command,
    ], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10 * 60 * 1000, // 10 minutes for complex tasks
    });

    const chunks = [];
    let firstChunk = true;
    let stderrLines = [];

    // Heartbeat: report activity every 15s so Telegram shows progress
    let lastActivity = Date.now();
    const heartbeat = setInterval(() => {
      if (onStatus) {
        const elapsed = Math.round((Date.now() - lastActivity) / 1000);
        onStatus({ type: 'thinking' });
      }
    }, 15000);

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      chunks.push(text);
      lastActivity = Date.now();
      if (firstChunk && onStatus) { onStatus({ type: 'responding' }); firstChunk = false; }
      if (onChunk) onChunk(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      lastActivity = Date.now();
      // Preserve stderr markers (SCREENSHOT:, FILE:) but don't mix diagnostics into output
      for (const line of text.split('\n')) {
        if (line.startsWith('SCREENSHOT:') || line.startsWith('FILE:')) {
          stderrLines.push(line);
        }
      }
    });

    proc.on('close', (code) => {
      clearInterval(heartbeat);
      let output = chunks.join('');
      // Append file markers from stderr
      if (stderrLines.length > 0) {
        output = output + '\n' + stderrLines.join('\n');
      }
      if (code !== 0 && !output) reject(new Error(`claude exited with code ${code}`));
      else resolve(output || '(no output)');
    });

    proc.on('error', (err) => {
      clearInterval(heartbeat);
      reject(new Error(`Failed to run claude: ${err.message}`));
    });
  });
}

// ========== CLAUDE BACKEND (Anthropic API) ==========

const CLAUDE_BASH_TOOL = {
  name: 'bash',
  description: 'Execute a bash command on the machine and return stdout+stderr',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to run' },
    },
    required: ['command'],
  },
};

async function executeClaude(command, onChunk, onStatus, history) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in .env');

  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

  // Use conversation history if provided (multi-turn chat), otherwise start fresh
  const messages = history ? [...history] : [];
  messages.push({ role: 'user', content: command });

  if (onStatus) onStatus({ type: 'thinking' });

  // Agent loop: call API, execute tools, repeat until text response
  for (let turn = 0; turn < 15; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: getSystemPrompt(),
        messages,
        tools: [CLAUDE_BASH_TOOL],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json();

    // Collect text and tool_use blocks from response
    const textParts = [];
    const toolCalls = [];
    for (const block of data.content) {
      if (block.type === 'text') textParts.push(block.text);
      if (block.type === 'tool_use') toolCalls.push(block);
    }

    // Add assistant message to history
    messages.push({ role: 'assistant', content: data.content });

    // If no tool calls, we're done — stream final text
    if (data.stop_reason !== 'tool_use' || toolCalls.length === 0) {
      const finalText = textParts.join('') || '(no output)';
      if (textParts.length > 0) {
        if (onStatus) onStatus({ type: 'responding' });
        if (onChunk) onChunk(finalText);
      }
      // Sync conversation history back to caller for multi-turn
      if (history) {
        history.length = 0;
        for (const m of messages) history.push(m);
      }
      return finalText;
    }

    // Text alongside tool calls = reasoning/thinking text
    if (textParts.length > 0) {
      if (onStatus) onStatus({ type: 'thinking_text', text: textParts.join('') });
    }

    // Execute tool calls and send results back
    const toolResults = [];
    for (const call of toolCalls) {
      if (call.name === 'bash') {
        const cmd = call.input?.command || '';
        if (onStatus) onStatus({ type: 'tool_call', tool: 'bash', command: cmd });
        if (!process.env.JERIKO_CHAT_QUIET) console.log(`[claude] bash: ${cmd.slice(0, 100)}`);
        const result = runBash(cmd);
        if (onStatus) onStatus({ type: 'tool_result', tool: 'bash', command: cmd });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: result,
        });
      }
    }
    if (onStatus) onStatus({ type: 'thinking' });
    messages.push({ role: 'user', content: toolResults });
  }

  // Sync history even on max turns
  if (history) {
    history.length = 0;
    for (const m of messages) history.push(m);
  }
  return '(max tool call turns reached)';
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
    const result = require('child_process').spawnSync('bash', ['-c', command], {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
      env: process.env,
      cwd: path.join(__dirname, '..'),
    });
    let output = (result.stdout || '').trim();
    // Preserve SCREENSHOT: and FILE: markers from stderr so telegram.js can extract them
    const stderr = result.stderr || '';
    const markers = stderr.split('\n').filter(l => l.startsWith('SCREENSHOT:') || l.startsWith('FILE:'));
    if (markers.length > 0) {
      output = output + '\n' + markers.join('\n');
    }
    return output.slice(0, 10000);
  } catch (e) {
    const out = (e.stdout || '') + '\n' + (e.stderr || '');
    return (out.trim() || e.message).slice(0, 10000);
  }
}

async function executeOpenAI(command, onChunk, onStatus, history) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in .env');

  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  // Use conversation history if provided (multi-turn chat), otherwise start fresh
  // OpenAI format: system message first, then conversation
  const messages = [{ role: 'system', content: getSystemPrompt() }];
  if (history) {
    for (const m of history) messages.push(m);
  }
  messages.push({ role: 'user', content: command });

  if (onStatus) onStatus({ type: 'thinking' });

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
      if (onStatus) onStatus({ type: 'responding' });
      if (onChunk) onChunk(text);
      // Sync conversation history (skip system message at index 0)
      if (history) {
        history.length = 0;
        for (let i = 1; i < messages.length; i++) history.push(messages[i]);
      }
      return text;
    }

    // Text alongside tool calls = reasoning/thinking text
    if (msg.content && onStatus) {
      onStatus({ type: 'thinking_text', text: msg.content });
    }

    // Execute each tool call
    for (const call of msg.tool_calls) {
      if (call.function.name === 'bash') {
        let args;
        try { args = JSON.parse(call.function.arguments); } catch {
          args = { command: call.function.arguments };
        }
        const cmd = args.command || '';
        if (onStatus) onStatus({ type: 'tool_call', tool: 'bash', command: cmd });
        if (!process.env.JERIKO_CHAT_QUIET) console.log(`[openai] bash: ${cmd.slice(0, 100)}`);
        const result = runBash(cmd);
        if (onStatus) onStatus({ type: 'tool_result', tool: 'bash', command: cmd });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result,
        });
      }
    }
    if (onStatus) onStatus({ type: 'thinking' });
  }

  if (history) {
    history.length = 0;
    for (let i = 1; i < messages.length; i++) history.push(messages[i]);
  }
  return '(max tool call turns reached)';
}

// ========== LOCAL MODEL BACKEND (Ollama / LM Studio / any OpenAI-compatible) ==========

async function executeLocalModel(command, onChunk, onStatus, history) {
  // Verify the local server is reachable
  try {
    const ping = await fetch(`${LOCAL_MODEL_URL}/models`, { signal: AbortSignal.timeout(3000) });
    if (!ping.ok) throw new Error();
  } catch {
    throw new Error(`Local model server not reachable at ${LOCAL_MODEL_URL}. Is Ollama running? Start with: ollama serve`);
  }

  // Use conversation history if provided (multi-turn chat), otherwise start fresh
  const messages = [{ role: 'system', content: getSystemPrompt() }];
  if (history) {
    for (const m of history) messages.push(m);
  }
  messages.push({ role: 'user', content: command });

  if (onStatus) onStatus({ type: 'thinking' });

  // Agent loop: call local model, execute tools, repeat until text response
  // stream: false avoids the Ollama streaming bug that breaks tool_calls (OpenClaw Issue #5769)
  for (let turn = 0; turn < 15; turn++) {
    const headers = { 'Content-Type': 'application/json' };
    // Some local servers support optional API keys
    const localKey = process.env.LOCAL_API_KEY;
    if (localKey) headers['Authorization'] = `Bearer ${localKey}`;

    const res = await fetch(`${LOCAL_MODEL_URL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: LOCAL_MODEL,
        messages,
        tools: [BASH_TOOL],
        tool_choice: 'auto',
        max_tokens: 4096,
        stream: false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Local model error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const choice = data.choices[0];
    const msg = choice.message;

    // Add assistant message to history
    messages.push(msg);

    // If no tool calls, we're done — return the text
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const text = msg.content || '(no output)';
      if (onStatus) onStatus({ type: 'responding' });
      if (onChunk) onChunk(text);
      // Sync conversation history (skip system message at index 0)
      if (history) {
        history.length = 0;
        for (let i = 1; i < messages.length; i++) history.push(messages[i]);
      }
      return text;
    }

    // Text alongside tool calls = reasoning/thinking text
    if (msg.content && onStatus) {
      onStatus({ type: 'thinking_text', text: msg.content });
    }

    // Execute each tool call
    for (const call of msg.tool_calls) {
      if (call.function.name === 'bash') {
        let args;
        try { args = JSON.parse(call.function.arguments); } catch {
          args = { command: call.function.arguments };
        }
        const cmd = args.command || '';
        if (onStatus) onStatus({ type: 'tool_call', tool: 'bash', command: cmd });
        if (!process.env.JERIKO_CHAT_QUIET) console.log(`[local:${LOCAL_MODEL}] bash: ${cmd.slice(0, 100)}`);
        const result = runBash(cmd);
        if (onStatus) onStatus({ type: 'tool_result', tool: 'bash', command: cmd });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result,
        });
      }
    }
    if (onStatus) onStatus({ type: 'thinking' });
  }

  if (history) {
    history.length = 0;
    for (let i = 1; i < messages.length; i++) history.push(messages[i]);
  }
  return '(max tool call turns reached)';
}

module.exports = { route, parseCommand };
